var bbJwt       = require('bbjwt-client');
var sdc         = require('./metrics');

module.exports = {

    authenticate : function(req, res, next)
    {
        if (process.env.JWT_HEADER) {
            var token = req.get(process.env.JWT_HEADER);
            bbJwt.getClientIdFromToken(token, function (err, clientId) {
                var reqIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
                if (err) {
                    sdc.incrMetric('userAuthenticationFailed');
                    next(new Error('Invalid JWT from ' + reqIP));
                }
                else
                {
                    req.clientId = clientId;
                    console.log('started user session...!');
                    next(clientId);
                }
            })
        }
    }

};