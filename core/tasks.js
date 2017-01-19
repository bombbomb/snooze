var AWS = require('aws-sdk');
var doc = require('dynamodb-doc');
var _ = require('underscore');
var guid = require('guid');
var https = require('https');

var ddbTableName = process.env.ENVIRONMENT + '_SnoozeTasks';

function Tasks(logInstance)
{

    var tasks = this;

    var params = {
        TableName: this.getDbTableName()
    };

    this.PENDING = -1;
    this.QUEUED = 0;
    this.RUNNING = 1;
    this.CANCELED = 2;
    this.ERROR = 3;
    this.SUCCESS = 9;
    this.UNKNOWN = 11;

    this.dynamo = this.getDynamo();

    this.dynamo.describeTable(params, function(err, data) {
        if (err){
            console.log(err, err.stack);
            tasks.makeTable();
            tasks.dynamo.waitFor('tableExists', params, function(err, data) {
                if (err)
                {
                    console.error(err, err.stack);
                }
                else
                {
                    console.log(data);
                }
            });
        }
        else {
            console.log('Tasks: '+params.TableName+' exists.');
        }
    });

}

Tasks.prototype.addTask = function(task,callback)
{

    var dynamo = this.getDynamo();
    if (typeof task == "string")
    {
        task = JSON.parse(task);
    }

    var itemRecord = _.extend({
        id: guid.create().value,
        ts: 0,
        status: this.QUEUED,
        added_timestamp: Math.floor(Date.now()/1000),
        clientId : ""
    },task);

    if (typeof itemRecord.ts == "string")
    {
        itemRecord.ts = parseInt(itemRecord.ts);
    }

    if (!itemRecord.ts)
    {
        callback('no run timestamp specified',null);
    }
    else if (itemRecord.ts < itemRecord.added_timestamp)
    {
        callback('task start time is in the past '+itemRecord.ts +' < '+ itemRecord.added_timestamp+', come on, man!',null);
    }
    else
    {
        dynamo.putItem({
            TableName: this.getDbTableName(),
            Item: itemRecord
        },
        function(err,data){
            var newId = itemRecord.id;
            var errorMessage = '';
            if (err)
            {
                errorMessage = err.message;
                console.info('Tasks; error adding a task',err);
            }
            else
            {
                console.info('Tasks; added a new task! '+newId,itemRecord);
            }
            callback(errorMessage,newId);
        });
    }

};

Tasks.prototype.updateTask = function(id,attributes,callback)
{

    attributes.updated_time = Math.floor(Date.now()/1000);

    var updateItem = {
            TableName:this.getDbTableName(),
            Key: {
                id: id
            },
            UpdateExpression: 'set ',
            ExpressionAttributeNames: {},
            ExpressionAttributeValues: {},
            ReturnValues : 'ALL_NEW'
        };

    for (var x in attributes)
    {
        if (!attributes.hasOwnProperty(x)) continue;
        updateItem.UpdateExpression += '#'+x+' = :'+x+', ';
        updateItem.ExpressionAttributeNames['#'+x] = x;
        updateItem.ExpressionAttributeValues[':'+x] = attributes[x];
    }
    updateItem.UpdateExpression = updateItem.UpdateExpression.substr(0, updateItem.UpdateExpression.length-2);

    if(process.env.TEST_RUNNER)
    {

        updateItem = dynamoLegacyFormat(updateItem);
    }

    this.dynamo.updateItem(updateItem, callback);

};

Tasks.prototype.setStatus = function(id,status,callback)
{
    callback = callback || function(err,data){};
    this.updateTask(id, { status: status }, callback);
};

Tasks.prototype.getTasks = function(queryOptions, callback)
{

    if (!queryOptions.KeyConditions || !queryOptions.IndexName)
    {
        callback('KeyConditions and IndexName are Required',null);
    }

    queryOptions.TableName = this.getDbTableName();

    this.dynamo.query(queryOptions,function(err, data) {
        callback(err, data);
    });

};

Tasks.prototype.getTasksToRun = function(callback)
{

    var nowTs = Math.floor(Date.now()/1000);
    this.getTasks({
        IndexName: 'status-ts-index',
        KeyConditions: [
            this.dynamo.Condition("ts", "LE", nowTs),
            this.dynamo.Condition("status", "EQ", this.QUEUED)
        ]
    },callback);

};

Tasks.prototype.getClientTasksByStatus = function (status, clientId, callback)
{
    this.getTasks({
        IndexName: 'status-clientId-index',
        KeyConditions: [
            this.dynamo.Condition("clientId", "EQ", clientId),
            this.dynamo.Condition("status", "EQ", status)
        ]
    },callback);
};

Tasks.prototype.getTask = function(id, callback) {

    if (!id)
    {
        callback('ID is required', null);
    }
    else
    {
        var queryOptions = {
            TableName : this.getDbTableName(),
            Key : {
                id : id
            }
        };

        this.dynamo.getItem(queryOptions, function(err, data) {
            if (err)
            {
                return callback (err, null);
            }
            else if (data.Item)
            {
                return callback(null, data.Item);
            }
            return callback(err, null);
        });
    }

};

Tasks.prototype.getTaskByRef = function (refId,callback)
{
    if (!refId)
    {
        callback('Reference ID is required!');
    }
    else
    {
        this.getTasks({
            IndexName: 'refId-index',
            KeyConditions: [
                this.dynamo.Condition("refId", "EQ", refId)
            ]
        },callback);
    }
};

