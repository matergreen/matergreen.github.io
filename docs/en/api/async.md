# Future async API

Async operations are `Client` members returning standard `std::future`. There is no global async facade, callback Handle, custom-executor injection, or coroutine Task.

::: warning Version boundary
This page tracks the current `dev` implementation. Oracle/ODBC native async and async group-routing state machines belong to the unreleased 1.0.1 development line. The same Future API exists in 1.0.0, but more of those paths report `CompatibilityFallback`. Use the CHANGELOG attached to the exact tag as the release authority.
:::

## Configuration

```yaml
async:
  enabled: true
  threads: 0
  queue_size: 4096
  statement_timeout_ms: 3000
```

When disabled, async methods return a ready future containing `ConfigError`.

## Query, execute, and composite operations

```cpp
auto query = client.queryAsync(
    "SELECT id, name FROM users WHERE id=?", {std::int64_t(42)}).get();

auto multi = client.queryAllAsync(
    "reporting", "CALL build_report(?)", {std::int64_t(7)}).get();

auto update = client.executeAsync(
    "UPDATE users SET active=? WHERE id=?",
    {false, std::int64_t(42)}).get();

auto insert = client.executeKeysAsync(
    "INSERT INTO users(name) VALUES(?) RETURNING id",
    {std::string("Ada")}).get();

auto each = client.queryEachAsync(
    "SELECT id FROM events", {},
    [](const sqlconduit::common::Row &row) { consume(row); return true; }).get();

auto batch = client.executeBatchAsync(
    "INSERT INTO tags(name) VALUES(?)",
    {{std::string("a")}, {std::string("b")}}).get();

sqlconduit::common::TransactionOptions options;
options.timeout = std::chrono::seconds(5);
auto tx = client.transactionAsync("primary", options,
    [](sqlconduit::core::Session &s) {
        std::int64_t affected = 0;
        return s.execute("UPDATE jobs SET claimed=1 WHERE id=?",
                         {std::int64_t(9)}, affected);
    }).get();
```

Result structures are `QueryResult`, `MultiQueryResult`, `ExecResult`, `ExecKeysResult`, `EachResult`, `BatchResult`, and `OpResult`. Every one contains `status` and `mode`. Row and transaction callbacks run on Client workers, must be thread-safe, and must not nest async pool borrows from the same small pool.

## Native versus compatibility fallback

```cpp
if (query.mode == sqlconduit::async::ExecutionMode::Native) {
    // This query/execute used a nonblocking driver state machine.
}
auto stats = client.asyncStats();
```

| Driver/operation | Current behavior |
| --- | --- |
| PostgreSQL ordinary query/execute | Eligible paths use the shared libpq socket reactor |
| MySQL parameter-free single statement | Supported clients use the official nonblocking API |
| MySQL prepared parameters | Fallback; the vendor prepared API has no async entry |
| Oracle ordinary query/execute | Eligible OCI nonblocking path; temporary-LOB input falls back |
| ODBC query/execute | Polls only when the driver reports async support; FreeTDS falls back |
| Transaction, cursor, batch, multi-result, keys | Compatibility executor |

Query/execute groups, cache, retry, replica fallback, fenced primary failover, and shadow routing use async topology state machines. The final mode follows the selected leaf driver operation.

::: warning Mode is not success
`Native` does not mean success and `CompatibilityFallback` does not mean failure. Check `status` first; use `mode` for performance-path verification and capacity planning.
:::

`asyncStats()` exposes thread, queue, active, submitted/completed/rejected, delayed retry, native/fallback, and timeout counters.

## Pool wait, deadlines, and shutdown

- Eligible query/execute pool waits park in `asyncWaiting` without occupying a worker and use oldest-waiter handoff plus an active deadline.
- A full submission queue returns retryable `Overloaded`; work is never secretly run on the caller thread.
- Native reads resolve once with `QueryTimeout`, request cancellation once, and quarantine the connection until the late driver callback arrives.
- Compatibility reads can only classify timeout after a blocking vendor call returns.
- Successful write, batch, or transaction results are not rewritten after completion because commit state may be ambiguous.
- Retry backoff appears in `delayedPending`; shutdown resumes delayed continuations so futures resolve with structured closed/overloaded status rather than `broken_promise`.

Destroying an unconsumed future is valid; the Client still owns the operation. Do not shut down a Client from one of its own row, transaction, observer, or interceptor callbacks.
