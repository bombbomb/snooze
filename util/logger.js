const Logger = require('@bblabs/mindfulness').Logger;

const layers = ['console'];

if (process.env.LOGGER_HOST) {
    layers.push({
        type: 'json_post',
        host: process.env.LOGGER_HOST,
        dataDefaults: { xsrc: 'snooze' },
        // turn off LOG_INFO
        logLevel: Logger.LOG_LEVELS.LOG_LOG | Logger.LOG_LEVELS.LOG_ERROR | Logger.LOG_LEVELS.LOG_WARN
    });
}

const logger = new Logger(layers);

module.exports = logger;
