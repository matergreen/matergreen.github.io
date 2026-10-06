# What SQLConduit is

SQLConduit is an in-process C++17 database-access middleware. It is not a network proxy and has no separate service: link Core plus the driver components you need, then create an application-owned `sqlconduit::Client`.

```text
application → Client → policy/interceptors → routing/resilience → pool → native driver → database
```

## Where it fits

- services that access several databases, tenants, or read/write topologies;
- one contract for pooling, native binding, transactions, batches, cursors, and routines;
- centralized retry, circuits, limits, SQL audit, query cache, and shadow traffic;
- rendered SQL, slow-query, pool, and async-mode telemetry;
- futures with genuine native paths and explicit compatibility fallback.

## Supported drivers

| Database | CMake option | Registration | Main dependency |
| --- | --- | --- | --- |
| MySQL | `SQLCONDUIT_ENABLE_MYSQL` | `drivers::mysql()` | libmysqlclient |
| PostgreSQL | `SQLCONDUIT_ENABLE_POSTGRES` | `drivers::postgres()` | libpqxx + libpq |
| Oracle | `SQLCONDUIT_ENABLE_ORACLE` | `drivers::oracle()` | OCI / Instant Client SDK |
| SQL Server and other ODBC databases | `SQLCONDUIT_ENABLE_ODBC` | `drivers::odbc()` | unixODBC or Windows ODBC |

Building a component does not register it in a `Client`. Call the matching `addDriver()` before `init()`.

## Three boundaries to remember

1. `Client` is a move-only, instance-owned runtime, not a process-wide singleton.
2. Only `Status::ok()` means committed success. `Buffered` means accepted by a volatile queue, not committed.
3. `Native` means this driver operation was genuinely nonblocking; every other future reports `CompatibilityFallback`.

## Next steps

1. [Download, build, and configure](/en/guide/getting-started)
2. [Queries, transactions, and runtime management](/en/guide/core-usage)
3. [Batches, cursors, and large values](/en/guide/data-processing)
4. [Async execution semantics](/en/guide/async)
5. [Browse the API by class](/en/api/)
