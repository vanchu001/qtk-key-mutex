const Server = require('@qtk/tcp-framework').Server;
const locker = require('process-key-mutex');
const Log4js = require('log4js');

module.exports = class LockerServer {
    constructor({ host, port, socketTimeout = 30, logDir }) {
        this._logger = undefined;
        this._initLogger(logDir);

        this._taskCallback = new Map();
        this._taskSocket = new Map();
        this._timeoutTasks = new Map();
        this._server = new Server({
            host,
            port,
            timeout: socketTimeout
        })
        .on('started', () => this._logger.info(`locker server start`))
        .on('exception', (socket, error) => this._logger.error(error));
        
        this._server.start();

        this._tick = 0;
        this._initTimer();

        this._server.on("data", async (socket, { data: socketData }) => {
            let { command, data } = JSON.parse(socketData.toString('utf8'));
            switch (command) {
                case "aquire":{
                    let { lockKey, taskId, timeout } = data;
                    this._taskSocket.set(taskId, socket);
                    locker.lock(lockKey, () => this._toDo(taskId, timeout));
                    this._logger.info(`task ${taskId} lockKey ${lockKey} aquire`);
                    break;
                }
                case "done": {
                    let { lockKey, taskId } = data;
                    let callback = this._taskCallback.get(taskId);
                    if (callback === undefined) return;
                    callback();
                    this._logger.info(`task ${taskId} lockKey ${lockKey} done`);

                    //清理任务
                    this._taskCallback.delete(taskId);
                    this._taskSocket.delete(taskId);
                    break;
                }
                case "updateTaskSocket": //客户端断开重连将更新task对应的scoket回调
                    data.forEach(({ taskId, isDoing }) => {
                        this._taskSocket.set(taskId, socket);
                        this._logger.info(`task ${taskId} update socket, doing is ${isDoing}`);
                        //存在发送toDo命令失败后，客户端重连上来后，继续发送toDo命令
                        if (this._taskCallback.has(taskId) && !isDoing) this._toDo(taskId);
                    });
                    break;
            }
        })
    }

    _addTimeoutTask(deadline, taskId, callback) {
        locker.lock("_QTK_LOCKER_ADD_TIMEOUT_TASK", () => {
            this._timeoutTasks.set(
                deadline,
                (this._timeoutTasks.get(deadline) || []).concat({ taskId, callback })
            );
        })
    }

    async _toDo(taskId, timeout) {
        let taskSocket = this._taskSocket.get(taskId);
        if (taskSocket === undefined) return;

        this._server.send(
            taskSocket,
            {
                data: Buffer.from(
                    JSON.stringify({
                        command: "toDo",
                        data: {
                            taskId
                        }
                    })
                )
            }
        );

        this._logger.info(`let task ${taskId} to do`);

        await new Promise(resolve => {
            this._taskCallback.set(taskId, resolve);
            this._addTimeoutTask(this._tick + timeout, taskId, resolve);
        })
    }

    _initTimer() {
        setInterval(() => {
            this._tick++;
            let now = this._tick;
            let timeoutTasks = this._timeoutTasks.get(now);
            if (timeoutTasks) {
                timeoutTasks.forEach(({ taskId, callback }) => {
                    if (this._taskCallback.has(taskId)) {
                        callback();
                        this._logger.info(`task ${taskId} timeout to clean`);
                    }
                    //清除任务
                    this._taskCallback.delete(taskId);
                    this._taskSocket.delete(taskId);
                });
                this._timeoutTasks.delete(now);
            }
        }, 1000);
    }

    _initLogger(logDir) {
        Log4js.configure({
            appenders: {
                runtime: logDir !==  undefined ? {
                    type: 'dateFile',
                    filename: `${logDir}/`,
                    pattern: "yyyy-MM-dd.log",
                    alwaysIncludePattern: true
                } : {
                    type: 'console'
                }
            },
            categories: {
                default: { appenders: ['runtime'], level: "ALL" }
            }
        });

        this._logger = Log4js.getLogger('default');
    }
}