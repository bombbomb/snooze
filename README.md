# snooze [![Build Status](https://travis-ci.org/bombbomb/snooze.svg?branch=master)](https://travis-ci.org/bombbomb/snooze)
it does stuff later

snooze is service built on AWS Lambda and DynamoDB that calls HTTPS urls at a time of your choosing.

run tests with `npm test`

deploy to AWS with `grunt lambda_deploy`

## Architecture

Snooze currently runs in the DockerMachine account on an ECS cluster. It processes
queues from SQS.


## Troubleshooting

Quick Links:

Activate DockerMachine role using
[this link](https://signin.aws.amazon.com/switchrole?roleName=Developer_ReadOnly&account=bb-docker-machine&displayName=DeveloperReadOnly@DockerMachine).

[ECS cluster](https://console.aws.amazon.com/ecs/home?region=us-east-1#/clusters/master-snooze-master/services)

[EC2 Instances](https://console.aws.amazon.com/ec2/v2/home?region=us-east-1#Instances:search=master-snooze-master;sort=desc:tag:Name)

[SQS Page](https://console.aws.amazon.com/sqs/home?region=us-east-1#)

### SQS Queue Backing Up

Snooze uses a queue called `Snooze_master_ReminderCancellations` that occasionally backs up.

#### Failure Mode - Queue Processor Stopped

RESOLUTION: Kill the EC2 instances that are running snooze. Don't kill all at once.

##### Evidence

It is suspected that this has been caused by processes running on the snooze container failing,
though it is not yet known why. EC2 instances CPU utilization dropeed from a typical weekday
range of 15-30% to a lower, mostly flat value of about 8-10%. The change appeared to be sudden,
and coincided with an increase in number of messages visible in the queue.

[Last incident graph](https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#metricsV2:graph=~(metrics~(~(~'AWS*2fSQS~'ApproximateNumberOfMessagesVisible~'QueueName~'Snooze_master_ReminderCancellations~(stat~'Average))~(~'.~'NumberOfMessagesDeleted~'.~'.~(yAxis~'right))~(~'.~'NumberOfMessagesSent~'.~'.~(yAxis~'right)))~view~'timeSeries~stacked~false~region~'us-east-1~stat~'Sum~period~60~start~'2020-02-27T21*3a45*3a00.999Z~end~'2020-02-28T00*3a15*3a00.000Z);query=~'*7bAWS*2fSQS*2cQueueName*7d*20snooze_master)

Notice the divergence in messages sent vs deleted.
