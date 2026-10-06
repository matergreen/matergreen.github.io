# Production notes

These are runtime boundaries that can be hidden by a simple “API available” label. Review them before production rollout.

## Version and capability claims

- 1.0.0 is the stable release baseline; this site also tracks implemented Unreleased work on `dev`.
- API availability, native execution, and live validation on a particular database/platform combination are separate claims.
- Treat the CHANGELOG for the exact tag as authoritative; do not use `dev` documentation as a promise for an older package.

## Client and callback lifecycle

- `Client` is a move-only resource owner. Each instance owns independent pools, cache, telemetry, and async execution.
- Use `reload()` after successful initialization and call `shutdown(grace)` explicitly during service shutdown.
- Do not move, reload, shut down, or destroy a Client from its own transaction, row, observer, or interceptor callback.
- A transaction callback already holds a physical connection. Nested async borrowing from the same small pool can wait on itself.

## Async is not universally native

- Check `result.status` before `result.mode`. `CompatibilityFallback` is a supported bounded-worker path, not a failure.
- PostgreSQL ordinary query/execute has the broadest native path. MySQL prepared operations, transactions, cursors, batches, multi-result calls, and generated keys fall back.
- Oracle/ODBC native async is current Unreleased work and ODBC is runtime capability-gated; FreeTDS normally falls back.
- Capacity planning should track `active`, `queueDepth`, `rejected`, `fallbackOperations`, and pool `asyncWaiting` together.

## Writes, retries, and failover

- Writes do not retry by default. Declare `SqlContext::idempotency=Idempotent` only when the business operation proves it.
- A disconnect or timeout during execution can mean “committed but response lost”; SQLConduit does not blindly replay on another primary.
- Multi-primary failover does not implement election or fencing. External fencing and explicit acknowledgement are mandatory.
- The write buffer is volatile process memory. `Buffered` is not `Ok` and does not mean the database committed.

## Capacity, memory, and data protection

- `pool.max` applies per leaf datasource. Include all Clients, replicas, shadows, and service instances in the database connection budget.
- Cursors and Sessions keep connections borrowed; leak detection warns but never steals a live handle.
- `StreamSource` is currently buffered before binding, not constant-memory upload. Load-test large LOB peaks.
- Rendered SQL can disclose passwords, tokens, or personal data even when truncated. Keep string/blob disclosure off by default.

## Cache, interceptors, and SQL boundaries

- Query-cache invalidation is topology-wide after successful writes, not table-dependency analysis. Cache only safely reusable results.
- Result-transforming interceptors must mark `transformed` to keep user-specific output out of shared cache entries.
- SQL Builder covers verifiable CRUD only. Joins, upsert, pagination, locking, expressions, and routines remain application dialect SQL.
- SQL classification and fingerprints are observability/audit heuristics, not an authorization boundary.

## Release validation

On the target OS, client SDK, and server version, test pool exhaustion, deadlines, post-cancel reuse, network recovery, repeated reload, abandoned cursors, large/multibyte values, mid-batch failures, and graceful shutdown.
