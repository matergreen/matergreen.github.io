# 功能与语义边界

本页与 1.2.0 代码实现对齐，不把“存在 API”“已经过实库验证”“所有厂商路径都 native”混为一谈。Oracle/ODBC native async 和异步拓扑加固已纳入 1.0.1。

## 数据访问

| 能力 | 状态 | 解读 |
| --- | --- | --- |
| 参数化 query/execute | 已实现 | 统一 `?`，驱动原生绑定 |
| 多结果集与例程 | 已实现，能力依厂商 | `queryAll`、`call`、OUT/INOUT、Oracle ref cursor |
| 事务与保存点 | 已实现 | 固定连接、异常安全回滚、timeout/cancel |
| 批量 | 已实现 | 原子契约；pipeline、multi-statement、parameter array、array DML 或安全回退 |
| Cursor / queryEach | 已实现 | PostgreSQL server cursor、MySQL unbuffered、ODBC/OCI cursor |
| 生成键 | 已实现，SQL 依方言 | PostgreSQL/SQL Server 通常显式 RETURNING/OUTPUT |
| Prepared cache | 已实现 | 每连接 LRU；也可 Session 显式 handle |
| 实体映射 | 已实现 | header-only 严格转换，不是 ORM |
| SQL Builder | 已实现 | 可移植 CRUD；不覆盖 JOIN/upsert/表达式等方言 SQL |

## 驱动与类型

- MySQL、PostgreSQL、Oracle OCI、ODBC 是独立静态组件，按需链接和注册。
- 公共 Value 覆盖 Decimal、日期时间、UUID、JSON、Blob、interval、数组/复合值与 Oracle typed collection/object。
- 厂商扩展类型不会被假装成跨库可移植；不支持时返回 `NotSupported` 或驱动错误。
- `StreamSource` 当前仍由驱动缓冲后绑定，不是常量内存上传。

## 连接与拓扑

| 能力 | 语义 |
| --- | --- |
| 连接池 | min/max、borrow timeout、idle/lifetime、validation、leak warning、同步/异步 waiter |
| 心跳 | 周期检查空闲连接，服从 validation interval |
| 读写组 | weighted replicas、主库写、副本失败回主库、read-after-write |
| 请求粘滞 | ContextScope 内成功写后，后续读主库 |
| Shadow | `ctx.shadow=true` 把组读写切到 shadow，不污染主结果 |
| 动态拓扑 | add/remove datasource/group，带引用检查和 grace period |

## 韧性声明

### Retry 与幂等

读只在 retryable 错误上退避重试。写默认不重试；调用方可以通过 `SqlContext::idempotency` 明确声明。非幂等写绝不因普通 retry 配置自动重放。

### 主库故障转移

SQLConduit 不提供 leader election、租约或 fencing。配置多个写主库前必须确认外部系统已经 fencing。只有连接创建失败、池关闭/耗尽、驱动禁用、预执行熔断等能证明 SQL 未执行的状态才切换；执行中断线/超时可能已经提交，不会重放。

### Write buffer

这是可选进程内易失队列，需要明确接受丢失与重复。返回 `Buffered` 不等于提交成功；队列不是 WAL、消息队列或 exactly-once 方案。

## 异步能力

所有异步结果包含 `ExecutionMode`。`Native` 只用于真正不占兼容 worker 的驱动 query/execute；其余是 `CompatibilityFallback`。

| 路径 | Native 范围 |
| --- | --- |
| PostgreSQL | 合格 query/execute 使用共享 libpq socket reactor |
| MySQL | 受支持客户端的无参数单语句；prepared 参数回退 |
| Oracle | 合格 OCI nonblocking；临时 LOB 输入等回退 |
| ODBC | 驱动报告 async 时轮询；FreeTDS 回退 |
| Group query/execute | 路由本身异步，最终模式看叶子 |
| 事务/游标/批量/多结果/生成键 | 兼容执行器 |

异步池等待不占 worker；公开队列有背压；native 读有主动 deadline/取消/连接隔离。成功写不会因本地 deadline 事后改写。

## 治理与可观测性

- SQL audit：无 WHERE DML、SELECT 行数约束、只读、黑白名单指纹；
- rate limit：全局和结构指纹级 QPS，支持自定义 `IRateLimiter`；
- interceptor：route/before/after/completion，支持安全结果转换；
- query cache：TTL/LRU/内存上限、拓扑失效、原始结果与 transformed 隔离；
- SQL log：template/rendered、采样、慢 SQL only、长度限制、字符串/Blob 明示授权；
- slow SQL：有界指纹聚合、最近记录、histogram；
- pool/async stats：快照、峰值、wait timing、native/fallback/timeout；
- Prometheus：输出稳定低基数指标，fingerprint series 有硬上限，HTTP server 由应用提供。

## 有意不做或尚未提供

- 不是网络代理、ORM、迁移框架或数据库 leader election；
- 不自动翻译任意 SQL 方言，也不自动注入 SQL Server OUTPUT；
- 暂无公共取消 Handle、协程包装或自定义 executor；
- StreamSource 暂非真正增量上传；
- SQL Builder 不覆盖 JOIN、表达式、upsert 和锁；1.2 的分页由 buildPage/queryPage 提供；
- 驱动/平台组合的实库验证范围不同，发布前应在目标环境跑集成测试。

具体使用见 [API 参考](/api/) 和 [配置参考](/api/configuration)。

## 1.1–1.2 易用性能力

直接返回原始/实体/单条/标量/单列、严格一行映射、成员指针 CRUD、命名参数、Builder 直接执行和完成式异步映射，减少调用方拆解数据的代码。offset 分页通过多取一行计算 hasNext，并可选 COUNT；不提供 keyset 或隐式快照一致性。单次控制覆盖队列、借连接、重试与执行预算，写入结果不确定时明确告知。

配置校验/解释/探测、初始化模板/重载预览、运行时诊断/能力快照和可选 OpenTelemetry 均已实现。Oracle/OCI 本次未复验，存在能力不等于本次已通过实库验收。见 [API 总览](/api/)。
