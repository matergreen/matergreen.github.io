# Features and semantic boundaries

This page is aligned with the 1.2.0 implementation and separates API existence, live validation, and vendor-native execution. Oracle/ODBC native async and async-topology hardening are included in 1.0.1.

## Data access

Parameterized query/execute, multiple results and routines, transactions/savepoints, atomic batches, cursors/row callbacks, generated keys, prepared cache/handles, strict header-only mapping, and portable CRUD Builder are implemented. Vendor routine and key syntax remains explicit. Builder intentionally excludes joins, expressions, upsert, locking, and arbitrary dialect translation.

MySQL, PostgreSQL, Oracle OCI, and ODBC are separate components. The Value model includes decimal/date/time/UUID/JSON/blob, intervals, arrays/composites, and typed Oracle collections/objects. Unsupported vendor combinations fail explicitly. StreamSource is currently buffered before binding.

## Pool and topology

Pools support min/max, borrow timeout, idle/lifetime eviction, validation, leak warnings, and sync/async waiters. Groups provide weighted reads, primary writes, replica fallback, request and time-window read-after-write, shadow routing, and dynamic publication/removal with reference checks and grace periods.

## Resilience boundaries

Reads retry only retryable errors. Writes default to one attempt and require explicit idempotency to retry. SQLConduit provides no leader election, lease, or fencing; multi-primary failover requires acknowledgement of external fencing and switches only on errors proving SQL did not execute. Execution-time disconnect/timeout is ambiguous and is never blindly replayed.

Volatile write buffering requires explicit duplicate/data-loss acknowledgement. `Buffered` is not committed success and the queue is not a WAL, broker, or exactly-once mechanism.

## Async coverage

Every result reports Native or CompatibilityFallback. PostgreSQL eligible query/execute uses a shared libpq reactor; supported MySQL clients provide parameter-free single-statement native paths; eligible Oracle uses OCI nonblocking; ODBC polls only when the selected driver reports async capability. FreeTDS and parameterized MySQL fall back. Group query/execute routing is asynchronous and final mode follows the leaf. Transactions, cursors, batches, multiple results, and generated keys use compatibility workers.

Pool wait can park without a worker, submission is bounded, native reads have active deadlines/cancellation/quarantine, and successful writes are not reclassified after completion.

## Governance and telemetry

SQL audit, global/fingerprint rate limits, custom limiters, route/before/after/completion interceptors, bounded query cache, template/rendered SQL logs, slow-query aggregates/recent records/histograms, pool/async stats, periodic reports, and Prometheus text are implemented. Sensitive rendered values are opt-in and fingerprint series have a hard cardinality limit. Applications own HTTP serving.

## Not claimed

SQLConduit is not a proxy, ORM, migration framework, or leader-election system. It does not translate arbitrary SQL or inject SQL Server OUTPUT. The public API currently has no cancel Handle, coroutine wrapper, or custom executor. StreamSource is not yet incremental server streaming. Live validation breadth varies by driver/platform; run integration tests in the deployment environment.

## 1.1–1.2 usability additions

Direct raw/entity/one/scalar/column results, strict one-line mapping, member-pointer CRUD, named values, Builder execution and completion-based typed async reduce application decoding code. Offset pagination provides hasNext by probing one extra row and opt-in COUNT, not keyset paging or automatic snapshot consistency. Per-call controls cover queue/pool/retry/execution budgets with explicit ambiguous-write semantics.

CLI validation/explanation/probes, starters/reload previews, runtime diagnostics/capability snapshots and optional OpenTelemetry are implemented. Oracle/OCI was not revalidated for 1.2.0; capability existence is not live qualification. See [API overview](/en/api/).
