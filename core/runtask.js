
try
{
    var https       = require('https');
    var request     = require('request');
    var AWS         = require('aws-sdk');
    var logger      = require('./../util/logger');
    var tasks       = require('./tasks');

    var snsParameters = { region: process.env.AWS_REGION };
    if (process.env.AWS_ACCESS_KEY)
    {
        snsParameters.accessKeyId = process.env.AWS_ACCESS_KEY;
        snsParameters.secretAccessKey = process.env.AWS_SECRET_KEY;
    }

    var sns = new AWS.SNS(snsParameters);
}
catch (e)
{
    logger.logError('[CHILD] Failed on Inital Setup : '+e);
    console.error('[CHILD] Failed on Inital Setup: '+e);
    process.send({ result: '[CHILD] Failed on Inital Setup '+e });
}

process.on('uncaughtException', function(err) {
    logger.logError('[CHILD] uncaughtException: '+err.message);
    console.error('[CHILD] uncaughtException: '+err);
    process.send({ result: '[CHILD] uncaughtException: '+err.message });
    process.exit(tasks.ERROR);
});

process.on('message', function(task){

    logger.logInfo('[CHILD] received a message', task);

    try {

        if (task && task.url && task.payload)
        {

            var options = {
                method: 'POST',
                headers: {'Content-Type' : 'application/json'},
                url: task.url
            };

            function isJson(request) {
                try {
                    var jsonString = JSON.stringify(request);
                    var jsonData = JSON.parse(jsonString);
                    options.json = jsonData;
                } catch (e) {
                    logger.logError('[CHILD] HTTP Request Error: '+e);
                    return false;
                }
                return true;
            }

            if(isJson(task.payload))
            {
                request(options, function(e, res, body) {
                    if (e)
                    {
                        logger.logError('[CHILD] HTTP Request Error: '+e);
                        process.send({ result: '[CHILD] HTTP Request Error'+e });
                        process.exit(tasks.ERROR);
                    }
                    else
                    {
                        process.send({ result: res});
                        process.exit(0);
                    }
                });
            }
            else
            {
                process.send({ result: '[CHILD] HTTP Request Error'+e });
                process.exit(tasks.ERROR);
            }
        }
        else if (task && task.url)
        {
            var httpRequest = https.get(task.url, function(res) {

                var body = [];

                res.on('data', function(chunk) {
                    body.push(chunk);
                }).on('end', function() {
                    body = body.toString();
                    //console.log(body);
                    process.send({ result: body });
                    process.exit(0);
                });

            });
            httpRequest.end();
            httpRequest.on('error', function(e) {

                logger.logError('[CHILD] HTTP Request Error: '+e);
                process.send({ result: '[CHILD] HTTP Request Error'+e });
                process.exit(tasks.ERROR);

            });

        }
        else if (task.snsTarget)
        {
            var parameters = {
                TargetArn: task.snsTarget,
                Message: JSON.stringify(task.payload),
                Subject: 'SnoozeNotification'
            };
            sns.publish(parameters,function(err, data){
                if (err)
                {
                    logger.logError('[CHILD] Error while trying to publish SNS Message... '+err);
                    process.send({ result: 'Error while trying to publish SNS Message... '+err });
                    process.exit(tasks.ERROR);
                }
                else
                {
                    process.send({ result: 'Published SNS Message; '+JSON.stringify(data) });
                    process.exit(0);
                }
            });
        }
        else
        {
            process.send({ result: 'not sure which task to run '+task });
            process.exit(tasks.UNKNOWN);
        }

    }
    catch (e)
    {
        logger.logError('[CHILD] Exception occurred '+e);
        process.send({ result: 'Exception occurred in child '+e });
        process.exit(tasks.ERROR);
    }

});



