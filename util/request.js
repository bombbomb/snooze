'use strict';
const https     = require('https');

module.exports = {

    send : (options, statusExceptions, postData) =>
    {
        return new Promise((resolve, reject) =>
        {

            let req = https.request(options);

            req.on('response', (res) =>
            {

                if (Array.isArray(statusExceptions) && statusExceptions.indexOf(res.statusCode) !== -1)
                {
                    console.log('Exception status code return : ', res.statusCode);
                    resolve();
                    return
                }
                else if ((res.statusCode < 200 || res.statusCode >= 300))
                {
                    reject(new Error(`statusCode = ${res.statusCode}`));
                    return;
                }
                let body = '';
                res.on('data', (chunk) =>
                {
                    body += chunk;
                });
                res.on('end', () =>
                {
                    try
                    {
                        let data = body.length > 0 ? JSON.parse(body) : 'empty response';
                        resolve(data);
                    }
                    catch(e)
                    {
                        reject(e)
                    }
                })
            });

            if (postData)
            {
                req.write(postData);
            }

            req.on('error', (e) =>
            {
                reject(e);
            });

            req.end();
        })
    }

};
