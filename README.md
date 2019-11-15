# snooze

[![Build Status](https://travis-ci.org/bombbomb/snooze.svg?branch=master)](https://travis-ci.org/bombbomb/snooze)

it does stuff later

snooze is service built on AWS Lambda and DynamoDB that calls HTTPS urls at a time of your choosing.

run tests with `npm test`

deploy to AWS with `grunt lambda_deploy`

## AWS Resources

SNS - Publish to taskArn
Dynamo - Describe table, PutItem, UpdateItem, GetItem, Query on ENVIRONMENT_SnoozeSnsTaskTargetMap,
ENVIRONMENT_SnoozeTasks
