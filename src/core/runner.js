var urlParser   = require('url');
var path        = require('path');
var tasks       = require('./tasks');
var fork        = require('child_process').fork;
const { logger } = require('@bblabs/knapsack')

var seekInterval = ((process.env.RUN_INTERVAL || 5) * 1000); // 5 second default

function Runner()
{
    var me = this;
    var runTimer = setInterval(function(){
        me.startTasksToRun();
    }, seekInterval);
}

Runner.prototype.startTasksToRun = function()
{
    var me = this;
    tasks.getTasksToRun(function(err,data){
        if (!err)
        {
            var tasks = data.Items;
            for (var i = 0; i < tasks.length; i++)
            {
                me.startTask(tasks[i]);
            }
        }
        else
        {
            logger.error('[RUNNER] startTasksToRun error', { error: err });
        }
    });

};

Runner.prototype.startTask = function(task)
{

    if (task)
    {

        try
        {

            tasks.setStatus(task.id, tasks.RUNNING, function(err, data) {

                if (err)
                {
                    logger.error('[RUNNER] Error occurred updating status before run', {
                        id: task.id,
                        error: err,
                        data
                    });
                }

                var modulePath = __dirname+path.sep+'runtask';
                if (process.env.TEST_RUNNER) {
                    modulePath = './core/runtask';
                }
                var childProcess = fork(modulePath);
                childProcess.send( task );
                childProcess.on('message', function(data) {
                    logger.info('[RUNNER] Message received from child', {
                        data,
                        id: task.id
                    });

                    if (data.result)
                    {
                        tasks.updateTask(task.id, data, function(err,data){
                            if (err) {
                                logger.error('[RUNNER] Error occurred updating task', {
                                    error: err,
                                    data,
                                    id: task.id
                                });
                            }
                        });
                    }
                });

                childProcess.on('error', function(err) {
                    logger.error('[RUNNER] child process error', {
                        error: err,
                        id: task.id
                    });
                    if (err) {
                        tasks.updateTask(task.id, { error: err });
                    }
                });

                childProcess.on('close', function(code) {

                    if (code)
                    {
                        // might need to clean-up tasks if it didn't exit successfully
                        logger.warn('[RUNNER] child process exited with code', {
                            code,
                            id: task.id
                        });
                        tasks.setStatus(task.id, code, function(err,data){
                            if (err)
                            {
                                logger.warn('[RUNNER] child runtask exit status set; FAILED', {
                                    error: err,
                                    data,
                                    id: task.id
                                });
                            }
                        });
                    }
                    else
                    {
                        tasks.setStatus(task.id, tasks.SUCCESS, function(err,data){
                            if (err) {
                                logger.info('[RUNNER] child runtask exit status set', {
                                    error: err,
                                    data,
                                    id: task.id
                                });
                            } else {
                                logger.warn('[RUNNER] child process exited, all good... wat?', {
                                    id: task.id
                                });
                            }
                        });
                    }

                });
            });

        }
        catch (e)
        {
            console.error(e);
            tasks.updateTask(task.id, { error: e });
        }
    }
    else
    {
        logger.error('[RUNNER] start called with no task');
    }

};

module.exports = new Runner();