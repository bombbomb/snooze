var app             = require('express')();
var forever         = require('forever');
var bodyParser      = require("body-parser");
var cookieParser    = require('cookie-parser');
var urlHelper       = require('url');
var _               = require('underscore');
var guid            = require('guid');
var bbJWT           = require("bbjwt-client");

var AWS             = require('aws-sdk');
var crypto          = require('crypto');

var logger          = require('./util/logger');
var sdc             = require('./util/metrics');

var snsMap          = require('./core/snsMap');
var tasks           = require('./core/tasks');

var runner          = require('./core/runner');
var user            = require('./util/user');

var sqsProcessorOptions = {
    tableName: process.env.ENVIRONMENT + '_SnoozeSQSWatcher',
    logger: function(message,payload,type) {
        if (type)
        {
            logger.log('sqsProcessor Message Error '+message,type.toUpperCase(),payload);
        }
        else
        {
            logger.log('sqsProcessor Message Error '+message, 'LOG', payload);
        }
    },
    maxNumberOfMessages: process.env.MAX_SQS_MESSAGE,
    concurrency: process.env.SQS_WATCHERS,
    useLegacyDynamo: process.env.TEST_RUNNER
};

var sqsWatcher = new (require('sasquatcha'))(sqsProcessorOptions);

//var SERVERID = uuid.v4();

process.on('uncaughtException',function(err){
    try
    {
        if (err.message.indexOf('ECONNRESET') == -1)
        {
            logger.logError('[INDEX] uncaughtException: ' + err.message);
        }
    }
    catch (e)
    {
        console.error('[INDEX] uncaughtException Exception '+e);
    }
    //process.exit(1);
});


app.listen(process.env.IP_ADDRESS || 80);

app.enable('trust proxy');
app.use(bodyParser.urlencoded({ extended: false, limit: '50mb' }));
app.use(bodyParser.json({limit: '50mb'}));
app.use(cookieParser());
app.use(function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,BB-JWT');
    res.setHeader('Access-Control-Allow-Credentials', true);
    next();
});

app.get('/', function (req, res, next) {
    returnSuccess(res,'Snooze is up.');
});

app.post('/snsTarget', function(req, res, next){

    user.authenticate(req, res, function(clientId){
        if (!clientId)
        {
            returnErrorJson(res, 'User Authentication failed');
        }
        snsMap.addTarget(req.body,function(err,taskInfo){
            if (err)
            {
                returnErrorJson(res, 'Error adding target; '+err);
            }
            else
            {
                returnSuccessJson(res, {message: 'SNS Target Added for '+taskInfo.taskType });
            }
        });
    });

});

app.get('/snsTarget/:taskType', function(req, res, next){

    user.authenticate(req, res, function(clientId) {
        if (!clientId)
        {
            returnErrorJson(res, 'User Authentication failed');
        }
        snsMap.getTarget(req.params.taskType,function(err,snsTargets){
            if (err)
            {
                returnErrorJson(res, 'Error occurred retrieving snsTargets; '+err);
            }
            else
            {
                returnSuccessJson(res, snsTargets);
            }
        });
    });

});

app.post('/add', function (req, res, next) {

    var task = req.body.task;
    var isJSON = function(str) {
        try {
            JSON.parse(str);
        } catch (e) {
            return false;
        }
        return true;
    };

    var addTask = function(task) {
        tasks.checkForDuplicateRefId(task.refId, function(err, exists) {
            if (err)
            {
                returnErrorJson(res, err);
            }
            else
            {
                tasks.addTask(task,function(err,taskId){
                    if (err)
                    {
                        logger.logError('Error occurred adding a task: '+err,task);
                        sdc.incrMetric('addTaskError');
                        returnErrorJson(res, err);
                    }
                    else
                    {
                        sdc.incrMetric('addTaskSuccess');
                        returnSuccessJson(res, { id: taskId, success: true, message: 'Task added' });
                    }

                });
            }
        });
    };

    user.authenticate(req, res, function(clientId){

        if (!clientId)
        {
            returnErrorJson(res, 'User Authentication failed');
        }
        // check requirements for adding a thing
        if (typeof task == 'object' || (typeof task == 'string' && isJSON(task)) )
        {

            try
            {
                if (typeof task == 'string')
                {
                    task = JSON.parse(task);
                }

                if (task.snsTask)
                {
                    snsMap.getTarget(task.snsTask,function(err,taskInfo){
                        if (err)
                        {
                            logger.logError('Failed to retrieve snsTask Target for '+task.snsTask,err);
                            returnError(res, 'Failed to retrieve snsTask Target for '+task.snsTask);
                        }
                        else if (typeof taskInfo == 'undefined' || !taskInfo.snsTarget)
                        {
                            logger.logError('No snsTask Target exists for '+task.snsTask,err);
                            returnError(res, 'No snsTask Target exists for '+task.snsTask);
                        }
                        else
                        {
                            task = Object.assign(task,{ snsTarget: taskInfo.snsTarget });
                            delete task.snsTask;
                            addTask(task);
                        }
                    });
                }
                else
                {
                    addTask(task);
                }
            }
            catch (e)
            {
                logger.logError('Exception occurred adding task ',e);
                returnError(res, 'Add Task Failed; '+e.message);
            }

        }
        else
        {
            returnError(res, 'no task specified, or not a valid object?!');
        }

    });

});

