# 配置参考

SQLConduit 接受 JSON、YAML 和程序化 `config::GlobalConfig`。JSON/YAML 使用同一份 `config/sqlconduit.schema.json`：未知字段、错误类型、越界值和无效引用都会返回 `ConfigError`，不会静默忽略。

## 最小 YAML

```yaml
default_datasource: main
pool:
  min: 1
  max: 8
  borrow_timeout_ms: 3000
datasources:
  - name: main
    type: postgres
    host: 127.0.0.1
    port: 5432
    user: app
    password_env: APP_DB_PASSWORD
    database: app
```

```bash
export APP_DB_PASSWORD='secret'
```

生产环境优先使用 `password_env`。错误和 `describe()` 会脱敏凭据，但完整带参 SQL 仍可能包含业务敏感值。

## 顶层字段

| 字段 | 用途 | 关键默认值/说明 |
| --- | --- | --- |
| `default_datasource` | 无命名调用的目标 | 必须引用 datasource 或 group |
| `heartbeat_interval_ms` | 后台健康检查周期 | 5000 |
| `pool` | 全局池默认值 | 可通过运行时动态选项扩展 |
| `retry` / `circuit_breaker` | 失败策略 | 写重试默认关闭 |
| `observability` | SQL 日志、慢 SQL、池指标、周期报告 | 指标默认开启，敏感值默认隐藏 |
| `rate_limit` / `sql_audit` | 治理策略 | 默认关闭 |
| `query_cache` / `prepared_cache` | 结果缓存与 prepared LRU | query cache 默认关闭 |
| `cursor` / `async` / `interceptors` | 游标、future、拦截器 | async 默认开启，interceptors 默认关闭 |
| `datasources` / `groups` | 叶子连接和逻辑路由 | 名称唯一、引用必须存在 |

## 数据源字段

```yaml
datasources:
  - name: pg
    type: postgres
    host: db.internal
    port: 5432
    user: app
    password_env: APP_DB_PASSWORD
    database: app
    connection_timeout_ms: 5000
    socket_timeout_ms: 30000
    query_timeout_ms: 30000
    max_result_rows: 50000
    tls_enabled: true
    tls_verify_peer: true
    tls_ca: /etc/ssl/db-ca.pem
```

`type` 为 `mysql`、`postgres`、`oracle` 或 `odbc`。`dsn` 主要用于 ODBC；`extra` 传递驱动特定字符串字段。连接、socket、query timeout 是不同阶段的限制，0 的精确含义按字段和驱动定义。

### Oracle

```yaml
- name: ora
  type: oracle
  host: 127.0.0.1
  port: 1521
  user: app
  password_env: ORACLE_PASSWORD
  oracle:
    service_name: FREEPDB1
    # sid: FREE              # 与 service_name 二选一
    charset_id: 873          # AL32UTF8
    lob_max_bytes: 4194304
    blob_bind: auto          # auto | raw | lob
    wallet_location: ""
    server_cert_dn: ""
```

- `service_name` 与 `sid` 表达不同连接语义，不应同时含糊配置。
- `blob_bind=auto` 根据大小选择；`raw` 受 Oracle RAW 限制，`lob` 使用临时 LOB。
- `lob_max_bytes` 是结果物化护栏，不是数据库列上限。
- wallet/cert DN 用于 TCPS 验证；不要通过关闭 peer verification 掩盖证书问题。

### ODBC / SQL Server

```yaml
- name: mssql
  type: odbc
  dsn: "Driver={ODBC Driver 18 for SQL Server};Server=tcp:db,1433;Database=app;Encrypt=yes;TrustServerCertificate=no"
  user: sa
  password_env: MSSQL_PASSWORD
```

DSN/连接串格式由 ODBC Driver Manager 和具体驱动决定。FreeTDS 与 Microsoft Driver 的异步、Unicode、批量和 TLS 能力不同，SQLConduit 会按能力选择 native 或 fallback。

## 连接池

```yaml
pool:
  enabled: true
  min: 2
  max: 16
  borrow_timeout_ms: 3000
  idle_timeout_ms: 600000
  max_lifetime_ms: 1800000
  leak_detection_threshold_ms: 30000
  validation_interval_ms: 30000
```

`max` 是每个叶子数据源的上限，不是全进程总数。连接被 Session/Cursor 长时间持有时仍计为 borrowed。leak detection 只报警，不会强行回收仍被使用的连接。

## 重试、熔断与幂等

