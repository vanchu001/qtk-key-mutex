const locker = require('process-key-mutex');
const uuid = require('uuid').v4;

module.exports = class {
    constructor() {
        this._tick = 0;
        this._timeoutTasks = new Map();
        this._taskIds = new Set();
        this._initTimer();
    }

    async lock(lockKey, task, timeout) {
        let taskId = uuid();
        return locker.lock(lockKey, () => new Promise((resolve, reject) => {
            this._taskIds.add(taskId);
            this._addTimeoutTask(this._tick + timeout, taskId, reject);
            task()
                .then(_ => resolve(_))
                .catch(error => reject(error))
                .finally(() => {
                    this._taskIds.delete(taskId);
                })
        }))
    }

    _initTimer() {
        setInterval(() => {
            this._tick++;
            let now = this._tick;
            let timeoutTasks = this._timeoutTasks.get(now);
            if (timeoutTasks) {
                timeoutTasks.forEach(({ reject, taskId }) => {
                    if (this._taskIds.has(taskId)) {
                        reject(new Error("task timeout"));
                    }
                    this._taskIds.delete(taskId);
                });
                this._timeoutTasks.delete(now);
            }
        }, 1000);
    }

    _addTimeoutTask(deadline, taskId, reject) {
        locker.lock(`_QTK_LOCKER_ADD_TIMEOUT_TASK_${process.pid}`, () => {
            this._timeoutTasks.set(
                deadline,
                (this._timeoutTasks.get(deadline) || []).concat({ taskId, reject })
            );
        })
    }
}