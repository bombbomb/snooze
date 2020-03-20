const app = require('express')();
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const user = require('./util/user');
const tasks = require('./core/tasks');
const snsMap = require('./core/snsMap');

app.enable('trust proxy');
app.use(bodyParser.urlencoded({ extended: false, limit: '50mb' }));
app.use(bodyParser.json({limit: '50mb'}));
app.use(cookieParser());
app.use(function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,BB-JWT,Authorization');
    res.setHeader('Access-Control-Allow-Credentials', true);
    next();
});

app.get('/', function (req, res, next) {
    returnSuccess(res,'Snooze is up.');
});

app.post('/snsTarget', function(req, res, next) {
    user.authenticate(req, res, function(clientId){
        if (!req.clientId) {
            returnErrorJson(res, 'User Authentication failed');
            return;
        }
        snsMap.addTarget(req.body,function(err,taskInfo) {
            if (err) {
                returnErrorJson(res, 'Error adding target; '+err);
            } else {
                returnSuccessJson(res, {message: 'SNS Target Added for '+taskInfo.taskType });
            }
        });
    });
});

app.get('/snsTarget/:taskType', function(req, res, next) {
    user.authenticate(req, res, function(clientId) {
        if (!req.clientId) {
            returnErrorJson(res, 'User Authentication failed');
            return;
        }
        snsMap.getTarget(req.params.taskType,function(err,snsTargets){
            if (err) {
                returnErrorJson(res, 'Error occurred retrieving snsTargets; '+err);
            } else {
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

    var addTask = (task) => {
        tasks.checkForDuplicateRefId(task.refId, function(err, exists) {
            if (err) {
                returnErrorJson(res, err);
                return;
            }

            tasks.addTask(task,function(err,taskId) {
                if (err) {
                    logger.error('Error occurred adding a task', { error: err, task });
                    incrementPipelineSubMetric('addTask', 'fail');
                    returnErrorJson(res, err);
                } else {
                    incrementPipelineSubMetric('addTask', 'success');
                    returnSuccessJson(res, { id: taskId, success: true, message: 'Task added' });
                }
            });
        });
    };

    user.authenticate(req, res, function(clientId) {
        if (!req.clientId) {
            returnErrorJson(res, 'User Authentication failed');
            return;
        }

        // check requirements for adding a thing
        const isValid = typeof task === 'object' || (typeof task === 'string' && isJSON(task));

        if (!isValid) {
            returnError(res, 'no task specified, or not a valid object?!');
            return;
        }

        try {
            if (typeof task == 'string') {
                task = JSON.parse(task);
            }

            if (!task.snsTask) {
                addTask(task);
                return;
            }

            snsMap.getTarget(task.snsTask,function(err,taskInfo){
                if (err) {
                    logger.error('Failed to retrieve snsTask Target', { task: task.snsTask, error: err });
                    returnError(res, 'Failed to retrieve snsTask Target for '+task.snsTask);
                    return;
                }
                if (typeof taskInfo == 'undefined' || !taskInfo.snsTarget)
                {
                    logger.error('No snsTask Target exists for task', { task: task.snsTask })
                    returnError(res, 'No snsTask Target exists for '+task.snsTask);
                    return;
                }

                task = Object.assign(task,{ snsTarget: taskInfo.snsTarget });
                delete task.snsTask;
                addTask(task);
            });
        }
        catch (e)
        {
            logger.error('Exception occurred adding task', { error: e });
            returnError(res, 'Add Task Failed; '+e.message);
        }
    });
});

app.put('/cancel/:id', function (req, res, next) {
    tasks.getTask(req.params.id, function(err, data) {
        if (err) {
            returnErrorJson(res, 'Error retrieving from DB');
            return;
        }

        if(!data) {
            returnErrorJson(res, 'Task does not exist');
            return;
        }

        tasks.setStatus(req.params.id, tasks.CANCELED, function (err, data) {
            if (err) {
                returnErrorJson(res, err);
            } else {
                returnSuccessJson(res, {task: data.Attributes, success: true, message: 'Task Status Updated'});
            }
        });
    });
});

app.get('/is/:id', function(req, res, next) {
    tasks.getTask(req.params.id, function(err, data){
        if(err) {
            returnErrorJson(res, 'Error retrieving task')
            return;
        }

        if(!data) {
            returnErrorJson(res, 'Task does not exist');
            return;
        }

        returnSuccessJson(res, {task: data, success: true, message: 'Task Found'})
    });

});

app.get('/isbyref/:refid', function(req, res, next) {
    tasks.getTaskByRef(req.params.refid, function(err, data){
        if(err) {
            returnErrorJson(res, 'Error retrieving task');
            return;
        }

        try {
            if(data.Items.length === 0) {
                returnNotFound(res, 'Task does not exist');
                return;
            }
            returnSuccessJson(res, {task: data.Items[0], success: true, message: 'Task Found'});
        } catch (e) {
            logger.error('error checking to see if data items has length', { data, error: e });
            returnErrorJson(res, e.message);
        }
    });
});

app.get('/tasks/:clientid', function(req, res, next) {
    tasks.getTasksByClient(req.params.clientid, function(err, data) {
        if (err) {
            returnErrorJson(res, 'Error retrieving tasks');
            return;
        }
        try {
            if (data.Items.length === 0) {
                returnNotFound(res, 'No tasks for that client');
            } else {
                returnSuccessJson(res, {tasks : data.Items, success: true, message: 'Tasks Found'});
            }
        } catch(e) {
            returnErrorJson(res, e.message);
        }
    });

});

app.get('/tasks/:clientid/status/:taskstatus', function(req, res, next) {

    var taskStatus = parseInt(req.params.taskstatus);
    var clientId = req.params.clientid;

    tasks.getClientTasksByStatus(taskStatus, clientId, function(err, data) {
        if (err) {
            returnErrorJson(res, 'Error retrieving tasks');
            return;
        }
        try {
            if (data.Items.length === 0) {
                returnNotFound(res, 'No tasks for that client/with that status');
            } else {
                returnSuccessJson(res, {tasks : data.Items, success: true, message: 'Tasks Found'});
            }
        } catch(e) {
            returnErrorJson(res, e.message);
        }
    });

});

app.get('/health-check', function(req, res, next) {
    // TODO kopp
    if(typeof child !== 'undefined' && child) {
        returnSuccessJson(res, {message : 'Snooze is happy, Runner is up'});
    } else {
        returnErrorJson(res, 'Snooze is sad, Runner is down right now');
    }

});

app.get('/status-codes', function(req, res, next) {
    var taskStatuses = {
        PENDING: tasks.PENDING,
        QUEUED: tasks.QUEUED,
        RUNNING: tasks.RUNNING,
        CANCELED: tasks.CANCELED,
        ERROR: tasks.ERROR,
        SUCCESS: tasks.SUCCESS,
        UNKNOWN: tasks.UNKNOWN
    };
    returnSuccessJson(res, {message: 'Task Statuses', status: taskStatuses });
});

app.put('/task/:id', function(req, res, next) {
    var newTaskInfo = req.body.task;
    console.info('Task info being updated : ', newTaskInfo);

    if (typeof newTaskInfo == 'string') {
        newTaskInfo = JSON.parse(newTaskInfo);
    }

    tasks.updateTask(req.params.id, newTaskInfo,function(err, data) {
        if(err) {
            returnErrorJson(res, 'Task not updated correctly');
        } else {
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

module.exports = {
    app
};