```yaml
retry:
  max_attempts: 3
  initial_backoff_ms: 50
  max_backoff_ms: 500
  retry_writes: false
circuit_breaker:
  failure_threshold: 5
  open_interval_ms: 30000
```

仅 retryable 状态进入退避。读可自动重试；写默认一次，除非显式幂等。熔断是数据源级保护，不是数据库健康证明。

## 读写组、影子库与故障转移

```yaml
groups:
  - name: app
    primary: main
    replicas:
      - name: replica_1
        weight: 2
    read_after_write_ms: 1000
    fallback_to_primary: true
    shadow: shadow_db
    failover:
      primaries: [main_standby]
      acknowledge_external_fencing: true
      require_healthy: true
      write_buffer:
        enabled: false
        acknowledge_data_loss_and_duplicates: false
        max_queue: 1000
        ttl_ms: 30000
        flush_interval_ms: 1000
```

- 普通读按权重选副本；失败可回主库。写发主库。
- 同一 `ContextScope` 成功写后，后续读固定主库；没有上下文时使用 group 的时间窗。
- `ctx.shadow=true` 时读写都转到 shadow，不回写主拓扑。
- 多主切换必须确认外部 fencing；SQLConduit 不提供选主、租约或防双写。
- 只在能证明 SQL 未执行的错误上切换写主库；执行中断线/超时不重放。
- write buffer 是进程内易失队列，不提供 exactly-once 或持久化。

## SQL 日志与慢 SQL

```yaml
observability:
  sql_log:
    enabled: true
    mode: rendered       # template | rendered
    level: info
    log_success: true
    log_errors: true
    slow_only: false
    sample_rate: 0.1
    max_sql_length: 8192
    max_param_length: 256
    include_string_values: false
    include_blob_values: false
  slow_sql:
    enabled: true
    threshold_ms: 500
    aggregate_capacity: 1000
    recent_capacity: 200
    retain_rendered_sql: false
  pool_metrics:
    enabled: true
```

要打印完整带参 SQL，使用 `mode: rendered`，并按需打开字符串/Blob；默认关闭是为了防止密码、令牌和个人信息泄漏。即使开启也受最大长度截断。慢 SQL 聚合使用结构指纹，不以原始 SQL 作为无限标签。

## 审计、限流与缓存

```yaml
sql_audit:
  enabled: true
  action: block          # warn | block
  block_no_where_dml: true
  require_limit_select: false
  enforce_read_only: false
rate_limit:
  enabled: true
  global_qps: 1000
  per_fingerprint_qps: 100
  burst: 200
  fingerprint_mode: structural
query_cache:
  enabled: true
  ttl_ms: 1000
  max_entries: 10000
  max_memory_bytes: 67108864
  cache_on_replica_only: true
```

缓存只适合可安全复用的查询结果。成功写会按拓扑失效相关数据源缓存，但 SQLConduit 不分析表级依赖。结果转换拦截器应设置 `transformed`；缓存保存原始行并在每次请求重新变换。

## 程序化配置

所有 YAML/JSON 字段都有同名 C++ 配置结构。程序化配置仍经过语义校验：

```cpp
sqlconduit::config::GlobalConfig cfg;
cfg.default_datasource = "main";
cfg.pool.max = 8;
cfg.async.queue_size = 4096;

sqlconduit::config::DataSourceConfig ds;
ds.name = "main";
ds.type = "postgres";
ds.host = "127.0.0.1";
ds.port = 5432;
ds.user = "app";
ds.password_env = "APP_DB_PASSWORD";
ds.database = "app";
cfg.datasources.push_back(ds);

auto st = client.init(cfg);
```

也可先单独解析文件，在创建 Client 前做额外检查：

```cpp
#include <sqlconduit/config/config_loader.h>

sqlconduit::config::GlobalConfig cfg;
std::string error;
if (!sqlconduit::config::ConfigLoader::loadFromFile(
        "config/datasources.yaml", cfg, error)) {
    report(error);
    return;
}
auto st = client.init(cfg); // init 仍会做完整语义校验
```

`ConfigLoader` 的 `bool` 只表示解析结果，错误原因在 `error` 中；不要因为手工解析过就跳过 `Client::init` 的验证与运行时构建。

## 配置工具与心跳（1.1–1.2）

sqlconduitctl validate/explain/doctor 提供离线检查与显式连接探测；1.2 新增 init 模板和 reload --dry-run。预览不应用拓扑，真实 reload 替换全部候选池。heartbeat_interval_ms 默认 5000，1.2 起 0 明确关闭周期心跳。见[配置工具与诊断](./diagnostics)、[模板与重载预览](./query-results)。
