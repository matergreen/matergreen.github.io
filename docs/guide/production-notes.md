# 生产使用必读

这些是容易被“API 可用”掩盖的运行时边界。上线评审时建议逐项确认。

## 版本与能力声明

- 1.2.0 是当前稳定发布基线；本站的 API 和语义说明与该版本对齐。
- API 存在、路径为 native、以及在某个数据库/平台组合上通过实库验证，是三件不同的事。
- 发布行为以使用的 tag 对应 CHANGELOG 为准；不要用 `dev` 文档替稳定包做能力承诺。

## Client 与回调生命周期

- `Client` 是 move-only 的资源所有者；每个 Client 独立管理池、缓存、观测和异步执行。
- `init()` 成功后更新配置用 `reload()`，停机流程显式调用 `shutdown(grace)`。
- 不要在同一 Client 的 transaction/row/observer/interceptor 回调内 move、reload、shutdown 或销毁它。
- 事务回调已持有物理连接；再嵌套同一 Client 的异步借连接调用，在小池中可能自我等待。

## 异步不等于所有路径都 native

- 始终先检查 `result.status`，再查看 `result.mode`。`CompatibilityFallback` 是受支持的有界 worker 路径，不是失败。
- PostgreSQL 普通 query/execute 覆盖最完整；MySQL prepared、事务、游标、批量、多结果和生成键等会回退。
- Oracle/ODBC native async 自 1.0.1 起可用，且 ODBC 是运行时能力探测；FreeTDS 通常走 fallback。
- 容量规划同时监控 `active`、`queueDepth`、`rejected`、`fallbackOperations` 和池的 `asyncWaiting`。

## 写入、重试与故障转移

- 写默认不重试。只有业务可以证明幂等时，才设置 `SqlContext::idempotency=Idempotent` 或开启对应策略。
- 执行期间断线/超时可能意味着“已提交但回包丢失”；SQLConduit 不会在另一主库盲目重放。
- 多主 failover 不提供选主或 fencing，必须由外部系统保证并显式确认。
- write buffer 是进程内易失队列；`Buffered` 不是 `Ok`，也不代表数据库已提交。

## 容量、内存与数据保护

- `pool.max` 按每个叶子数据源计算，总连接数还要考虑多 Client、副本、shadow 和部署实例数。
- Cursor/Session 长时间占用 borrowed 连接；leak detection 只告警，不会抢回正在使用的连接。
- `StreamSource` 目前会先缓冲再绑定，不是恒定内存上传。对大 LOB 要做容量和峰值测试。
- rendered SQL 即使截断也可能泄露密码、token 或个人数据；字符串/Blob 值应默认关闭，调试完立即恢复。

## 缓存、拦截器与 SQL 边界

- query cache 按拓扑在成功写后失效，不理解表依赖；不要将不可安全复用的查询结果缓存。
- 结果转换拦截器必须正确标记 `transformed`，避免用户特定数据进入共享缓存。
- SQL Builder 只覆盖可验证 CRUD；JOIN、upsert、锁、表达式和存储过程由应用写方言 SQL。
- SQL 分类/指纹是审计和观测启发式，不能替代数据库权限。

## 上线验证

在目标操作系统、客户端 SDK 和数据库版本上，至少验证连接耗尽、查询超时、取消后连接复用、断网/重连、重复 reload、游标遗弃、大值/多字节字符、批量中途失败和优雅关闭。

## 1.2 部署边界

- 取消是协作式请求，不是回滚证明；提前停止的在途写入可能 outcomeUnknown。
- offset 分页必须唯一排序；可选 COUNT 和数据默认不是同一快照。
- v1.2.0 自动发布门禁已通过，包括 MySQL/PostgreSQL/SQL Server 实库路径；Oracle/OCI 明确未复验，仍需独立验收实际 SDK 和服务器组合。
- native 能力快照是历史观测，不是连通性探测或单条 SQL 的执行保证。

[查询控制](/api/query-results) · [分页](/api/pagination) · [诊断](/api/diagnostics)。
