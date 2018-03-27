const Logger = require('@bblabs/mindfulness').Logger;

const layers = ['console'];

if (process.env.LOGGER_HOST) {
    layers.push({
        type: 'json_post',
        host: process.env.LOGGER_HOST,
        dataDefaults: { xsrc: 'snooze' }
    });
}

const logger = new Logger(layers);

module.exports = logger;
