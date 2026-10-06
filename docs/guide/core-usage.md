# 查询、事务与运行时管理

## 参数化查询

```cpp
sqlconduit::common::ResultSet rows;
auto st = client.query(
    "SELECT id,name FROM users WHERE tenant_id=? AND active=?",
    sqlconduit::common::Params{std::int64_t(7), true}, rows);
```

参数始终使用 `?`，由驱动转成厂商协议。不要把用户值拼到 SQL；动态标识符应来自白名单或使用 Builder。

## 写入和错误处理

```cpp
std::int64_t affected = 0;
auto st = client.execute(
    "UPDATE users SET last_seen=CURRENT_TIMESTAMP WHERE id=?",
    sqlconduit::common::Params{std::int64_t(42)}, affected);

if (!st.ok()) {
    if (st.connectionBroken) markDatabaseUnavailable();
    if (st.retryable) scheduleAccordingToBusinessIdempotency();
}
```

不要只检查异常；正常 API 用 `Status` 报错。`retryable` 不是自动允许重放写入，业务仍需判断幂等性和提交不确定性。

## 事务

```cpp
sqlconduit::common::TransactionOptions options;
options.isolation = sqlconduit::common::IsolationLevel::Serializable;
options.timeout = std::chrono::seconds(3);

auto st = client.transaction(options, [](sqlconduit::core::Session &s) {
    std::int64_t n = 0;
    auto debit = s.execute(
        "UPDATE account SET balance=balance-? WHERE id=?",
        {std::int64_t(100), std::int64_t(1)}, n);
    if (!debit.ok()) return debit;
    return s.execute(
        "UPDATE account SET balance=balance+? WHERE id=?",
        {std::int64_t(100), std::int64_t(2)}, n);
});
```

回调返回 OK 才提交。返回错误或抛异常回滚。超时会尝试取消当前语句并回滚，但厂商取消能力不同；网络断开时最终提交结果可能未知，应用需要业务对账/幂等键。

## 命名数据源和上下文路由

```cpp
client.query("analytics", "SELECT count(*) AS n FROM events", rows);

sqlconduit::common::SqlContext ctx;
ctx.tenantId = "tenant-42";
ctx.targetDataSource = "tenant_42_rw";
ctx.idempotency = sqlconduit::common::Idempotency::Idempotent;
sqlconduit::common::ContextScope scope(ctx);
client.execute("UPDATE jobs SET claimed=1 WHERE id=?",
               sqlconduit::common::Params{std::int64_t(9)}, affected);
```

显式 `targetDataSource` 会覆盖方法传入的 source。作用域必须覆盖提交异步任务的时刻；异步执行会复制上下文。

## 配置热更新

```cpp
auto st = client.reload("config/datasources.yaml", std::chrono::seconds(5));
```

新配置先完整校验/构建，成功后原子替换。旧 DataSource handle 在 grace 期间可以完成在途工作。reload 不应从本 Client 回调内部调用。

## 观测

```cpp
auto pools = client.allPoolStats();
auto slow = client.slowSqlStats(20);
auto recent = client.recentSlowSql(20);
auto async = client.asyncStats();
```

这些快照用于诊断而不是控制流。观察 `waiting/asyncWaiting`、borrow timeout、连接创建失败、native/fallback 比例和慢 SQL histogram，结合数据库端指标判断瓶颈。

下一步：[批量、流式与游标](./data-processing) · [完整 Client API](/api/sync)
