# Client and runtime API

Header: `sqlconduit/client.h`; applications normally include `sqlconduit/sqlconduit.h`. Include each driver factory separately, for example `sqlconduit/drivers/postgres.h`.

## Lifecycle and driver registration

```cpp
sqlconduit::Client client;
auto st = client.addDriver(sqlconduit::drivers::mysql());
if (st.ok()) st = client.addDriver(sqlconduit::drivers::postgres());
if (st.ok()) st = client.init("config/datasources.yaml");

st = client.reload("config/datasources.json", std::chrono::seconds(5));
bool ready = client.isRunning();
client.shutdown(std::chrono::seconds(5));
```

Drivers are registered only on this Client and before `init()`. Registration functions are `drivers::mysql()`, `postgres()`, `oracle()`, and `odbc()`. A referenced but unregistered driver returns `UnknownDriver`; an unbuilt component returns `DriverDisabled`.

`init()` accepts a JSON/YAML path or `config::GlobalConfig`. A failed init leaves the object reusable; a second successful init returns `AlreadyInitialized`. `reload()` builds and validates a replacement topology before publishing it atomically. `shutdown()` rejects new work, drains accepted futures, then closes pools; it is idempotent.

## Query, execute, multiple results, and calls

```cpp
sqlconduit::common::ResultSet rows;
auto st = client.query(
    "SELECT id, name FROM users WHERE status=? AND age>=?",
    sqlconduit::common::Params{std::string("active"), std::int64_t(18)}, rows);

std::int64_t affected = 0;
st = client.execute("primary",
    "UPDATE users SET active=? WHERE id=?",
    sqlconduit::common::Params{false, std::int64_t(42)}, affected);

std::vector<sqlconduit::common::ResultSet> sets;
st = client.queryAll("CALL list_reports(?)",
                     sqlconduit::common::Params{std::int64_t(7)}, sets);

sqlconduit::common::CallParams args{
    sqlconduit::common::CallParam{std::int64_t(7)},
    sqlconduit::common::CallParam::out(sqlconduit::common::ValueType::String, 1024),
    sqlconduit::common::CallParam::refCursor()
};
sqlconduit::common::CallOutput output;
st = client.call("BEGIN report_pkg.run(?, ?, ?); END;", args, output);
```

Overloads without a datasource use `default_datasource`. `queryAll()` collects all result sets; `call()` also returns OUT/INOUT values and affected count. SQLConduit does not translate routine dialects.

Write retry is off by default. It is enabled only by explicit idempotency context or `retry_writes`. An execution-time disconnect or timeout can have an ambiguous commit result and is never blindly replayed on another primary.

## Rows, batches, sessions, and transactions

```cpp
std::uint64_t seen = 0;
st = client.queryEach(
    "SELECT id, payload FROM events WHERE id>?", {std::int64_t(100)},
    [](const sqlconduit::common::Row &row) { consume(row); return true; }, seen);

sqlconduit::common::BatchResult batch;
st = client.executeBatch(
    "INSERT INTO tags(name, owner_id) VALUES(?, ?)",
    {{std::string("a"), std::int64_t(1)},
     {std::string("b"), std::int64_t(2)}}, batch);

st = client.withSession([](sqlconduit::core::Session &s) {
    sqlconduit::common::ResultSet rows;
    return s.query("SELECT current_user", rows);
});

sqlconduit::common::TransactionOptions tx;
tx.isolation = sqlconduit::common::IsolationLevel::Serializable;
tx.timeout = std::chrono::seconds(3);
st = client.transaction("primary", tx, [](sqlconduit::core::Session &s) {
    std::int64_t affected = 0;
    return s.execute("UPDATE account SET touched=1 WHERE id=?",
                     {std::int64_t(1)}, affected);
});
```

Returning `false` from a row callback stops successfully. Batch execution is atomic when there is no outer transaction. `withSession()` pins one connection but does not begin a transaction. `transaction()` commits only an OK callback; an error or exception rolls back. Do not nest Client async calls inside a transaction callback.

