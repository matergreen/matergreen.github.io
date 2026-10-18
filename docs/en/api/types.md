# Types, context, and errors

## Value and parameters

`common::Value` is the binding/result variant. It includes null, bool, signed/unsigned 64-bit integers, double, string, Blob, Timestamp, Decimal, Date, Time, Uuid, Json, year-month/day-second intervals, Array/Composite, and database-named TypedArray/TypedComposite.

```cpp
sqlconduit::common::Params params{
    nullptr,
    std::int64_t(42),
    sqlconduit::common::Decimal{"199.9900"},
    sqlconduit::common::Uuid{"550e8400-e29b-41d4-a716-446655440000"},
    sqlconduit::common::Json{R"({"role":"admin"})"},
    sqlconduit::common::Blob{0x01, 0x02}
};
```

Strong text types preserve intent and Decimal preserves textual precision. Vendor support for arrays, objects, and intervals differs; unsupported combinations return status errors.

## Row and ResultSet

```cpp
for (const auto &row : result.rows()) {
    if (row.has("name")) {
        if (const auto *name = std::get_if<std::string>(&row.at("name"))) use(*name);
    }
}
auto fields = result.fields();
auto count = result.rowCount();
result.clear();
```

Missing `Row::at()` returns a static null Value; use `has()` when missing and SQL NULL differ. A result-transforming interceptor should set `transformed=true` so request-specific rows never enter shared query cache.

`ParamBatch`, `BatchResult`, `GeneratedKeys`, `CallParam(s)`, and `CallOutput` model batches, keys, multiple sets, OUT/INOUT values, and affected counts. Call parameters carry direction, ValueType, optional database type name, and output max bytes. Size output buffers deliberately.

`StreamSource` feeds `StreamParams`/`StreamParamBatch` from a stream or callback. Current drivers buffer before binding; it is not constant-memory streaming.

## Transaction and cursor options

```cpp
sqlconduit::common::TransactionOptions tx;
tx.isolation = sqlconduit::common::IsolationLevel::RepeatableRead;
tx.readOnly = true;
tx.timeout = std::chrono::seconds(5);

sqlconduit::core::CursorOptions cursor;
cursor.batch_size = 256;
cursor.scrollable = false;
cursor.timeout = std::chrono::seconds(3);
cursor.auto_transaction = true;
```

Isolation values are Default, ReadUncommitted, ReadCommitted, RepeatableRead, and Serializable. Unsupported vendor options fail explicitly.

## SqlContext

```cpp
sqlconduit::common::SqlContext ctx;
ctx.traceId = "0123456789abcdef0123456789abcdef";
ctx.spanId = "0123456789abcdef";
ctx.tenantId = "tenant-42";
ctx.targetDataSource = "tenant_42_rw";
ctx.idempotency = sqlconduit::common::Idempotency::Idempotent;

sqlconduit::common::ContextScope scope(ctx);
auto st = client.execute("UPDATE jobs SET claimed=1 WHERE id=?",
                         sqlconduit::common::Params{std::int64_t(9)}, affected);
```

ContextScope is a thread-local LIFO stack and async submission captures the current context. `wroteInThisRequest` is maintained internally for sticky reads; applications must not set it. `parseTraceparent` and `formatTraceparent` support W3C trace context.

## Status and errors

`Status` contains `code`, `message`, `sqlState`, `nativeCode`, `retryable`, and `connectionBroken`. Stable groups are:

- lifecycle/config: ConfigError, UnknownDriver, DriverDisabled, NotInitialized, AlreadyInitialized, ClientClosed;
- connection/pool: ConnectionFailed, NotConnected, PingFailed, PoolExhausted, PoolClosed;
- SQL/transaction: QueryError, QueryTimeout, Cancelled, ConstraintViolation, Deadlock, TxError;
- policy: CircuitOpen, RateLimited, SqlBlocked, Overloaded;
- other contracts: Buffered, NotSupported, cursor errors, MappingError, IoError, Unknown.

::: warning Buffered is not success
Only code `Ok` makes `Status::ok()` true. `Buffered` means accepted into a volatile memory queue and may duplicate, expire, or disappear at process exit.
:::

Retry only when `retryable` is true; writes additionally require idempotency. `connectionBroken` means the connection cannot safely return to the pool.

Async result types are QueryResult, MultiQueryResult, ExecResult, ExecKeysResult, EachResult, BatchResult, and OpResult. All contain `status` and `ExecutionMode`; their payloads are rows/sets, affected count, keys, row count, or batch result as appropriate.

## Result contracts added in 1.2

| Type | Success data | Important empty/error rule |
| --- | --- | --- |
| common::QueryResult | rows | ok() distinguishes failure from no rows |
| common::ExecuteResult | affected | Inspect status, not just affected |
| `EntityResult<T>` | items | Error clears partial mappings |
| `EntityOne<T>` | optional value | Zero rows is empty; more than one fails |
| `ScalarResult<T>` | value, hasRow, isNull | No row differs from SQL NULL; exactly one column |
| `PageResult<T>` | items, page, pageSize, hasNext, optional total | No implicit COUNT; any subquery/mapping failure invalidates data |

Client async results preserve Native/CompatibilityFallback. Do not use a synchronous result mode as an async capability claim. All convenience results expose ok(); itemsOrThrow/rowsOrThrow/valueOrThrow are explicit exception-style accessors, not default substitution.

Status.outcomeUnknown marks early per-call stop of an already-started write; false is not a universal proof that a driver/commit failure is safe to replay. [Detailed semantics](./query-results).
