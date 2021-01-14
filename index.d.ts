declare namespace QTKLocker {
    class Locker {
        /**
         * 对象
         * @param {LockerConstructParams} params 初始化函数
         */
        constructor(params: LockerConstructParams);

        /**
         * 锁函数
         * @param {string} key key
         * @param {Function} task 处理函数
         * @param {number} [timeout=30] 处理函数执行超时时间(单位:秒，默认:30)
         */
        lock(key: string, task: Function, timeout?: number): Promise<void>

        /**
         * 网络锁服务端
         */
        static NetworkServer: NetworkServer
    }
}

declare interface LockerConstructParams {
    /**
     * 锁类型,process:进程锁,network:网络锁
     */
    lockerType?: "process" | "network"

    /**
     * 网络锁服务端ip
     */
    serverHost?: string

    /**
     * 网络锁服务端端口
     */
    serverPort: number

    /**
     * 链接超时时间(单位:秒，默认:30)
     */
    socketTimeout?: number
}

declare interface LockerServerConstructParams {
    /**
     * 锁类型,process:进程锁,network:网络锁
     */
    lockerType?: "process" | "network"

    /**
     * 网络锁服务端ip
     */
    host: string

    /**
     * 网络锁服务端端口
     */
    port: number

    /**
     * 链接超时时间(单位:秒，默认:30)
     */
    socketTimeout?: number

    /**
     * 日志目录，默认标准输出
     */
    logDir?: string
}

declare interface NetworkServer {
    /**
     * 
     * @param {LockerServerConstructParams} params 初始化函数
     */
    new(params: LockerServerConstructParams)
}

export = QTKLocker.Locker;