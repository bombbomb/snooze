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
SQS - Sasquatcha hits queue at ENVIRONMENT_SnoozeSQSWatcher

## WTF

### API

This does things.

### Task Runner

This part of the code uses Forever to start child processes,
see index.js line 440ish.

This basically sets up `core/runner.js` to run forever, with a
max # of attempts set to 3. Runner runs an interval
every 5 seconds or so to `startTasksToRun()`.

This queries Dynamo (`getTasksToRun`) to get all dynamo items with ts LE now.

Then, this sends those tasks through to `core/runtask.js`, which apparently requires
forking the process? NOT! Sigh...

Here is where things actually happen.

### SQS Watcher

This watches the queue, which is being fed from Bixel-Open SNS topic.

It's watching for the `ReminderCancellations` queue. If not that queue,
it doesn't do anything lol.

It checks the `eventMap` property. There is really one dynamodb entry here...

```json
{
  "enabled": 1,
  "eventMap": [
    {
      "eventField": "eventName",
      "eventValue": "undefined",
      "idField": "jobId"
    },
    {
      "eventField": "eventName",
      "eventValue": "EmailOpenedEvent",
      "idField": "jobId"
    },
    {
      "eventField": "itemType",
      "eventValue": "open",
      "idField": "id"
    }
  ],
  "id": "5669a355-b288-4e2c-b304-5ed11d64fa34",
  "sqsName": "Snooze_master_ReminderCancellations"
}
```

Eventually, it looks like success is when we set the task status to SUCCESS.
Ah, it looks like if we get the email, we go ahead and mark that email as
SENT. See log `Canceled Reminder for Opened Email`.

## Kubernetes

It appears this could be configured as follows.

* Run the API.
* Run a queue consumer, currently they run 32 watchers each pulling 10 messages.
* Run a cron job, running every minute or so.
