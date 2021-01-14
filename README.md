@Qtk/Key-Mutex
==============
@qtk/key-mutex基于[process-key-mutex](https://www.npmjs.com/package/process-key-mutex)及[@qtk/tcp-framework](https://www.npmjs.com/package/@qtk/tcp-framework)封装，对同一个key绑定的函数执行进行加锁操作．支持**进程级别**、**网络级别**的锁操作

- 多个方法绑定同个key的话，同个时间只会执行一个，其他的按照绑定时间顺延执行．
- 实现方式: Promise & 链表

## 使用方式:
```js
//进程级别锁
const Mutex = require('@qtk/key-mutex');
const processMutex = new Mutex({ lockerType: "process" });
console.log(
    await processMutex.lock('mutexKey', async() => {
        await new Promise(resolve => setTimeout(() => resolve(), 1000));
        return 'hi';
    })
) 

//网络级别锁

//服务端
const Mutex = require('@qtk/key-mutex');
const server = new Mutex.NetworkServer({
    host: "127.0.0.1",
    port: 9999
});

//客户端
const Mutex = require('@qtk/key-mutex');
const networkMutex = new Mutex({ 
    lockerType: "network",
    serverHost: "127.0.0.1",
    serverPort: 9999
});
console.log(
    await networkMutex.lock('mutexKey', async() => {
        await new Promise(resolve => setTimeout(() => resolve(), 1000));
        return 'hi';
    })
) 
// hi
```

## 参数说明
### 构造函数
```js
constructor({ lockerType, serverHost, serverPort, socketTimeout = 30 })
````

|字段|含义|是否必填|枚举值|默认值|
|--|--|--|--|--|
|lockerType|锁类型|可选|``process``、``network``|process|
|serverHost|网络锁服务端ip|可选||localhost|
|serverPort|网络锁服务端port|lockerType=network时必填|||
|socketTimeout|连接超时时间(单位秒)|可选||30|


### lock函数

```js
lock(key, task, timeout)
```

|字段|含义|是否必填|枚举值|默认值|
|--|--|--|--|--|
|key|操作的key|必填|||
|task|获得锁后的处理函数|必填|||
|timeout|执行超时时间(含等待锁时间)，单位秒|可选||30|

### 网络锁服务端构造函数

```js
constructor({ host, port, socketTimeout = 30, logDir })
````

|字段|含义|是否必填|枚举值|默认值|
|--|--|--|--|--|
|host|网络锁服务端ip|可选||localhost|
|port|网络锁服务端port|lockerType=network时必填|||
|socketTimeout|连接超时时间(单位秒)|可选||30|
|logDir|日志目录|可选||默认为标准终端输出|

## 测试样例:
```js
const assert = require('assert');
let Locker = require('@qtk/key-mutex');
let mutex = undefined;
describe('#process', function () {
    before(function() {
        mutex = new Locker({
            lockerType: "process"
        })
    })

    it('[promise.all]', async function() {
        this.timeout(100000000);
        let [l1, l2] = await Promise.all([
            func('func1', 200),
            func('func2', 100),
        ])
        assert(l1 == 'func1' && l2 == 'func2', `promise.all failed`);
    });

    it('promise && setTimeout', async function() {
        this.timeout(100000000);
        let [l1, l2, l3, l4] = await new Promise(resolve => {
            let result = [];
            setTimeout(async () => {
                func('func3', 2000).then(l => result.push(l));
                func('func4', 1000).then(l => result.push(l));
            }, 1000)
            func('func1', 2000).then(l => result.push(l));
            func('func2', 1000).then(l => result.push(l));
            setInterval(() => {
                if (result.length == 4) resolve(result)
            }, 1000)
        })
        assert(l1 == 'func1' && l2 == 'func2' && l3 == 'func3' && l4 == 'func4', `promise && setTimeout failed`);
    });

    it('immediately && setTimeout', async function() {
        this.timeout(100000000);
        let [l1, l2] = await new Promise(async(resolve) => {
            let result = [];
            result.push(await func('func1', 4000));
            setTimeout(async () => {
                func('func2', 2000).then(l => result.push(l));
            }, 1000)
            setInterval(() => {
                if (result.length == 2) resolve(result)
            }, 1000)
        })
        assert(l1 == 'func1' && l2 == 'func2', `immediately && setTimeout failed`);
    });

    it('[one of throw error]', async function() {
        this.timeout(100000000);
        let [l1, l2] = await new Promise(resolve => {
            let result = [];
            func('func1', 2000).then(l => result.push(l));
            funcErr('func2', 1000).then(l => result.push(l)).catch(error => result.push(error));
            setInterval(() => {
                if (result.length == 2) resolve(result)
            }, 1000)
        })
        assert(l1 == 'func1' && l2 instanceof Error, `one of throw error failed`);
    });

    it('[promise.all and one of timeout]', async function () {
        this.timeout(100000000);

        let startAt = Date.now();
        let [l1, l2] = await Promise.all([
            (
                () => {
                    return new Promise(resolve => {
                        func('func1', 5000, 1)
                            .then(_ => resolve(_))
                            .catch(error => resolve(error))
                    })
                }
            )(),
            func('func2', 1000),
        ]);
        let endAt  = Date.now();
        assert(l1 instanceof Error && l2 == 'func2' && endAt - startAt < 2100, `promise.all and one of server timeout`);
    });
})

let func = async (label, delay, timeout) => {
    return mutex.lock('func', async () => {
        // console.log(`execute func: ${label}`);
        await new Promise(resolve => setTimeout(() => resolve(), delay));
        // console.log(`func: ${label} done`);
        return label;
    }, timeout)
}

let funcErr = async (label, delay) => {
    return mutex.lock('func', async() => {
        //console.log(`execute func: ${label}`);
        throw new Error('error');
    })
}
```