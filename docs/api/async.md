# Future 异步 API

异步入口是 `Client` 成员函数，返回标准 `std::future`。没有全局异步门面、callback `Handle`、自定义执行器注入或协程 `Task`。

::: warning 版本边界
本页按当前 `dev` 代码记录。Oracle/ODBC native async 与组路由异步状态机属于 `Unreleased` 的 1.0.1 开发线；1.0.0 的同一 Future API 仍可用，但这些路径会更多报告 `CompatibilityFallback`。以具体 tag 的 CHANGELOG 为准。
:::

## 配置

```yaml
async:
  enabled: true
  threads: 0            # 0 = 实现选择（通常是硬件并发数）
  queue_size: 4096
  statement_timeout_ms: 3000
```

关闭异步后，异步 API 返回已经就绪且状态为 `ConfigError` 的 future。

## 查询与多结果集

```cpp
auto future = client.queryAsync(
    "SELECT id, name FROM users WHERE id=?", {std::int64_t(42)});
auto result = future.get();
if (result.status.ok()) consume(result.rows);

auto multi = client.queryAllAsync(
    "reporting", "CALL build_report(?)", {std::int64_t(7)}).get();
if (multi.status.ok()) consume(multi.sets);
```

`QueryResult` 包含 `status`、`rows`、`mode`；`MultiQueryResult` 包含 `sets` 和汇总 `rowCount()`。

## 写入与生成键

```cpp
auto update = client.executeAsync(
    "UPDATE users SET active=? WHERE id=?",
    {false, std::int64_t(42)}).get();

auto insert = client.executeKeysAsync(
    "INSERT INTO users(name) VALUES(?) RETURNING id",
    {std::string("Ada")}).get();
```

`ExecResult` 返回 affected；`ExecKeysResult` 还返回 `GeneratedKeys`。native 写完成后不会仅因本地 deadline 已过就把成功改写成超时，因为服务端提交结果可能已经确定或未知。

## 逐行、批量与事务

```cpp
auto each = client.queryEachAsync(
    "SELECT id FROM events", {},
    [](const sqlconduit::common::Row &row) {
        consume(row);
        return true;
    }).get();

auto batch = client.executeBatchAsync(
    "INSERT INTO tags(name) VALUES(?)",
    {{std::string("a")}, {std::string("b")}}).get();

sqlconduit::common::TransactionOptions options;
options.timeout = std::chrono::seconds(5);
auto tx = client.transactionAsync(
    "primary", options,
    [](sqlconduit::core::Session &s) {
        std::int64_t affected = 0;
        return s.execute("UPDATE jobs SET claimed=1 WHERE id=?",
                         {std::int64_t(9)}, affected);
    }).get();
```

`queryEachAsync` 的行回调与 `transactionAsync` 的事务回调在 Client 工作线程执行，必须线程安全且不应嵌套同一 Client 的异步借连接操作。`queryAllAsync`、生成键、逐行、批量和事务目前通常报告兼容模式。

## `Native` 与 `CompatibilityFallback`

```cpp
if (result.mode == sqlconduit::async::ExecutionMode::Native) {
    // 驱动以非阻塞状态机完成本次 query/execute I/O
}

auto stats = client.asyncStats();
log(stats.nativeOperations,
    stats.fallbackOperations,
    stats.timedOutOperations,
    stats.queueDepth,
    stats.delayedPending,
    stats.rejected);
```

| 驱动/操作 | 当前行为 |
| --- | --- |
| PostgreSQL 普通 query/execute | 合格路径使用共享 libpq socket reactor |
| MySQL 无参数单语句 query/execute | 受支持客户端使用官方 nonblocking API |
| MySQL 带参数 prepared | `CompatibilityFallback`，因为官方 prepared API 没有异步入口 |
| Oracle 普通 query/execute | 合格路径使用 OCI nonblocking；临时 LOB 输入回退 |
| ODBC query/execute | 仅驱动报告 statement/connection async 时轮询；FreeTDS 回退 |
| 事务、游标、批量、多结果、生成键 | 兼容执行器 |

查询/执行的数据源组、缓存、重试、副本回主库、带 fencing 的主库故障转移和影子路由已经使用异步拓扑状态机；最终模式取决于被选中的叶子驱动操作。

::: warning 模式不是成功状态
`Native` 不代表成功，`CompatibilityFallback` 也不代表失败。始终先检查 `status`；`mode` 用于确认性能路径和容量规划。
:::

## 连接池等待与背压

- 合格 query/execute 等待池连接时进入 `asyncWaiting`，不占 executor worker。
- 连接归还会直接 handoff 给最老等待者；池等待有主动 deadline。
- 公开提交队列已满时返回 retryable `Overloaded`，不会偷偷在调用线程执行。
- retry backoff 计入 `delayedPending`；shutdown 会唤醒这些 continuation，让 future 以结构化关闭/过载状态完成，而不是 `broken_promise`。

## 超时与取消

native 读使用主动 deadline：future 只完成一次并返回 `QueryTimeout`，取消只请求一次；连接保持隔离，直到迟到的驱动 completion 到达后才能归还或丢弃。兼容读只能在阻塞厂商调用返回后做 late classification。成功写、批量和事务不会在完成后被改写成超时。

## 关闭与 future 生命周期

销毁一个尚未 `get()` 的 future 是合法的，操作仍由 Client 管理。调用 `shutdown(grace)` 后不再接受新任务，并排空已接受任务；不要在异步回调（行回调/事务函数/observer/interceptor）内部 shutdown 同一个 Client。
