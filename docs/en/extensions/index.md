# Extend a database driver

The SPI has three layers: `IDriver` creates connections, `IDatabaseConnection` implements protocol operations, and `ICursor` implements incremental reads. Register ordinary extensions on a Client before init:

```cpp
auto st = client.addDriver({
    "example", [] { return std::make_unique<ExampleDriver>(); }
});
```

`IDriver::name()` and `createConnection()` are required. A minimal connection implements connect, ping, query, execute, begin, commit, rollback, close, and isOpen. Parameter, prepared, batch, cursor, multi-result, call, generated-key, stream, savepoint, cancel, and async methods have fallback/NotSupported defaults; production drivers should explicitly implement real capabilities.

For native parameters, override Params query/execute and `supportsParams`. Implement the prepared lifecycle and cache limit only when handles are truly connection-bound. Never enable literal interpolation unless escaping is provably correct.

## Native async contract

A connection may report `AsyncCapability::Native` only when query/execute starts without blocking and invokes completion exactly once later. Returning false means no operation started and fallback is safe. Cancellation and late completion must leave connection reuse provable or report it broken. A blocking vendor call moved onto a polling worker is not native async.

Map stable ErrorCode plus SQLSTATE, native code, retryable, and connectionBroken. Redact credentials and connection strings. Cursor implementations must define transaction ownership; batch optimization must preserve atomic and per-item results; multiple-result/call implementations must not discard later sets or OUT values.

Validate NULL/Unicode/binary/decimal/time/large values, all transaction outcomes, post-cancel connection reuse, async race and shutdown behavior, batch/cursor/call/key equivalence, error redaction, all target platforms, and real database integration rather than mocks alone.
