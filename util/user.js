var bbJwt       = require('bbjwt-client');
var sdc         = require('./metrics');

module.exports = {

    authenticate : function(req, res, next)
    {
        var token = req.get('Authorization');
        if (!token && process.env.JWT_HEADER)
        {
            token = req.get(process.env.JWT_HEADER);
        }
        if (token)
        {
            bbJwt.getClientIdFromToken(token, function (err, clientId) {
                var reqIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
                if (err)
                {
                    sdc.increase('userAuthenticationFailed');
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
        else
        {
            next();
        }
    }

};
