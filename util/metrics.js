const Metrics = require('@bblabs/mindfulness').Metrics;

const layers = [];

if (process.env.METRICS_HOST) {
    layers.push({
        type: 'json_post',
        host: process.env.METRICS_HOST,
        dataDefaults: { xsrc: 'snooze' },
        paths: {
            increment: '/microservice/$category/$metric/increment',
            timing: '/microservice/$category/$metric/timing',
        }
    });
}

const metrics = new Metrics(layers);

module.exports = metrics;
