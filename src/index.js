const {
    configurePipelineMetricSender,
    logger
} = require('@bblabs/knapsack');

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

process.on('uncaughtException',function(err){
    try {
        if (err.message.indexOf('ECONNRESET') == -1) {
            logger.error('[INDEX] uncaughtException', { error: err, errorMessage: err.message });
        }
    } catch (e) {
        console.error('[INDEX] uncaughtException Exception '+e);
    }
});

logger.info('Snooze Started Successfully!');
