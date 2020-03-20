var forever         = require('forever');
var urlHelper       = require('url');
var _               = require('underscore');
var guid            = require('guid');
var bbJWT           = require("bbjwt-client");

var AWS             = require('aws-sdk');
var crypto          = require('crypto');

const {
    configurePipelineMetricSender,
    incrementPipelineSubMetric,
    logger
} = require('@bblabs/knapsack');

var snsMap          = require('./core/snsMap');
var tasks           = require('./core/tasks');

var runner          = require('./core/runner');
var user            = require('./util/user');
const { sqsProcessFunction } = require('./sqs');
const { app } = require('./app');

configurePipelineMetricSender({
    appName: 'snooze',
    enableBuffer: false
});

var sqsProcessorOptions = {
    tableName: process.env.ENVIRONMENT + '_SnoozeSQSWatcher',
    logger: function(message,payload) {
        logger.info('sqsProcessor Message Error', { sqsMessage: message, payload });
    },
    maxNumberOfMessages: process.env.MAX_SQS_MESSAGE,
    concurrency: process.env.SQS_WATCHERS,
    useLegacyDynamo: process.env.TEST_RUNNER
};

var sqsWatcher = new (require('sasquatcha'))(sqsProcessorOptions);
sqsWatcher.start(sqsProcessFunction);

const port = Number(process.env.IP_ADDRESS || 80);
app.listen(port, (err) => {
    if (err) {
        logger.error('error starting server', { error: err });
    } else {
        logger.info('listening on port', { port });
    }
});

//var SERVERID = uuid.v4();

process.on('uncaughtException',function(err){
    try {
        if (err.message.indexOf('ECONNRESET') == -1) {
            logger.error('[INDEX] uncaughtException', { error: err, errorMessage: err.message });
        }
    } catch (e) {
        console.error('[INDEX] uncaughtException Exception '+e);
    }
});


/* start task runner process */

function runnerExited()
{
    logger.error('WARNING: Snooze main runner exited! Was this expected?');
}
function runnerStarted()
{
    console.log('Task Runner Started');
}

// var child = new(forever.Forever)('core/runner.js', {
//     max: 3,
//     silent: true,
//     args: []
// });

// child.on('start', runnerStarted);
// child.on('exit', runnerExited);
// child.start();

for (var i = 0; i < 3; i++) {
    console.log('starting runner...');
    var f = require('./core/runner.js');
}

logger.info('Snooze Started Successfully!');
