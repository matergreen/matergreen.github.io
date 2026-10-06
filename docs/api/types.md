# 类型、上下文与错误

## `Value` 与参数

`common::Value` 是统一绑定和结果值 variant：

- `nullptr_t`、`bool`、`int64_t`、`uint64_t`、`double`、`std::string`、`Blob`、`Timestamp`；
- `Decimal`、`Date`、`Time`、`Uuid`、`Json`；
- `IntervalYearMonth`、`IntervalDaySecond`；
- `Array`、`Composite`、带数据库类型名的 `TypedArray`、`TypedComposite`。

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

`Decimal` 保留文本精度，Date/Time/Uuid/Json 强类型保留意图。驱动会验证不支持的组合；不要假设所有数据库支持相同的数组、对象或 interval。

## `Row` 与 `ResultSet`

```cpp
for (const auto &row : result.rows()) {
    if (row.has("name")) {
        const auto &value = row.at("name");
        if (const auto *name = std::get_if<std::string>(&value)) use(*name);
    }
}

auto fields = result.fields();
auto count = result.rowCount();
result.clear();
```

`Row::at()` 找不到列时返回静态 NULL 值。`ResultSet::mutableRows()` 只应由明确的结果转换逻辑使用；拦截器改写后设置 `transformed=true`，避免把用户特定结果放入共享查询缓存。

## 批量、生成键、调用与流输入

```cpp
using namespace sqlconduit::common;

ParamBatch batch{{std::int64_t(1)}, {std::int64_t(2)}};
BatchResult batchOut;       // affected、keys、totalAffected()
GeneratedKeys keys;         // rows

CallParams callArgs{
    CallParam{std::int64_t(7)},
    CallParam::out(ValueType::String, 2048),
    CallParam::refCursor()
};
CallOutput callOut;         // sets、outParams、affected
```

`CallParam` 用 `ParamDirection::{In,Out,InOut}`、`ValueType`、可选 typeName 和 maxBytes 描述调用参数。输出缓冲上限应按真实数据设置，避免无界内存。

`StreamSource` 可从流或读取回调构造，并通过 `StreamParams`/`StreamParamBatch` 传入；当前驱动在绑定前缓冲内容。

## 事务与游标选项

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

隔离级别为 `Default`、`ReadUncommitted`、`ReadCommitted`、`RepeatableRead`、`Serializable`。驱动不支持的选项会返回明确状态，不静默模拟更强语义。

## `SqlContext` 与作用域

```cpp
sqlconduit::common::SqlContext ctx;
ctx.traceId = "0123456789abcdef0123456789abcdef";
ctx.spanId = "0123456789abcdef";
ctx.tenantId = "tenant-42";
ctx.targetDataSource = "tenant_42_rw";
ctx.shadow = false;
ctx.idempotency = sqlconduit::common::Idempotency::Idempotent;

sqlconduit::common::ContextScope scope(ctx);
auto st = client.execute("UPDATE jobs SET claimed=1 WHERE id=?",
                         sqlconduit::common::Params{std::int64_t(9)}, affected);
```

ContextScope 是线程局部 LIFO 栈。异步提交会捕获当前上下文。`wroteInThisRequest` 由中间件维护，用于同一请求内写后读主库，应用不应手工设置。可用 `parseTraceparent` / `formatTraceparent` 处理 W3C traceparent。

## `Status` 与错误处理

```cpp
auto st = client.query("SELECT 1", rows);
if (!st.ok()) {
    log(sqlconduit::common::errorCodeToString(st.code),
        st.message, st.sqlState, st.nativeCode,
        st.retryable, st.connectionBroken);
}
```

`Status` 字段：`code`、`message`、`sqlState`、`nativeCode`、`retryable`、`connectionBroken`。稳定错误码包括：

| 类别 | 错误码 |
| --- | --- |
| 配置/生命周期 | `ConfigError`、`UnknownDriver`、`DriverDisabled`、`NotInitialized`、`AlreadyInitialized`、`ClientClosed` |
| 连接/池 | `ConnectionFailed`、`NotConnected`、`PingFailed`、`PoolExhausted`、`PoolClosed` |
| SQL/事务 | `QueryError`、`QueryTimeout`、`Cancelled`、`ConstraintViolation`、`Deadlock`、`TxError` |
| 策略 | `CircuitOpen`、`RateLimited`、`SqlBlocked`、`Overloaded` |
| 其他契约 | `Buffered`、`NotSupported`、`CursorClosed`、`CursorLimit`、`CursorError`、`MappingError`、`IoError`、`Unknown` |

::: warning `Buffered` 不是成功
`Status::ok()` 仅在 code 为 `Ok` 时为 true。`Buffered` 表示写已进入易失内存队列，可能重复、过期或在进程退出时丢失；只有显式接受这些风险才可启用。
:::

只有 `retryable=true` 说明策略可以考虑重试；写入还必须满足幂等声明。`connectionBroken=true` 说明连接不可安全复用。

## 观测与异步结果

`OperationEvent` 提供数据源、操作类型、耗时、行数、状态和 trace/shadow 上下文；`SlowSqlStats` 是指纹聚合，`SlowSqlRecord` 是最近记录；`NamedPoolStats` 包含每个池的 gauges、counters、peaks 和 wait timings。

异步结果类型：

| 类型 | 载荷 |
| --- | --- |
| `async::QueryResult` | `rows` |
| `async::MultiQueryResult` | `sets`、`rowCount()` |
| `async::ExecResult` | `affected` |
| `async::ExecKeysResult` | `affected`、`keys` |
| `async::EachResult` | `rows` |
| `async::BatchResult` | `batch` |
| `async::OpResult` | 仅状态 |

它们都包含 `status` 和 `ExecutionMode`。
