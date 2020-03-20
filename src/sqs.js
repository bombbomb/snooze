const { logger } = require('@bblabs/knapsack');
const tasks = require('./core/tasks');

const sqsProcessFunction = (err, queueData, event, onComplete) => {
    try {
        if (err) {
            throw new Error(err);
        }

        var sqsBody = JSON.parse(event.message.Body);
        var sqsMessage = JSON.parse(sqsBody.Message);
        var eventType = '';

        if (event.name.indexOf('ReminderCancellations') === -1) {
            logger.info('event not from ReminderCancellations', { event });
            onComplete(null, null);
            return;
        }

        var eventMapDetail = null;
        logger.info('queue data', { queueData });

        if (typeof queueData.eventMap !== 'undefined') {
            var eventMapArray = queueData.eventMap;
            console.log('Event Map Array : ', eventMapArray);
            for (var i = 0; i < eventMapArray.length; i++) {
                var eventMap = eventMapArray[i];
                console.log('EventMap : ', eventMap);
                if (sqsMessage[eventMap.eventField] === eventMap.eventValue) {
                    eventMapDetail = eventMap;
                    console.log('EventMapDetail : ', eventMapDetail)
                    break;
                }
            }
        }

        if (eventMapDetail === null) {
            logger.info('Unable to find event map for event', { sqsMessage });
            onComplete('Unable to find event map for event', null);
            return;
        }

        if (typeof sqsMessage.event !== 'undefined') {
            sqsMessage = sqsMessage.event;
        }

        var reminderTaskId = sqsMessage[eventMapDetail.idField];

        if (typeof reminderTaskId !== 'undefined' && reminderTaskId.indexOf(':') !== -1) {
            reminderTaskId = reminderTaskId.split(':')[1];
        }

        if (!reminderTaskId || !reminderTaskId.length) {
            logger.error('Unable to find RefId for message, type', { eventType, sqsMessage });
            onComplete(null, null);
            return;
        }

        reminderTaskId = 'rem'+reminderTaskId;
        logger.info('Fetching Reminder Task by RefId to Cancel', { reminderTaskId });
        tasks.getTaskByRef(reminderTaskId,function(err,task) {
            if (err) {
                logger.error('sqsProcessor failed to fetch task', { reminderTaskId, error: err });
                onComplete(err, null);
                return;
            }

            if (task.Count <= 0) {
                logger.info('No task to update', { reminderTaskId });
                onComplete(null, null);
                return;
            }

            var taskDetail = task.Items[0];
            if (!taskDetail) {
                logger.info('Fetching Reminder Task by RefId to Cancel', { reminderTaskId, taskDetail });
                onComplete('No Task detail, unable to update status for '+ reminderTaskId, null);
                return;
            }

            tasks.setStatus(taskDetail.id, tasks.SUCCESS, function(err, data) {
                if (err) {
                    logger.error('Failed to cancel Reminder for Opened Email', {
                        id: taskDetail.id,
                        taskDetail
                    });
                } else {
                    logger.info('Canceled Reminder for Opened Email', { id: taskDetail.id, taskDetail });
                }
                onComplete(err,null);
            });
        });
    } catch (e) {
        logger.error('SQSWatcher Exception', { errorMessage: e.message, errorStack: e.stack });
        onComplete(e.message, null);
    }
};

module.exports = {
    sqsProcessFunction
};