Tasks.prototype.getTasksByClient = function (clientId,callback)
{
    if(!clientId)
    {
        callback('client ID is required!');
    }

    this.getTasks({
        IndexName: 'clientId-index',
        KeyConditions: [
            this.dynamo.Condition("clientId", "EQ", clientId)
        ]
    },callback);

};

Tasks.prototype.checkForDuplicateRefId = function (refId, callback)
{
    this.getTaskByRef(refId, function(err, data) {
        if(!data)
        {
           callback(null, true);
        }
        else
        {
           if(data.Items.length === 0)
           {
               callback(null, true);
           }
           else
           {
               callback('Already a task with that refId!!!', null);
           }
        }
    });
};


Tasks.prototype.getDynamo = function() {

    if(typeof this.dynamo === 'undefined')
    {
        var dynamoConfig = {
            endpoint: process.env.DYNAMO_ENDPOINT,
            accessKeyId: process.env.AWS_ACCESS_KEY,
            secretAccessKey: process.env.AWS_SECRET_KEY,
            region: process.env.AWS_REGION
        };
        // this breaks the tests and isn't needed anyway
        if (process.env.ENVIRONMENT !== "Tests")
        {
            // work around for [NetworkingError: write EPROTO] https://github.com/aws/aws-sdk-js/issues/862
            dynamoConfig.httpOptions = {
                agent: new https.Agent({
                    rejectUnauthorized: true,
                    secureProtocol: "TLSv1_method", // workaround part ii.
                    ciphers: "ALL"                  // workaround part ii.
                })
            };
        }
        var dynamo = new AWS.DynamoDB(dynamoConfig);
        this.dynamo = new doc.DynamoDB(dynamo);
    }

    return this.dynamo;
};

Tasks.prototype.getDocumentStore = function() {
    var DOC = require("dynamodb-doc");
    return new DOC.DynamoDB(this.getDynamo());
};

Tasks.prototype.getDbTableName = function() {
    return ddbTableName;
};

Tasks.prototype.makeTable = function()
{

    var dynamo = this.getDynamo(),
        params = {
            TableName: this.getDbTableName(),
            AttributeDefinitions: [
                {AttributeName: 'id',       AttributeType: 'S'},
                {AttributeName: 'ts',       AttributeType: 'N'},
                {AttributeName: 'status',   AttributeType: 'N'},
                {AttributeName: 'refId',    AttributeType: 'S'},
                {AttributeName: 'clientId', AttributeType: 'S'}
            ],
            KeySchema: [
                { AttributeName: 'id',    KeyType: 'HASH' }
            ],
            ProvisionedThroughput: {
                ReadCapacityUnits: 5,
                WriteCapacityUnits: 10
            },
            GlobalSecondaryIndexes: [
                {
                    IndexName: 'status-ts-index',
                    KeySchema: [
                        {AttributeName: 'status',   KeyType: 'HASH'},
                        {AttributeName: 'ts',       KeyType: 'RANGE'}
                    ],
                    Projection: {
                        ProjectionType:'ALL'
                    },
                    ProvisionedThroughput: {
                        ReadCapacityUnits: 5,
                        WriteCapacityUnits: 10
                    }
                },
                {
                    IndexName: 'refId-index',
                    KeySchema: [
                        {AttributeName: 'refId',   KeyType: 'HASH'}
                    ],
                    Projection: {
                        ProjectionType:'ALL'
                    },
                    ProvisionedThroughput: {
                        ReadCapacityUnits: 5,
                        WriteCapacityUnits: 10
                    }
                },
                {
                    IndexName: 'clientId-index',
                    KeySchema: [
                        {AttributeName: 'clientId',   KeyType: 'HASH'}
                    ],
                    Projection: {
                        ProjectionType:'ALL'
                    },
                    ProvisionedThroughput: {
                        ReadCapacityUnits: 10,
                        WriteCapacityUnits: 5
                    }
                },
                {
                    IndexName: 'status-clientId-index',
                    KeySchema: [
                        {AttributeName: 'clientId',   KeyType: 'HASH'},
                        {AttributeName: 'status',     KeyType: 'RANGE'}

                    ],
                    Projection: {
                        ProjectionType:'ALL'
                    },
                    ProvisionedThroughput: {
                        ReadCapacityUnits: 10,
                        WriteCapacityUnits: 5
                    }
                }
            ]
        };

    dynamo.createTable(params, function(err, data) {
        if (err)
        {
            console.error(err);
        }
        else
        {
            console.log('Made Table:'+data);
        }
    });

};

function initDynamoIfNeeded(err, context) {

    if (err.name === 'ResourceNotFoundException') {

        console.log("Creating Dynamo table "+this.getDbTableName());


    } else {
        context.fail(err);
    }
}

function dynamoLegacyFormat(updateItem)
{
    updateItem.AttributeUpdates = {};
    for (var x in updateItem.ExpressionAttributeValues)
    {
        updateItem.AttributeUpdates[x.replace(/:/, '')] = {
            Action: 'PUT',
            Value: updateItem.ExpressionAttributeValues[x]
        };
    }
    return updateItem;
}

module.exports = new Tasks();




