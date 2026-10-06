# SQLConduit 是什么

SQLConduit 是嵌入 C++17 应用进程的数据库访问中间件。它不是数据库代理，也不需要单独部署：应用链接 Core 和所需驱动组件，创建自己的 `sqlconduit::Client` 即可。

```text
业务代码 → Client → 审计/拦截器 → 路由/韧性 → 连接池 → 原生驱动 → 数据库
```

## 适用场景

- 一个服务访问多个数据库、租户或读写拓扑；
- 统一连接复用、参数绑定、事务、批量、游标和存储过程；
- 集中配置重试、熔断、限流、SQL 审计、查询缓存和影子流量；
- 需要完整带参 SQL、慢 SQL、连接池和异步模式统计；
- 希望异步调用有真实 native 路径，同时明确看见兼容 fallback。

## 支持的驱动

| 数据库 | CMake 开关 | 注册函数 | 主要依赖 |
| --- | --- | --- | --- |
| MySQL | `SQLCONDUIT_ENABLE_MYSQL` | `drivers::mysql()` | libmysqlclient |
| PostgreSQL | `SQLCONDUIT_ENABLE_POSTGRES` | `drivers::postgres()` | libpqxx + libpq |
| Oracle | `SQLCONDUIT_ENABLE_ORACLE` | `drivers::oracle()` | OCI / Instant Client SDK |
| SQL Server 等 ODBC 数据库 | `SQLCONDUIT_ENABLE_ODBC` | `drivers::odbc()` | unixODBC 或 Windows ODBC |

驱动默认关闭。编译某个组件并不等于某个 `Client` 已注册该驱动；必须在 `init()` 前调用相应的 `addDriver()`。

## 三个重要边界

1. `Client` 是 move-only 的独立运行时；不要把它当进程级单例。
2. `Status::ok()` 才表示成功。`Buffered` 表示写已进入易失队列，并未提交到数据库。
3. `Native` 只描述本次驱动 I/O 真正非阻塞；其他 Future 会明确报告 `CompatibilityFallback`。

## 下一步

1. [下载、编译与配置](/guide/getting-started)
2. [查询、事务与运行时管理](/guide/core-usage)
3. [批量、游标和大字段](/guide/data-processing)
4. [异步执行语义](/guide/async)
5. [按类查阅 API](/api/)