## Datasource handles and dynamic topology

```cpp
auto source = client.dataSource("analytics");
if (source) source->query("SELECT 1", rows);

sqlconduit::config::DataSourceConfig tenant;
tenant.name = "tenant_42";
tenant.type = "postgres";
tenant.host = "127.0.0.1";
tenant.port = 5432;
tenant.database = "tenant_42";
tenant.user = "app";
tenant.password_env = "TENANT_42_PASSWORD";

st = client.addDataSource(tenant);
sqlconduit::config::DataSourceGroupConfig group;
group.name = "tenant_42_rw";
group.primary = "tenant_42";
sqlconduit::core::GroupOptions groupOptions;
// Set only when the corresponding high-risk feature is configured:
groupOptions.acknowledge_external_fencing = true;
groupOptions.acknowledge_data_loss_and_duplicates = true;
if (st.ok()) st = client.addGroup(group, groupOptions);
if (st.ok()) st = client.removeGroup("tenant_42_rw", std::chrono::seconds(5));
if (st.ok()) st = client.removeDataSource("tenant_42", std::chrono::seconds(5));
```

`DataSource` exposes synchronous data access, sessions, transactions, cursors, and pool stats, including overloads with a per-call borrow timeout. A copied handle remains a valid C++ object after Client shutdown, but pool operations return a closed status. A datasource referenced by a group cannot be removed.

## Interceptors, rate limiting, and telemetry

```cpp
class RouteInterceptor final : public sqlconduit::core::ISqlInterceptor {
public:
    void onRoute(const std::string &, const std::string &,
                 sqlconduit::common::OperationType,
                 sqlconduit::common::SqlContext &ctx) override {
        if (ctx.tenantId == "sandbox") ctx.shadow = true;
    }
    sqlconduit::common::Status beforeExecution(
        const sqlconduit::core::ExecutionView &) override {
        return sqlconduit::common::Status::OK();
    }
    void afterExecution(const sqlconduit::core::ExecutionView &) override {}
    void onCompletion(const sqlconduit::core::ExecutionView &) override {}
};

client.addInterceptor(std::make_shared<RouteInterceptor>());
client.setDefaultRateLimiter(std::make_shared<sqlconduit::core::RateLimiter>(
    1000.0, 100.0, 200, "structural"));

sqlconduit::core::ConnectionPool::Stats pool;
client.poolStats(pool, "primary");
auto pools = client.allPoolStats();
auto aggregates = client.slowSqlStats(20);
auto recent = client.recentSlowSql(20);
auto async = client.asyncStats();
client.setObserver([](const sqlconduit::common::OperationEvent &e) { publish(e); });
```

Interceptors run only when `interceptors.enabled` is true. They may route, reject, or transform materialized results and must be thread-safe. Slow-query and pool data are Client-owned. Rendered parameter values can contain secrets; string/blob values require explicit opt-in and should not be the production default. Observer callbacks run on the calling or Client async thread and should stay short.

`RateLimiter` takes global QPS, per-fingerprint QPS, burst, and fingerprint mode. Implement the thread-safe `IRateLimiter::acquire(fingerprint)` interface to connect an external quota service.

### Prometheus text and library log level

```cpp
#include <sqlconduit/common/logger.h>
#include <sqlconduit/exporters/prometheus.h>

sqlconduit::common::Logger::setMinLevel(
    sqlconduit::common::LogLevel::Warn);

sqlconduit::common::PoolMetricsEvent event;
event.timestamp = std::chrono::system_clock::now();
event.pools = client.allPoolStats();
auto body = sqlconduit::exporters::toPrometheusText(
    event, client.slowSqlStats(100), "sqlconduit", 100);
```

`toPrometheusText` returns exposition text; your application owns the HTTP `/metrics` endpoint. Fingerprint labels have an absolute 1,000-series cap, and the example tightens it to 100. `Logger` only controls the minimum level of SQLConduit's stderr logger; use `setObserver()` to connect operation telemetry to your own tracing stack.