app.put('/cancel/:id', function (req, res, next) {

    tasks.getTask(req.params.id, function(err, data) {
        if (err)
        {
            returnErrorJson(res, 'Error retrieving from DB');
        }
        else
        {
            if(!data)
            {
                returnErrorJson(res, 'Task does not exist');
            }
            else
            {
                tasks.setStatus(req.params.id, tasks.CANCELED, function (err, data) {
                    if (err)
                    {
                        returnErrorJson(res, err);
                    }
                    else
                    {
                        returnSuccessJson(res, {task: data.Attributes, success: true, message: 'Task Status Updated'});
                    }
                });
            }
        }
    });
});

app.get('/is/:id', function(req, res, next) {

    tasks.getTask(req.params.id, function(err, data){
        if(err)
        {
            returnErrorJson(res, 'Error retrieving task')
        }
        else
        {
            if(!data)
            {
                returnErrorJson(res, 'Task does not exist');
            }
            else
            {
                returnSuccessJson(res, {task: data, success: true, message: 'Task Found'})
            }
        }
    });

});

app.get('/isbyref/:refid', function(req, res, next) {

    tasks.getTaskByRef(req.params.refid, function(err, data){
        if(err)
        {
            returnErrorJson(res, 'Error retrieving task');
        }
        else
        {
            try
            {
                if(data.Items.length === 0)
                {
                    returnNotFound(res, 'Task does not exist');
                }
                else
                {
                    returnSuccessJson(res, {task: data.Items[0], success: true, message: 'Task Found'});
                }
            }
            catch (e)
            {
                returnErrorJson(res, e.message);
            }
        }
    });

});

app.get('/tasks/:clientid', function(req, res, next) {

    tasks.getTasksByClient(req.params.clientid, function(err, data) {
        if (err)
        {
            returnErrorJson(res, 'Error retrieving tasks');
        }
        else
        {
            try
            {
                if (data.Items.length === 0)
                {
                    returnNotFound(res, 'No tasks for that client');
                }
                else
                {
                    returnSuccessJson(res, {tasks : data.Items, success: true, message: 'Tasks Found'});
                }
            }
            catch(e)
            {
                returnErrorJson(res, e.message);
            }
        }
    });

});

app.get('/tasks/:clientid/status/:taskstatus', function(req, res, next) {

    var taskStatus = parseInt(req.params.taskstatus);
    var clientId = req.params.clientid;

    tasks.getClientTasksByStatus(taskStatus, clientId, function(err, data) {
        if (err)
        {
            returnErrorJson(res, 'Error retrieving tasks');
        }
        else
        {
            try
            {
                if (data.Items.length === 0)
                {
                    returnNotFound(res, 'No tasks for that client/with that status');
                }
                else
                {
                    returnSuccessJson(res, {tasks : data.Items, success: true, message: 'Tasks Found'});
                }
            }
            catch(e)
            {
                returnErrorJson(res, e.message);
            }
        }
    });

});

app.get('/health-check', function(req, res, next) {

    if(child)
    {
        returnSuccessJson(res, {message : 'Snooze is happy, Runner is up'});
    }
    else
    {
        returnErrorJson(res, 'Snooze is sad, Runner is down right now');
    }

});

app.get('/status-codes', function(req, res, next) {

    var taskStatuses = { PENDING: tasks.PENDING, QUEUED: tasks.QUEUED, RUNNING: tasks.RUNNING, CANCELED: tasks.CANCELED, ERROR: tasks.ERROR, SUCCESS: tasks.SUCCESS, UNKNOWN: tasks.UNKNOWN  };
    returnSuccessJson(res, {message: 'Task Statuses', status: taskStatuses });

});

