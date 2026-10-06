# Configuration reference

SQLConduit accepts JSON, YAML, or programmatic `config::GlobalConfig`. JSON and YAML share `config/sqlconduit.schema.json`; unknown keys, wrong types, invalid ranges, and broken references return `ConfigError` instead of being ignored.

## Minimal YAML

```yaml
default_datasource: main
pool: { min: 1, max: 8, borrow_timeout_ms: 3000 }
datasources:
  - name: main
    type: postgres
    host: 127.0.0.1
    port: 5432
    user: app
    password_env: APP_DB_PASSWORD
    database: app
```

Prefer `password_env` in production. Errors and datasource descriptions redact credentials, but rendered parameter logs can still contain business secrets.

Top-level sections are pool, retry, circuit_breaker, observability, rate_limit, sql_audit, query_cache, prepared_cache, cursor, async, interceptors, datasources, and groups. `default_datasource` must reference a leaf or group.

## Datasource and Oracle details

Common fields include name/type, host/port/user/password or password_env/database, ODBC dsn, connection/socket/query timeouts, result-row guard, TLS fields, and driver `extra` values. Types are mysql, postgres, oracle, and odbc.

```yaml
- name: ora
  type: oracle
  host: 127.0.0.1
  port: 1521
  user: app
  password_env: ORACLE_PASSWORD
  oracle:
    service_name: FREEPDB1
    charset_id: 873
    lob_max_bytes: 4194304
    blob_bind: auto       # auto | raw | lob
    wallet_location: ""
    server_cert_dn: ""
```

`service_name` and `sid` are different connection semantics. `raw` obeys Oracle RAW limits, `lob` uses temporary LOBs, and `lob_max_bytes` is a materialization guard. Wallet and server certificate DN configure TCPS verification.

ODBC DSN syntax and capabilities belong to the selected Driver Manager/driver. FreeTDS and Microsoft Driver differ in async, Unicode, batch, and TLS support; SQLConduit capability-gates the path.

## Pool, retry, and groups

```yaml
pool:
  min: 2
  max: 16
  borrow_timeout_ms: 3000
  idle_timeout_ms: 600000
  max_lifetime_ms: 1800000
  leak_detection_threshold_ms: 30000
  validation_interval_ms: 30000
retry:
  max_attempts: 3
  initial_backoff_ms: 50
  max_backoff_ms: 500
  retry_writes: false
circuit_breaker:
  failure_threshold: 5
  open_interval_ms: 30000
groups:
  - name: app
    primary: main
    replicas: [{ name: replica_1, weight: 2 }]
    read_after_write_ms: 1000
    fallback_to_primary: true
    shadow: shadow_db
    failover:
      primaries: [main_standby]
      acknowledge_external_fencing: true
      require_healthy: true
```

Pool max is per leaf, not process-wide. Leak detection reports; it does not steal an in-use connection. Only retryable failures back off, and writes need idempotency. Weighted replicas serve reads, writes use primary, request context pins reads after a successful write, and `shadow=true` cuts traffic to the shadow target.

SQLConduit has no leader election or fencing. Multi-primary write failover requires acknowledgement of external fencing and switches only on errors proving SQL did not execute. Volatile write buffering additionally requires explicit duplicate/data-loss acknowledgement and is not exactly-once or durable.

## Logs, slow SQL, audit, limits, and cache

```yaml
observability:
  sql_log:
    enabled: true
    mode: rendered
    sample_rate: 0.1
    include_string_values: false
    include_blob_values: false
  slow_sql:
    enabled: true
    threshold_ms: 500
    aggregate_capacity: 1000
    recent_capacity: 200
    retain_rendered_sql: false
  pool_metrics: { enabled: true }
sql_audit:
  enabled: true
  action: block
  block_no_where_dml: true
rate_limit:
  enabled: true
  global_qps: 1000
  per_fingerprint_qps: 100
  burst: 200
query_cache:
  enabled: true
  ttl_ms: 1000
  max_entries: 10000
  max_memory_bytes: 67108864
  cache_on_replica_only: true
```

Rendered SQL requires explicit string/blob disclosure and remains length-bounded. Keep values off by default in production. Slow aggregation uses structural fingerprints. Cache invalidation is topology-wide on successful writes, not table dependency analysis; transformed results are not cached.

Every file field has a matching C++ config member. Programmatic configuration still passes semantic validation before `Client::init(cfg)` publishes a runtime.

To parse before constructing a Client and run application-specific checks:

```cpp
#include <sqlconduit/config/config_loader.h>

sqlconduit::config::GlobalConfig cfg;
std::string error;
if (!sqlconduit::config::ConfigLoader::loadFromFile(
        "config/datasources.yaml", cfg, error)) {
    report(error);
    return;
}
auto st = client.init(cfg); // still performs full semantic validation
```

The `bool` reports parsing success and `error` carries the diagnostic. Parsing does not replace `Client::init`, which validates semantics and constructs the runtime.
