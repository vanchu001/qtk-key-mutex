const uuid = require('uuid').v4;
const Client = require('@qtk/tcp-framework').Client;
const locker = require('process-key-mutex');

module.exports = class {
    constructor({ host, port, socketTimeout }) {
        this._tick = 0;
        this._timeoutTasks = new Map();
        this._initTimer();

        this._toDoCallback = new Map();
        this._doingTasks = new Set();
        this._taskIds = new Set();
        this._client = new Client({ host, port, timeout: socketTimeout })
            .on('data', ({ data: socketData }) => {
                let { command, data } = JSON.parse(socketData.toString('utf8'));
                switch (command) {
                    case "toDo":
                        let { taskId } = data;
                        let toDoTask = this._toDoCallback.get(taskId);
                        if (toDoTask) toDoTask();
                        break;
                    default:
                        throw new Error(`no support command ${command}`);
                }
            })
            .on('connected', () => {
                this._client.send({
                    data: Buffer.from(JSON.stringify({
                        command: "updateTaskSocket",
                        data: Array.from(this._taskIds).map(taskId => ({
                            taskId,
                            isDoing: this._doingTasks.has(taskId)
                        }))
                    }))
                });
            })

    }

    async lock(lockKey, task, timeout) {
        let taskId = uuid();

        return new Promise((resolve, reject) => {

            this._taskIds.add(taskId);

            this._addTimeoutTask(this._tick + timeout, taskId, reject);

            new Promise((aquireResolve, aquireReject) => {
                this._client.send({
                    data: Buffer.from(JSON.stringify({
                        command: "aquire",
                        data: {
                            lockKey,
                            taskId,
                            //服务端多出5秒钟缓冲过期时间
                            //正常情况客户端会先过期，然后发送done命令使服务端切换到下个任务
                            //客户端断网情况timeout+5秒钟后服务器自动切换下一个任务
                            timeout: timeout + 5 
                        }
                    }))
                });
                this._toDoCallback.set(taskId, aquireResolve);
                this._addTimeoutTask(this._tick + timeout, taskId, aquireReject);
            })
                .then(async () => {
                    this._doingTasks.add(taskId);
                    return resolve(await task());
                })
                .catch(error => reject(error))
        })
            .finally(() => {
                this._taskIds.delete(taskId);
                this._doingTasks.delete(taskId);
                this._toDoCallback.delete(taskId);

                this._client.send({
                    data: Buffer.from(JSON.stringify({
                        command: "done",
                        data: {
                            taskId,
                            lockKey
                        }
                    }))
                });
            })
    }

    _initTimer() {
        setInterval(() => {
            this._tick++;
            let now = this._tick;
            let timeoutTasks = this._timeoutTasks.get(now);
            if (timeoutTasks) {
                timeoutTasks.forEach(({ reject, taskId }) => {
                    if (this._toDoCallback.has(taskId)) {
                        reject(new Error("task timeout"));
                    }
                    this._taskIds.delete(taskId)
                    this._toDoCallback.delete(taskId);
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