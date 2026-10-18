# API reference

The high-level entry point is `sqlconduit::Client`: a move-only instance that owns its driver registry, pools and topology, cache, interceptors, telemetry, and async executor. The former process-wide facade, async free functions, callback Handle, and coroutine Task were removed before 1.0.

::: tip Example assumptions
Examples include `sqlconduit/sqlconduit.h`, use `?` placeholders, and register drivers on the Client before `init()`. Drivers bind values; never concatenate untrusted input.
:::

## Choose an entry point

| Need | API | Important semantics |
| --- | --- | --- |
| One query/write | `Client::query` / `execute` | Borrows and returns a connection |
| Named source | overload with leading `dataSource` | `ContextScope::targetDataSource` can override routing |
| Multiple results/routines | `queryAll` / `call` | OUT/INOUT use `CallParam` |
| Several statements, one connection | `withSession` | Does not begin a transaction |
| Atomic work | `transaction` | Success commits; error or exception rolls back |
| Large result | `queryEach` / `openCursor` | Row-wise or paged consumption |
| Batch write | `executeBatch` | Atomic rollback when no outer transaction exists |
| Background work | `Client::*Async` | Returns `std::future` with execution mode |
| Entity mapping | `query<T>` / `queryOne<T>`; free helpers retained | Read items/value after registering a mapping once |
| Dynamic topology | add/remove datasource/group | Reference checks plus grace period |
| Runtime telemetry | pool/slow SQL/observer/async stats | Isolated per Client |

## Reference pages

- [Client and telemetry](./sync)
- [Session and Cursor](./session)
- [Future async API](./async)
- [Entity mapping](./mapping)
- [Types and errors](./types)
- [Configuration reference](./configuration)
- [SQL Builder and utilities](./sql-tools)

## Minimal complete program

```cpp
#include "sqlconduit/sqlconduit.h"
#include "sqlconduit/drivers/postgres.h"

int main() {
    sqlconduit::Client client;
    auto st = client.addDriver(sqlconduit::drivers::postgres());
    if (st.ok()) st = client.init("config/datasources.yaml");
    if (!st.ok()) return 1;

    sqlconduit::common::ResultSet rows;
    st = client.query(
        "SELECT id, name FROM users WHERE active = ?",
        sqlconduit::common::Params{true}, rows);

    client.shutdown();
    return st.ok() ? 0 : 1;
}
```

::: warning Lifecycle
A second `init()` returns `AlreadyInitialized`; use `reload()` for configuration replacement. Do not destroy, move, reload, or shut down a Client from one of that same Client's observer, interceptor, row, or transaction callbacks. Schedule lifecycle work after the callback returns.
:::

The authoritative signatures live under [`include/sqlconduit`](https://github.com/matergreen/SQLConduit/tree/v1.2.0/include/sqlconduit). Documented application APIs, configuration Schema, error values, and stable metrics remain source-compatible across 1.x.

## New in 1.2

- [Direct query results](/en/api/query-results): raw rows, entity/one/scalar/column helpers, named bindings, Builder execution, strict errors and per-call timeout/cancellation.
- [Typed pagination](/en/api/pagination): page/size, hasNext, optional totals, async aggregation and Session consistency.
- [Configuration tools and diagnostics](/en/api/diagnostics): validate/explain/doctor, runtime snapshots and optional OpenTelemetry (since 1.1).

Examples target v1.2.0. Existing output-parameter and free mapping APIs remain supported.
