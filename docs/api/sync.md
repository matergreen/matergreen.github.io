# Client 与运行时 API

头文件：`sqlconduit/client.h`，通常直接包含 `sqlconduit/sqlconduit.h`。驱动工厂需另外包含对应头文件，例如 `sqlconduit/drivers/postgres.h`。

## 生命周期与驱动注册

### `addDriver`

驱动注册只对当前 Client 生效，且必须发生在 `init()` 前。

```cpp
sqlconduit::Client client;
auto st = client.addDriver(sqlconduit::drivers::mysql());
if (st.ok()) st = client.addDriver(sqlconduit::drivers::postgres());
if (st.ok()) st = client.init("config/datasources.yaml");
```

可用注册函数为 `drivers::mysql()`、`postgres()`、`oracle()` 和 `odbc()`。配置引用了未注册类型时返回 `UnknownDriver`；组件没有编入时注册函数返回 `DriverDisabled`。

### `init`、`reload`、`isRunning`、`shutdown`

```cpp
auto st = client.init("config/datasources.json");
// 也可传 config::GlobalConfig
if (!st.ok()) return;

st = client.reload("config/datasources.yaml", std::chrono::seconds(5));
bool ready = client.isRunning();
client.shutdown(std::chrono::seconds(5));
```

- `init` 严格校验 JSON/YAML，失败后 Client 仍可再次初始化；成功后再次 init 返回 `AlreadyInitialized`。
- `reload` 先构建并验证新拓扑，再原子发布；已取得旧 `DataSource` 的调用可在 grace period 内完成。
- `shutdown` 先拒绝新请求，排空本实例已提交异步任务，再关闭池；可重复调用。
- 析构函数也会关闭资源，但生产代码建议显式控制停止顺序。

## 查询与写入

### `query`

```cpp
sqlconduit::common::ResultSet rows;
auto st = client.query(
    "SELECT id, name FROM users WHERE status = ? AND age >= ?",
    sqlconduit::common::Params{std::string("active"), std::int64_t(18)}, rows);

// 指定数据源
st = client.query("analytics", "SELECT count(*) AS total FROM events", rows);
```

每次调用会清空并重新填充结果。`Row::at()` 对不存在的列返回 NULL 值，不会抛异常；需要区分缺列时先用 `has()`。

### `execute`

```cpp
std::int64_t affected = 0;
auto st = client.execute(
    "UPDATE users SET active = ? WHERE id = ?",
    sqlconduit::common::Params{false, std::int64_t(42)}, affected);
```

写重试默认关闭。只有调用方通过 `SqlContext::idempotency=Idempotent` 明确声明，或配置 `retry_writes`，写才可能重试。执行中断线或超时可能意味着提交结果未知，SQLConduit 不会在另一个主库上盲目重放。

### `queryAll` 与 `call`

```cpp
std::vector<sqlconduit::common::ResultSet> sets;
auto st = client.queryAll("CALL list_reports(?)",
                          sqlconduit::common::Params{std::int64_t(7)}, sets);

sqlconduit::common::CallParams params{
    sqlconduit::common::CallParam{std::int64_t(7)},
    sqlconduit::common::CallParam::out(sqlconduit::common::ValueType::String, 1024),
    sqlconduit::common::CallParam::refCursor()
};
sqlconduit::common::CallOutput output;
st = client.call("BEGIN report_pkg.run(?, ?, ?); END;", params, output);
```

`queryAll` 收集所有结果集；`call` 还返回 OUT/INOUT 参数和 affected。例程 SQL 和 OUT 能力依数据库而异，SQLConduit 不翻译例程方言。

## 逐行、批量、游标

```cpp
std::uint64_t seen = 0;
auto st = client.queryEach(
    "SELECT id, payload FROM events WHERE id > ?", {std::int64_t(100)},
    [](const sqlconduit::common::Row &row) {
        consume(row);
        return true; // false 表示主动停止，仍是成功
    }, seen);

sqlconduit::common::ParamBatch batch{
    {std::string("a"), std::int64_t(1)},
    {std::string("b"), std::int64_t(2)}
};
sqlconduit::common::BatchResult batchResult;
st = client.executeBatch(
    "INSERT INTO tags(name, owner_id) VALUES(?, ?)", batch, batchResult);
```

`executeBatch` 在没有外层事务时使用事务保证原子性。不同驱动可能使用 pipeline、multi-statement、parameter array 或 array DML；不满足快速路径条件时安全回退，不改变结果契约。

`openCursor()` 的完整生命周期见 [Session 与 Cursor](./session)。

## Session 与事务入口

```cpp
auto st = client.withSession([](sqlconduit::core::Session &s) {
    // 同一物理连接；没有自动 BEGIN
    sqlconduit::common::ResultSet rows;
    return s.query("SELECT current_user", rows);
});

sqlconduit::common::TransactionOptions tx;
tx.isolation = sqlconduit::common::IsolationLevel::Serializable;
tx.readOnly = false;
tx.timeout = std::chrono::seconds(3);

st = client.transaction("primary", tx, [](sqlconduit::core::Session &s) {
    std::int64_t affected = 0;
    auto r = s.execute("UPDATE account SET balance=balance-? WHERE id=?",
                       {std::int64_t(100), std::int64_t(1)}, affected);
    if (!r.ok()) return r;
    return s.execute("UPDATE account SET balance=balance+? WHERE id=?",
                     {std::int64_t(100), std::int64_t(2)}, affected);
});
```

