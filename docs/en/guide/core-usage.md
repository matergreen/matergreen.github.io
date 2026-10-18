# Queries, transactions, and runtime management

Use `?` placeholders and native binding:

```cpp
sqlconduit::common::ResultSet rows;
auto st = client.query(
    "SELECT id,name FROM users WHERE tenant_id=? AND active=?",
    sqlconduit::common::Params{std::int64_t(7), true}, rows);

std::int64_t affected = 0;
st = client.execute(
    "UPDATE users SET last_seen=CURRENT_TIMESTAMP WHERE id=?",
    sqlconduit::common::Params{std::int64_t(42)}, affected);
```

Errors are ordinary `Status` values. `retryable` does not automatically make a write safe to replay; business idempotency and ambiguous commit state still matter.

## Transactions

```cpp
sqlconduit::common::TransactionOptions options;
options.isolation = sqlconduit::common::IsolationLevel::Serializable;
options.timeout = std::chrono::seconds(3);

auto st = client.transaction(options, [](sqlconduit::core::Session &s) {
    std::int64_t n = 0;
    auto debit = s.execute("UPDATE account SET balance=balance-? WHERE id=?",
                           {std::int64_t(100), std::int64_t(1)}, n);
    if (!debit.ok()) return debit;
    return s.execute("UPDATE account SET balance=balance+? WHERE id=?",
                     {std::int64_t(100), std::int64_t(2)}, n);
});
```

Only OK commits; errors and exceptions roll back. Timeout requests cancellation and rollback, but vendor behavior differs and a disconnect may leave commit outcome unknown.

## Named source and context routing

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

Context target overrides the method source. Async submission copies the current context.

`reload(path, grace)` fully builds and validates a replacement before atomic publication. Old resolved handles can finish during grace. Never reload from a callback on that Client.

Use `allPoolStats`, `slowSqlStats`, `recentSlowSql`, and `asyncStats` as diagnostic snapshots. Correlate waiting, timeouts, connection creation failures, native/fallback ratio, and slow histograms with server metrics.

## New in 1.2

- [Direct query results](/en/api/query-results): raw rows, entity/one/scalar/column helpers, named bindings, Builder execution, strict errors and per-call timeout/cancellation.
- [Typed pagination](/en/api/pagination): page/size, hasNext, optional totals, async aggregation and Session consistency.
- [Configuration tools and diagnostics](/en/api/diagnostics): validate/explain/doctor, runtime snapshots and optional OpenTelemetry (since 1.1).

Examples target v1.2.0. Existing output-parameter and free mapping APIs remain supported.
