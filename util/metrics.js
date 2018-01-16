'use strict';
const request   = require('./request');
const logger    = require('./logger');

class Metrics
{
    constructor ()
    {
        this.settings = {
            host : process.env.METRICS_HOST
        }
    }

    increment (featureName, metric)
    {
        let path = `/feature/snooze.${featureName}/${metric}/increment`;
        this.sendMetricsRequest(path)
            .catch((err) => {
                console.error('Failed to send metrics request', err);
            })
    }

    timing (featureName, metric)
    {
        let path = `/feature/snooze.${featureName}/${metric}/timing`;
        this.sendMetricsRequest(path)
            .catch((err) => {
                console.error('Failed to send metrics request', err);
            })
    }

    sendMetricsRequest (path)
    {
        return new Promise((resolve, reject) => {
            let options = {
                host : this.settings.host,
                path : path,
                method : 'POST',
                headers : {
                    'Content-Type' : 'application/json'
                }
            };
            let requestBody = {
              environment : process.env.ENVIRONMENT,
              xsrc : 'snooze'
            };
            request.send(options, [], JSON.stringify(requestBody))
                .then((data) => {
                    resolve(data);
                })
                .catch((err) => {
                    reject(err);
                })
        });
    }

}

module.exports = new Metrics();
