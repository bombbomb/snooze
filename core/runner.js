var urlParser   = require('url');
var path        = require('path');
var logger      = require('../util/logger');
var tasks       = require('./tasks');
var fork        = require('child_process').fork;

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
            logger.logError('[RUNNER] startTasksToRun; '+err);
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
                    logger.logError('[RUNNER] '+task.id+' Error occurred updating status before run; '+err,data);
                }

                var modulePath = __dirname+path.sep+'runtask';
                if (process.env.TEST_RUNNER) {
                    modulePath = './core/runtask';
                }
                var childProcess = fork(modulePath);
                childProcess.send( task );
                childProcess.on('message', function(data) {

                    // this will be logged
                    logger.logInfo('[RUNNER] '+task.id+' message received from child;',data);
                    if (data.result)
                    {
                        tasks.updateTask(task.id, data, function(err,data){
                            err && logger.logError('[RUNNER] '+task.id+' Error occurred updating task; '+err,data);
                        });
                    }

                });
                childProcess.on('error', function(err) {

                    logger.logError('[RUNNER] '+task.id+' child process error; '+err);
                    if (err)
                    {
                        tasks.updateTask(task.id, { error: err });
                    }

                });
                childProcess.on('close', function(code) {

                    if (code)
                    {
                        // might need to clean-up tasks if it didn't exit successfully
                        logger.logWarning('[RUNNER] '+task.id+' child process exited with code '+code);
                        tasks.setStatus(task.id, code, function(err,data){
                            if (err)
                            {
                                logger.logWarning("[RUNNER] child runtask exit status set; FAILED; "+err, data);
                            }
                        });
                    }
                    else
                    {
                        tasks.setStatus(task.id, tasks.SUCCESS, function(err,data){
                            if (err)
                            {
                                logger.logInfo("[RUNNER] child runtask exit status set; FAILED; "+err, data);
                            }
                            else
                            {
                                logger.logWarning('[RUNNER] '+task.id+' child process exited, all good');
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
        logger.logError('[RUNNER] Start called with no task');
    }

};

module.exports = new Runner();