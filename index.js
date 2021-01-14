const ProcessLocker = require('./locker/process');
const NetworkLockerClient = require('./locker/network');
const NetworkLockerServer = require('./locker/network/server');
module.exports = class {
    constructor({ lockerType = "process", serverHost, serverPort, socketTimeout = 30 }) {
        switch (lockerType) {
            case "process":
                this._locker = new ProcessLocker();
                break;
            case "network":
                this._locker = new NetworkLockerClient({
                    host: serverHost,
                    port: serverPort,
                    socketTimeout
                });
                break;
            default:
                throw new Error(`no support lockerType ${lockerType}`);
        }
    }

    async lock(key, task, timeout = 30) {
        return await this._locker.lock(key, task, timeout);
    }

    static get NetworkServer() {
        return NetworkLockerServer;
    }
}