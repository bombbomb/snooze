var AWS = require('aws-sdk');
var doc = require('dynamodb-doc');
var _ = require('underscore');
var guid = require('guid');

var ddbTableName = process.env.ENVIRONMENT + '_SnoozeSnsTaskTargetMap';

function SnsMap(logInstance)
{

    var snsMap = this;
    var params = {
        TableName: this.getDbTableName()
    };

    this.dynamo = this.getDynamo();
    this.dynamo.describeTable(params, function(err, data) {
        if (err){
            console.log(err, err.stack);
            snsMap.makeTable();
            snsMap.dynamo.waitFor('tableExists', params, function(err, data) {
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
            console.log('SnsTargetMap: '+params.TableName+' exists.');
        }
    });

}

SnsMap.prototype.addTarget = function(snsMap,callback)
{

    var dynamo = this.getDynamo();
    if (typeof snsMap == "string")
    {
        snsMap = JSON.parse(snsMap);
    }

    var itemRecord = _.extend({},snsMap);

    if (!itemRecord.snsTarget || !itemRecord.taskType)
    {
        callback('SNS Map missing snsTarget or taskType', itemRecord);
        return;
    }

    dynamo.putItem({
            TableName: this.getDbTableName(),
            Item: itemRecord,
            ReturnValues: 'ALL_OLD'
        },
        function(err, data){
            var errorMessage = '';
            if (err)
            {
                errorMessage = err.message;
                console.info('snsMap; error adding a snsMap',err);
            }
            else
            {
                console.info('snsMap; added a new snsMap!', itemRecord);
            }
            callback(errorMessage, itemRecord);
        }
    );

};

SnsMap.prototype.updateTarget = function(id,attributes,callback)
{

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

    if (process.env.TEST_RUNNER)
    {
        updateItem = dynamoLegacyFormat(updateItem);
    }

    this.dynamo.updateItem(updateItem, callback);

};

SnsMap.prototype.getTarget = function(taskType, callback)
{

    var queryOptions = {
        TableName : this.getDbTableName(),
        Key : {
            taskType : taskType
        }
    };

    this.dynamo.getItem(queryOptions,function(err, data) {
        callback(err, data.Item);
    });

};

SnsMap.prototype.findTargets = function(taskPrefix, callback)
{

    queryOptions = _.extend(queryOptions,{
        IndexName: 'task-type',
        KeyConditions: [
            this.dynamo.Condition("taskType", "BEGINS_WITH", taskPrefix)
        ]
    });

    if (!queryOptions.KeyConditions || !queryOptions.IndexName)
    {
        callback('KeyConditions and IndexName are Required',null);
    }

    queryOptions.TableName = this.getDbTableName();

    this.dynamo.query(queryOptions,function(err, data) {
        callback(err, data);
    });

};

SnsMap.prototype.getDynamo = function() {

    if(typeof this.dynamo === 'undefined')
    {
        var dynamo = new AWS.DynamoDB({
            endpoint: process.env.DYNAMO_ENDPOINT,
            accessKeyId: process.env.AWS_ACCESS_KEY,
            secretAccessKey: process.env.AWS_SECRET_KEY,
            region: process.env.AWS_REGION
        });
        this.dynamo = new doc.DynamoDB(dynamo);
    }

    return this.dynamo;
};

SnsMap.prototype.getDocumentStore = function() {
    var DOC = require("dynamodb-doc");
    return new DOC.DynamoDB(this.getDynamo());
};

SnsMap.prototype.getDbTableName = function() {
    return ddbTableName;
};

SnsMap.prototype.makeTable = function()
{

    var dynamo = this.getDynamo(),
        params = {
            TableName: this.getDbTableName(),
            AttributeDefinitions: [
                {AttributeName: 'taskType',    AttributeType: 'S'}
            ],
            KeySchema: [
                { AttributeName: 'taskType',   KeyType: 'HASH' }
            ],
            ProvisionedThroughput: {
                ReadCapacityUnits: 5,
                WriteCapacityUnits: 5
            },
            GlobalSecondaryIndexes: [
                {
                    IndexName: 'task-type',
                    KeySchema: [
                        {AttributeName: 'taskType',   KeyType: 'HASH'}
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

function dynamoLegacyFormat(updateItem)
{
    updateItem.AttributeUpdates = {};
    for (var x in updateItem.ExpressionAttributeValues)
    {
        if (!updateItem.ExpressionAttributeValues.hasOwnProperty(x)) continue;
        updateItem.AttributeUpdates[x.replace(/:/, '')] = {
            Action: 'PUT',
            Value: updateItem.ExpressionAttributeValues[x]
        };
    }
    return updateItem;
}

module.exports = new SnsMap();
