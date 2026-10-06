# Async execution guide

SQLConduit 1.0 uses Client future methods:

```cpp
auto pending = client.queryAsync(
    "SELECT id,name FROM users WHERE id=?", {std::int64_t(42)});
auto result = pending.get();
if (!result.status.ok()) handle(result.status);
```

Submission has bounded `Overloaded` backpressure; eligible query/execute pool waits do not occupy workers; supported vendors use genuine nonblocking state machines; composite work stays on an explicit bounded compatibility executor; and shutdown resolves accepted futures, including delayed retry backoff.

Always check status before mode. Fallback is supported, not failure, but blocking vendor I/O consumes a worker. Capacity planning should track fallbackOperations, active, queueDepth, and rejected.

Native read deadlines resolve the future, request cancellation, and quarantine the connection until the late completion arrives. Compatibility reads can classify timeout only after a blocking call returns. Successful writes/batches/transactions are not rewritten after completion because commit state may be ambiguous.

For ordinary group query/execute, replica selection, retry, cache, primary fallback, safe write failover, and shadow routing run in async topology state machines. Outer audit/interceptors run once; final mode follows the selected leaf operation.

Avoid immediate `.get()` when concurrency is desired, nested async pool borrow inside a transaction callback, treating Native as success, destroying the Client before orderly shutdown, and assuming statement timeout guarantees server-side kill.

See the complete [Future async API](/en/api/async).
