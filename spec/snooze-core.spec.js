var assert              = require('assert'),
    proxyquire          = require('proxyquire'),
    fs                  = require('fs'),
    request             = require('supertest'),
    sinon               = require('sinon'),
    dynalite            = require('dynalite'),
    jwt                 = require('jsonwebtoken'),
    AWS                 = require('aws-sdk');

var testEnvVars         = require('../test/test.env.js');

var deleteFolderRecursive = function(path) {
    try
    {
        if ( fs.statSync(path) )
        {
            fs.readdirSync(path).forEach(function(file,index){
                var curPath = path + "/" + file;
                if(fs.lstatSync(curPath).isDirectory())
                { // recurse
                    deleteFolderRecursive(curPath);
                }
                else
                { // delete file
                    fs.unlinkSync(curPath);
                }
            });
            fs.rmdirSync(path);
            console.info("Deleted "+path+" successfully.");
        }
    }
    catch (e)
    {
        console.error("Couldn't delete the Dynalite folder, didn't exist?");
    }

};

deleteFolderRecursive('./snooze-db');

var token = jwt.sign({ foo: 'bar', expires: (Date.now()/1000) + (60 * 60 * 24), clientId : 'THISISACLIENTID' }, process.env.JWT_SECRET);
var tasks = require('../core/tasks');

// Stub Overrides

var loggerStub        = require('../util/logger');
loggerStub.log = function(message,type,payload) {
    return new Promise((resolve) => {
        console.log(message);
        resolve();
    });
};
loggerStub['@global'] = true;

var sdcStub             = require('../util/metrics');
sdcStub.incrMetric = function(metric){ console.log('ignored metric: '+metric); };
sdcStub['@global'] = true;

var dynaliteServer = dynalite({ path: './snooze-db' });
dynaliteServer.listen(4567, function(err) {
    if (err) throw err;
    console.log('Dynalite started on port 4567')
});

var dynamoConfig = {
    endpoint: process.env.DYNAMO_ENDPOINT,
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
    region: process.env.AWS_REGION
};

var appStubs = {
    log: loggerStub,
    'aws-sdk': {
        SNS: function(){
            this.sendMessage = sinon.stub();
            this.publish = sinon.stub();
        },
        '@global': true
    },
    '../util/logger': loggerStub,
    './util/logger': loggerStub,
    './metrics': sdcStub,
    Base64: {
        encode: null
    }
};

function setupTestServerForRequests ()
{
    var express      = require('express');
    var bodyParser   = require("body-parser");
    var app = express();

    app.use(bodyParser.urlencoded({ extended: false, limit: '50mb' }));
    app.use(bodyParser.json({limit: '50mb'}));

    app.post('/posttask', function (req, res) {
        res.status(200).json(req.body).end();
    });

    app.listen(3050, function () {
        console.log('Test app listening on 3050');
    });
}



