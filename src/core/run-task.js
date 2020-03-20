const request = require('request');
const https = require('https');
const AWS = require('aws-sdk');
const { logger } = require('@bblabs/knapsack');

const sns = new AWS.SNS({ region: process.env.AWS_REGION || 'us-east-1' });

const setTaskStatus = async (taskId, status) => {
    return await new Promise((resolve, reject) => {
        tasks.setStatus(taskId, status, (err, data) => {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
};

const updateTask = async (taskId, data) => {
    return await new Promise((resolve, reject) => {
        tasks.updateTask(taskId, data, (err, res) => {
            if (err) {
                logger.error('[RUNNER] Error occurred updating task', {
                    error: err,
                    data: res,
                    id: taskId
                });
                reject(err);
            } else {
                logger.info('[RUNNER] successfully updated task', { id: taskId });
                resolve(res);
            }
        });
    });
};

const runTaskWithUrlAndPayload = async (task) => {
    const options = {
        method: 'POST',
        headers: {'Content-Type' : 'application/json'},
        url: task.url
    };

    try {
        var jsonString = JSON.stringify(x);
        var jsonData = JSON.parse(jsonString);
        options.json = jsonData;
    } catch (e) {
        logger.error('[CHILD] http request error', { error: e });
    }

    if (!options.json) {
        throw new Error('Http request error, is not json data', { task });
    }

    return await new Promise((resolve, _) => {
        request(options, function(err, res, body) {
            if (err) {
                logger.error('[CHILD] http request error', { error: err });
                resolve({
                    result: '[CHILD] HTTP Request Error'+err,
                    error: true
                })
            } else {
                resolve({
                    result: res,
                    error: false
                });
            }
        });
    });
};

const runTaskWithUrl = async (task) => {
    return await new Promise((resolve, _) => {
        const httpRequest = https.get(task.url, (res) => {
            var body = [];

            res.on('data', (chunk) => {
                body.push(chunk);
            }).on('end', () => {
                body = body.toString();
                resolve({
                    result: body,
                    error: false
                });
            });
        });
        httpRequest.end();
        httpRequest.on('error', (err) => {
            logger.error('[CHILD] http requset error', { error: err });
            resolve({
                result: '[CHILD] HTTP Request Error'+err,
                error: true
            });
        });
    });
};

const runTaskWithSnsTarget = async (task) => {
    const parameters = {
        TargetArn: task.snsTarget,
        Message: JSON.stringify(task.payload),
        Subject: 'SnoozeNotification'
    };
    return await new Promise((resolve, _) => {
        sns.publish(parameters, (err, data) => {
            if (err) {
                logger.error('[CHILD] error while trying to publish SNS message', { error: err });
                resolve({
                    result: 'Error while trying to publish SNS Message... '+err,
                    error: true
                });
            } else {
                resolve({
                    result: 'Published SNS Message; '+JSON.stringify(data),
                    error: false
                });
                process.exit(0);
            }
        });
    });
};


const runTask = async (task) => {
    if (!task) {
        return true;
    }

    try {
        // set the status to running
        await setTaskStatus(task.id, tasks.RUNNING);
    } catch (err) {
        logger.error('[RUNNER] Error occurred updating status before run', {
            id: task.id,
            error: err,
            data                 
        });
    }

    logger.info('[CHILD] received a message', { task });

    let data = null;
    try {
        if (task.url && task.payload) {
            data = await runTaskWithUrlAndPayload(task);
        } else if (task.url) {
            data = await runTaskWithUrl(task);
        } else if (task.snsTarget) {
            data = await runTaskWithSnsTarget(task);
        } else {
            data = {
                result: 'not sure which task to run ' + task,
                error: true,
                unknown: true
            }
        }
    } catch (err) {
        logger.error('[CHILD] exception occurred', { error: err, task });
        result = {
            result: 'Exception occurred in child' + err,
            error: true
        };        
    }

    if (data.result) {
        try {
            await updateTask(task.id, { result: data.result });
        } catch (err) {
            logger.error('error updating task', { error: err, id: task.id, data });
        }
    }

    let code = 0;
    if (data.error) {
        code = tasks.ERROR;
    } else if (data.unknown) {
        code = tasks.UNKNOWN;
    }

    try {
        if (code === 0) {
            logger.info('child exited successfully', { id: task.id, data });
            await setTaskStatus(task.id, tasks.SUCCESS);
        } else {
            await setTaskStatus(task.id, code);
        }
    } catch (err) {
        logger.error('[RUNNER] error saving final task status', {
            id: task.id,
            error: err,
            data
        });
    }
};

module.exports = {
    runTask
};
