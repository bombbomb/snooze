'use strict';
const request = require('./request');

class Logger
{
    constructor (options)
    {
        this.settings = {
            host : process.env.LOGGER_HOST,
            logToConsole : true
        };
        this.settings = this.updateObject(options, this.settings);
    }

    updateObject (propertiesToAdd, base)
    {
        if(!propertiesToAdd)
        {
            return base;
        }
        else if(!base)
        {
            return propertiesToAdd
        }
        else
        {
            return Object.assign(propertiesToAdd, base);
        }
    }

    log (message, type, payload, callback)
    {
        let body = {
            xsrc : 'remo',
            environment:  process.env.ENVIRONMENT,
            severity : type,
        };

        if (this.settings.logToConsole)
        {
            console.log(message, payload);
        }

        if (typeof type !== 'string')
        {
            body.type = 'INFO';
        }

        if (typeof message !== 'string')
        {
            body.message = JSON.stringify(message);
        }
        else
        {
            body.message = message;
        }

        if (payload instanceof Error)
        {
            let error = {
                stack : payload.stack,
                message : payload.message
            };
            body.info = JSON.stringify(error);
        }
        else if (typeof payload !== 'string')
        {
            body.info = JSON.stringify(payload);
        }
        else
        {
            body.info = payload;
        }

        return new Promise((resolve, reject) => {
            let requestOptions = {
                host : this.settings.host,
                path : '/',
                method : 'POST',
                headers : {
                    'Content-Type' : 'application/json'
                }
            };

            request.send(requestOptions, [], JSON.stringify(body))
                .then((data) => {
                    resolve(data);
                })
                .catch((err) => {
                    reject(err);
                })
        });
    }

    logInfo (message, payload)
    {
        this.log(message, 'INFO', payload)
            .catch((err) => {
                console.error('Failed to send log request', err);
            })
    }

    logWarning (message, payload)
    {
        this.log(message, 'WARN', payload)
            .catch((err) => {
                console.error('Failed to send log request', err);
            })
    }

    logError (message, payload)
    {
        this.log(message, 'ERROR', payload)
            .catch((err) => {
                console.error('Failed to send log request', err);
            })
    }
}

module.exports = new Logger();