describe('Snooze Test Suite', function() {
    var editID = '';

    before(function(done) {
        this.timeout(5000);
        setTimeout(done, 1900);
    });

    var snooze = proxyquire('../index', appStubs);
    var snoozeRunner = snooze.runner;
    snooze = snooze.app;

    describe('app routes - add', function() {

        it('tests if snooze is up', function(done){
            request(snooze)
                .get('/')
                .expect(200, 'Snooze is up.')
                .end(done);
        });

        it('test against /add fails', function(done) {
            request(snooze)
                .post('/add')
                .set(process.env.JWT_HEADER, token)
                .send({})
                .expect(500, 'crap no task specified, or not a valid object?!')
                .end(done);
        });

        it('test against /add', function(done) {
            var date = Date.now();
            request(snooze)
                .post('/add')
                .set(process.env.JWT_HEADER, token)
                .send({ task:
                {
                    ts: date + 10000,
                    url: 'https://www.google.com',
                    clientId: '12345'
                }
                })
                .expect(200)
                .end(function(err, res){
                    editID = res.body.id;
                    if(!res.body.id)
                    {
                        done(new Error('incorrect ID being returned'));
                    }
                    else
                    {
                        done(err);
                    }
                });
        });

        // TODO; need to figure out why this test seems to break EVERYTHING!!!!
        it('only accepts valid json', function(done) {
            request(snooze)
                .post('/add')
                .set(process.env.JWT_HEADER, token)
                .send({task : 'String, Not Valid JSON'})
                .expect(500, 'crap no task specified, or not a valid object?!')
                .end(done);
        });
    });

    describe('app routes - cancel', function() {

        it('cancels a task in the queue', function (done){
            request(snooze)
                .put('/cancel/' + editID)
                .set(process.env.JWT_HEADER, token)
                .expect(200)
                .expect('Content-Type', 'application/json; charset=utf-8')
                .end(function(err,res){
                    if (res.status !== 200)
                    {
                        done(new Error('status is not 200'));
                    }
                    else if (process.env.DYNAMO_ENDPOINT.indexOf('localhost') === -1 && res.body.task.status !== 2)
                    {
                        done(new Error('incorrect attribute'));
                    }
                    else
                    {
                        done(err);
                    }
                });
        });

        it('sends back an error if task is not found', function(done) {
            request(snooze)
                .put('/cancel/4')
                .expect(500)
                .end(function(err,res) {
                    if (res.body.success === true)
                    {
                        done(new Error('Task should not exist'));
                    }
                    else
                    {
                        done(err);
                    }
                });
        });

    });

    describe('app routes - Check if event exists', function() {

        it('should find an event and return its information', function(done) {

            request(snooze)
                .get('/is/' + editID)
                .expect(200)
                .end(function(err,res) {
                    if(!res.body.task)
                    {
                        done(new Error('No task returned'));
                    }
                    else if (!res.body.task.ts || typeof res.body.task.status == 'undefined' || !res.body.task.added_timestamp)
                    {
                        done(new Error('Missing Task Information'));
                    }
                    else
                    {
                        done(err);
                    }
                });
        });

        it('should return error when task does not exist with that id', function(done) {

            request(snooze)
                .get('/is/310')
                .expect(500)
                .end(function(err,res) {
                    if (res && res.body.task)
                    {
                        done(new Error('There should be no task with this id'));
                    }
                    else if (res.body.message !== 'Task does not exist')
                    {
                        done(new Error('Incorrect message sent back'));
                    }
                    else
                    {
                        done(err);
                    }
                });

        });

    });

    describe('health check for taskrunner', function() {

        it('should return 200 if taskrunner is up', function(done) {

            request(snooze)
                .get('/health-check')
                .expect(200)
                .end(function(err, res) {
                    console.log('health res : ', res.body);
                    done(err);
                });

        });

    });

    describe('Add tasks to taskrunner', function() {

        this.timeout(35000);
        var counter = 0;
        var id;

        var tasks = [
            {url : 'https://www.google.com', delay: 10}, //Pending = 0
            {url : 'https://www.google.com', delay : 0.2}, // Success = 9
            {url : 'https://www.google.com', delay : 20}, // Canceled = 2
            // {delay: 1}, // Unknown = 11
            // {url : 'http://asdasd', delay : 1}, // Error = 3
            // {url : 'https://asdasd.com/', delay : 1}
        ];

        function addUrlTask (url, delay, refId)
        {
            if(url)
            {
                var payload = {task : {url : url, ts: (Date.now()/1000) + delay, refId : refId, clientId: '1234'}};
            }
            else
            {
                var payload = {task : {ts: (Date.now()/1000) + delay, refId : refId, clientId: '1234'}};
            }
            request(snooze)
                .post('/add')
                .set(process.env.JWT_HEADER, token)
                .send(payload)
                .end(function(err, res) {
                    id = res.body.id;
                    counter += 1;
                });
        }

        beforeEach(function(done) {
            addUrlTask(tasks[counter].url, tasks[counter].delay, '111' + counter);
            setTimeout(done, 3500);
        });


        it('should have status pending', function(done) {
            request(snooze)
                .get('/is/' + id)
                .expect(200)
                .end(function(err, res) {
                    if(res.body.task.status !== 0)
                    {
                        done(new Error('task should still be pending'));
                    }
                    else
                    {
                        done(err);
                    }
                });
        });

        it('should have status success', function(done) {
            request(snooze)
                .get('/is/' + id)
                .expect(200)
                .end(function(err, res) {
                    if(res.body.task.status !== 9)
                    {
                        done(new Error('Task should have been successful'));
                    }
                    else
                    {
                        done(err);
                    }
                });
        });

        it('should cancel a task and have status cancelled', function(done) {
            request(snooze)
                .put('/cancel/' + id)
                .expect(200)
                .end(function(err, res) {
                    if(res.body.task.status !== 2)
                    {
                        done(new Error('Task should have been cancelled'));
                    }
                    else
                    {
                        done(err);
                    }
                });
        });

        xit('should be unknown error with no URL entered', function(done) {
           request(snooze)
               .get('/is/' + id)
               .expect(200)
               .end(function(err, res) {
                   if(err) throw err;
                   if(res.body.task.status !== 11)
                   {
                       throw new Error('Task should be unknown, with no URL defined');
                   }
                   else
                   {
                       done();
                       return true;
                   }
               });
        });

        xit('should error with http instead of https entered', function(done) {
           request(snooze)
               .get('/is/' + id)
               .expect(200)
               .end(function(err, res) {
                   if(err) throw err;
                   if(res.body.task.status !== 3)
                   {
                       throw new Error('Task should error out, http is being used');
                   }
                   else
                   {
                       done();
                       return true;
                   }
               });
        });

        xit('should show as running if process is ongoing', function(done) {
            request(snooze)
                .get('/is/' + id)
                .expect(200)
                .end(function(err, res) {
                    if(res.body.task.status !== 1)
                    {
                        done(new Error('Task should still be running'));
                    }
                    else
                    {
                        done(err);
                    }
                });
        });

    });

    describe('Tasks with reference Id', function() {

        var taskId;
        var refId;

        it('should add a task with a reference ID', function(done) {
            var date = Date.now();
            request(snooze)
                .post('/add')
                .set(process.env.JWT_HEADER, token)
                .send({ task:
                {
                    ts: date + 10000,
                    url: 'https://www.google.com',
                    status : 0,
                    refId: '123457',
                    clientId : 'abcde'
                }
                })
                .expect(200)
                .end(function(err, res) {
                    if(!res.body.id)
                    {
                        done(new Error('no id was returned'));
                    }
                    else
                    {
                        taskId = res.body.id;
                        done(err);
                    }
                });
        });

        it('should get task added given a taskid', function(done) {
            request(snooze)
                .get('/is/' + taskId)
                .expect(200)
                .end(function(err, res) {
                    if(res.body.task.refId !== '123457')
                    {
                        done(new Error('incorrect reference Id returned'));
                    }
                    else
                    {
                        refId = res.body.task.refId;
                        done(err);
                    }
                });
        });

        it('should get task given a reference id', function(done) {
            request(snooze)
                .get('/isbyref/' + refId)
                .expect(200)
                .end(function(err, res) {
                    console.log(res.body);
                    if(res.body.task.id !== taskId || res.body.task.refId !== refId)
                    {
                        done(new Error('incorrect reference id or task id returned'));
                    }
                    else
                    {
                        done(err);
                    }
                });
        });

    });

    describe('editing tasks in the database', function() {

        var taskId;

        before(function(done) {
            var date = Date.now();
            request(snooze)
                .post('/add')
                .set(process.env.JWT_HEADER, token)
                .send({ task:
                {
                    ts: date + 10000,
                    url: 'https://www.google.com',
                    refId: '11111',
                    clientId: 'abcde'
                }
                })
                .end(function(err, res) {
                    taskId = res.body.id;
                    done();
                });
        });

        it('should edit a task in the database', function(done) {
            var date = Date.now();
            var newTs = date + 20000;
            request(snooze)
                .put('/task/' + taskId)
                .set(process.env.JWT_HEADER, token)
                .send({ task :
                {
                    refId: '67890',
                    ts: newTs
                }
                })
                .expect(200)
                .end(function(err, res) {
                    if(res.body.task.refId !== '67890')
                    {
                        done(new Error('the reference Id hasn\'t been updated'));
                    }
                    else if (res.body.task.ts !== newTs)
                    {
                        done(new Error('The timestamp hasn\'t been updated'));
                    }
                    else
                    {
                        done(err);
                    }
                });
        });

    });

    describe('Check for duplicate refId and taskId in the database', function() {

        var taskId;
        var refId = '00001';

        before(function(done) {
            var date = Date.now();
            request(snooze)
                .post('/add')
                .set(process.env.JWT_HEADER, token)
                .send({ task:
                {
                    ts: date + 10000,
                    url: 'https://www.google.com',
                    refId: refId,
                    clientId: 'abcde'
                }
                })
                .end(function(err, res) {
                    taskId = res.body.id;
                    done(err);
                });
        });

        it('should send an error when adding an item with a duplicate refId', function(done) {
            var date = Date.now();
            request(snooze)
                .post('/add')
                .set(process.env.JWT_HEADER, token)
                .send({ task :
                {
                    ts: date + 10000,
                    url: 'https://www.google.com',
                    refId: refId,
                    clientId: 'abcde'
                }
                })
                .expect(500)
                .end(function(err, res) {
                    if(res.body.success)
                    {
                        done(new Error('task should not have been added'));
                    }
                    else
                    {
                        done(err);
                    }
                });
        });

    });

    describe('adding an SNS task', function() {

        var taskId;

        it('should add an SNS task to dynamo', function(done) {
            var date = Date.now();
            request(snooze)
                .post('/add')
                .set(process.env.JWT_HEADER, token)
                .send({ task :
                {
                    ts: date + 1000,
                    refId : '12093',
                    snsTarget : 'arn:aws:sns:us-east-1:286550000000:snooze-test',
                    clientId: 'abcde',
                    payload :
                    {
                        email : 'bradleyjamesbouley@gmail.com',
                        message : 'Adding sns payload to dynamo'
                    }
                }
                })
                .expect(200)
                .end(function(err, res) {
                    if (!res.body.success)
                    {
                        done(new Error('task not added!!'));
                    }
                    else
                    {
                        taskId = res.body.id;
                        done(err);
                    }
                });
        });

        it('should have that SNS task in the database', function(done) {
            request(snooze)
                .get('/is/' + taskId)
                .expect(200)
                .end(function(err, res) {
                    if(!res.body.success)
                    {
                        done(new Error('Task wasnt retrieved from the database correctly'));
                    }
                    else
                    {
                        done(err);
                    }
                });
        });

    });

    describe('adding an HTTP POST task', function() {
        this.timeout(15000);
        var taskId;

        before(function(done) {
            setupTestServerForRequests();
            done();
        });

        beforeEach(function(done) {
            setTimeout(done, 5000);
        });

        it('should add an HTTP POST task to dynamo', function(done) {
            var date = Date.now()/1000;
            request(snooze)
                .post('/add')
                .set(process.env.JWT_HEADER, token)
                .send({ task :
                {
                    ts: date + 1,
                    url: 'http://127.0.0.1:3050/posttask',
                    refId: '11111',
                    clientId: 'abcde',
                    status: 0,
                    payload :
                    {
                        ts: date + 50,
                        url: 'https://www.linkedIn.com',
                        refId: '22222',
                        clientId: 'abcde'
                    }
                }
                })
                .expect(200)
                .end(function(err, res) {
                    if (!res.body.success)
                    {
                        done('task not added!!');
                    }
                    else
                    {
                        taskId = res.body.id;
                        done(err);
                    }
                });
        });


        it('should have that HTTP POST task in the database', function(done) {
            request(snooze)
                .get('/is/' + taskId)
                .expect(200)
                .end(function(err, res) {
                    if(err) throw err;
                    if(!res.body.success)
                    {
                        throw new Error('Task wasn\'t retrieved from the database correctly');
                    }
                    else if(res.body.task.status !== 9)
                    {
                        throw new Error('Task hasnt run, status is ' + res.body.task.status);
                    }
                    else
                    {
                        done();
                        return true;
                    }
                });
        });

        it('Task Update Spy', function (done) {
            tasks.getTask(taskId, function(err, res) {
                assert.equal(res.result.statusCode, 200);
                assert.equal(res.result.body.url, 'https://www.linkedIn.com');
                assert.equal(res.result.body.refId, '22222');
                assert.equal(res.result.body.clientId, 'abcde');
                done(err);
            })
        })

    });

});
