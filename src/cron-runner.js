const tasks = require('./core/tasks');
const { logger } = require('@bblabs/knapsack');
const { runTask } = require('./core/run-task');

const run = () => {
    return new Promise((resolve, reject) => {
        tasks.getTasksToRun((err, data) => {
            if (err) {
                reject(err);
                return;
            }
    
            const tasks = data.Items;
            const childPromises = [];
            tasks.forEach((task) => {
                childPromises.push(runTask(task));
            });

            Promise.all(childPromises).then(successes => {
                const failures = successes.filter(success => !success);
                if (failures.length) {
                    logger.error('some child tasks failed', { count: failures.length });
                    reject('some child tasks failed');
                } else {
                    resolve();
                }
            }).catch(err => {
                logger.error('unexpected error running tasks', { error: err });
                reject(err);
            });
        });
    });
};

run((err) => {
    if (err) {
        logger.error('error running tasks', { error: err });
        process.exit(1);    
    } else {
        logger.info('completed running tasks');
        process.exit(0);
    }
});