app.put('/task/:id', function(req, res, next) {

    var newTaskInfo = req.body.task;
    console.info('Task info being updated : ', newTaskInfo);

    if (typeof newTaskInfo == 'string')
    {
        newTaskInfo = JSON.parse(newTaskInfo);
    }

    tasks.updateTask(req.params.id, newTaskInfo,function(err, data) {
        if(err)
        {
            returnErrorJson(res, 'Task not updated correctly');
        }
        else
        {
            returnSuccessJson(res, {task : data.Attributes, success: true, message: 'Task successfully Updated'});
        }

    });

});

function returnError(res,err)
{
    res.status(500).send('crap '+err).end();
}

function returnErrorJson(res,message,data)
{
    data = data || null;
    res.status(500).json({message : message, data:data, success: false}).end();
}

function returnNotFound(res, message, data)
{
    data = data || null;
    res.status(404).json({ message : message, data : data, success : false}).end();
}

function returnSuccess(res,msg)
{
    res.status(200).end(msg);
}

function returnSuccessJson(res,result)
{
    res.status(200).json(result).end();
}

/* start task runner process */

function runnerExited()
{
    logger.logError('WARNING: Snooze main runner exited! Was this expected?');
}
function runnerStarted()
{
    console.log('Task Runner Started');
}

var child = new(forever.Forever)('core/runner.js', {
    max: 3,
    silent: true,
    args: []
});

child.on('start', runnerStarted);
child.on('exit', runnerExited);
child.start();

sqsWatcher.start(function(err, queueData, event, onComplete){

    try
    {
        if (err)
        {
            throw new Error(err);
        }
        else
        {
            var sqsBody = JSON.parse(event.message.Body);
            var sqsMessage = JSON.parse(sqsBody.Message);
            var eventType = '';

            if (event.name.indexOf('ReminderCancellations') != -1)
            {
                var eventMapDetail = null;
                if (typeof queueData.eventMap != 'undefined') {
                    for (var map in queueData.eventMap)
                    {
                        if (!queueData.eventMap.hasOwnProperty(map)) continue;
                        eventMapDetail = queueData.eventMap[map];
                        eventType = sqsMessage[eventMapDetail.eventField];
                        if (sqsMessage[eventMapDetail.eventField] == eventMapDetail.eventValue)
                        {
                            break;
                        }
                    }
                }

                if (eventMapDetail !== null)
                {
                    if (typeof sqsMessage.event != 'undefined')
                    {
                        sqsMessage = sqsMessage.event;
                    }
                    var reminderTaskId = sqsMessage[eventMapDetail.idField];

                    if (typeof reminderTaskId != 'undefined' && reminderTaskId.indexOf(':') != -1)
                    {
                        reminderTaskId = reminderTaskId.split(':')[1];
                    }

                    if (typeof reminderTaskId != 'undefined' && reminderTaskId.length)
                    {
                        reminderTaskId = 'rem'+reminderTaskId;
                        logger.logInfo('Fetching Reminder Task by RefId to Cancel '+reminderTaskId);
                        tasks.getTaskByRef(reminderTaskId,function(err,task){
                            if (!err && task.Count > 0)
                            {
                                var taskDetail = task.Items[0];
                                if (taskDetail)
                                {
                                    tasks.setStatus(taskDetail.id, tasks.SUCCESS, function(err, data){
                                        err && logger.logError('Failed to cancel Reminder for Opened Email: '+taskDetail.id,taskDetail);
                                        !err && logger.logInfo('Canceled Reminder for Opened Email: '+taskDetail.id,taskDetail);
                                        onComplete(err,null);
                                    });
                                    return;
                                }
                                logger.logInfo('Fetching Reminder Task by RefId to Cancel '+reminderTaskId,taskDetail);
                                onComplete('No Task detail, unable to update status for '+ reminderTaskId, null);
                            }
                            else
                            {
                                if (err)
                                {
                                    logger.logError('sqsProcessor failed to fetch task '+reminderTaskId+': '+err);
                                }
                                else
                                {
                                    logger.logInfo('No task to update for '+reminderTaskId);
                                    err = null;
                                }
                                onComplete(err, null);
                            }
                        });
                    }
                    else
                    {
                        logger.logError('Unable to find RefId for message, type '+eventType, sqsMessage);
                        onComplete(null, null);
                    }

                }
                else
                {
                    logger.logError('Unable to find event map for event', sqsMessage);
                    onComplete('Unable to find event map for event', null);
                }

            }
            else
            {
                onComplete(null, null);
            }
        }
    }
    catch (e)
    {
        logger.logError('SQSWatcher Exception: ' + e.message, e.stack);
        onComplete(e.message, null);
    }

});

if (process.env.TEST_RUNNER)
{
    module.exports = { app: app, runner: child };
}

logger.logWarning('Snooze Started Successfully!');