事务回调返回成功才提交；返回错误或抛异常都会回滚。不要在事务回调中嵌套 Client 异步调用，小连接池可能因此等待自己持有的连接。

## `dataSource`

```cpp
auto source = client.dataSource("analytics");
if (source) {
    source->query("SELECT 1", rows);
    auto name = source->name();
    auto driver = source->driverType();
}
```

`DataSource` 提供与 Client 类似的同步数据访问、`withSession`、`transaction`、游标和池统计，并额外允许传单次 borrow timeout。句柄可以复制，但 Client 关闭后池操作会返回关闭状态。

## 动态数据源与组

```cpp
sqlconduit::config::DataSourceConfig tenant;
tenant.name = "tenant_42";
tenant.type = "postgres";
tenant.host = "127.0.0.1";
tenant.port = 5432;
tenant.database = "tenant_42";
tenant.user = "app";
tenant.password_env = "TENANT_42_PASSWORD";

auto st = client.addDataSource(tenant);

sqlconduit::config::DataSourceGroupConfig group;
group.name = "tenant_42_rw";
group.primary = "tenant_42";
sqlconduit::core::GroupOptions groupOptions;
// 只有配置启用对应高风险能力时才设置：
groupOptions.acknowledge_external_fencing = true;
groupOptions.acknowledge_data_loss_and_duplicates = true;
st = client.addGroup(group, groupOptions);

if (st.ok()) st = client.removeGroup("tenant_42_rw", std::chrono::seconds(5));
if (st.ok()) st = client.removeDataSource("tenant_42", std::chrono::seconds(5));
```

不能删除仍被组引用的数据源。动态 failover/write-buffer 还必须在 `GroupOptions` 提供对应 acknowledgement，避免绕过配置文件的风险确认。

## 拦截器、限流与上下文

```cpp
class TraceInterceptor final : public sqlconduit::core::ISqlInterceptor {
public:
    void onRoute(const std::string &, const std::string &,
                 sqlconduit::common::OperationType,
                 sqlconduit::common::SqlContext &ctx) override {
        if (ctx.tenantId == "sandbox") ctx.shadow = true;
    }
    sqlconduit::common::Status beforeExecution(
        const sqlconduit::core::ExecutionView &) override {
        return sqlconduit::common::Status::OK();
    }
    void afterExecution(const sqlconduit::core::ExecutionView &) override {}
    void onCompletion(const sqlconduit::core::ExecutionView &) override {}
};

client.addInterceptor(std::make_shared<TraceInterceptor>());
client.setDefaultRateLimiter(std::make_shared<sqlconduit::core::RateLimiter>(
    1000.0, 100.0, 200, "structural"));
client.clearInterceptors();
```

`RateLimiter` 参数依次是全局 QPS、单指纹 QPS、burst 和指纹模式。需要对接外部配额系统时实现线程安全的 `IRateLimiter::acquire(fingerprint)`。

需先在配置中设置 `interceptors.enabled: true` 才执行拦截器链。`onRoute` 可修改上下文；`beforeExecution` 可拒绝；`afterExecution` 可改写物化结果；`onCompletion` 总结最终状态。回调必须线程安全，异常会被边界捕获。

## 运行时观测

```cpp
sqlconduit::core::ConnectionPool::Stats pool;
if (client.poolStats(pool, "primary")) {
    log(pool.total, pool.idle, pool.borrowed, pool.waiting, pool.asyncWaiting);
}

for (const auto &item : client.allPoolStats()) log(item.dataSource, item.stats.total);
for (const auto &item : client.slowSqlStats(20)) log(item.fingerprint, item.count);
for (const auto &item : client.recentSlowSql(20)) log(item.dataSource, item.duration);

client.setObserver([](const sqlconduit::common::OperationEvent &event) {
    publish(event);
});
auto async = client.asyncStats();
client.clearSlowSqlStats();
client.setObserver({});
```

- 聚合慢 SQL 按指纹统计；recent 是有界最近记录。
- 是否保留完整 SQL 由 `observability.slow_sql.retain_rendered_sql` 控制。
- 完整带参日志必须显式开启字符串/二进制值；可能包含敏感信息，不建议作为默认生产配置。
- observer 在同步调用线程或当前 Client 的异步执行线程运行，不应执行长时间阻塞工作。

### Prometheus 文本导出与库日志级别

```cpp
#include <sqlconduit/common/logger.h>
#include <sqlconduit/exporters/prometheus.h>

sqlconduit::common::Logger::setMinLevel(
    sqlconduit::common::LogLevel::Warn);

sqlconduit::common::PoolMetricsEvent event;
event.timestamp = std::chrono::system_clock::now();
event.pools = client.allPoolStats();
auto body = sqlconduit::exporters::toPrometheusText(
    event, client.slowSqlStats(100), "sqlconduit", 100);
```

`toPrometheusText` 只生成 Prometheus exposition text，HTTP `/metrics` 端点由应用提供。指纹 label 有 1000 个强制上限，上例进一步限制为 100，避免时序基数失控。`Logger` 只调整 SQLConduit 自身 stderr 日志的最低级别；业务观测建议用 `setObserver()` 接入自己的链路。
