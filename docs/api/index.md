# API 参考

当前公共入口是 `sqlconduit::Client`。它是 move-only 的实例对象，每个实例独立拥有驱动注册表、连接池拓扑、缓存、拦截器、观测状态与异步执行器。旧版进程级 `DBMW`、异步自由函数、callback Handle 和协程 Task 已在 1.0 前移除。

::: tip 示例约定
示例默认包含 `sqlconduit/sqlconduit.h`，SQL 使用 `?` 占位符，并已在 `init()` 前为当前 `Client` 调用 `addDriver()`。参数由驱动绑定，禁止拼接不可信输入。
:::

## 按需求选择入口

| 需求 | API | 关键语义 |
| --- | --- | --- |
| 单条查询/写入 | `Client::query` / `execute` | 自动借还连接 |
| 指定数据源 | 带 `dataSource` 首参的重载 | 也可用 `ContextScope::targetDataSource` |
| 多结果集/存储过程 | `queryAll` / `call` | OUT/INOUT 使用 `CallParam` |
| 同连接多条语句 | `withSession` | 不自动开始事务 |
| 原子事务 | `transaction` | 回调成功提交，失败或异常回滚 |
| 大结果集 | `queryEach` / `openCursor` | 逐行或分批消费 |
| 批量写入 | `executeBatch` | 无外层事务时保证原子回滚 |
| 后台执行 | `Client::*Async` | 返回 `std::future`，结果包含执行模式 |
| 结构体映射 | `query<T>` / `queryOne<T>`；保留 mapping 自由函数 | 直接读取 items/value，注册一次映射 |
| 动态拓扑 | `add/removeDataSource`、`add/removeGroup` | 删除会检查引用和 grace period |
| 运行时观测 | pool/slow SQL/observer/async stats | 数据均按 Client 隔离 |

## 页面索引

- [Client 与运行时观测](./sync)：生命周期、同步 CRUD、动态数据源、统计与拦截器。
- [Session 与 Cursor](./session)：固定连接、prepared handle、事务、保存点、取消和游标。
- [Future 异步 API](./async)：全部异步方法、`Native`/`CompatibilityFallback`、超时和关闭语义。
- [实体映射](./mapping)：`RowMapper`、严格转换、读写辅助和异步结果映射。
- [类型与错误](./types)：`Value`、结果、流式参数、上下文、状态码和统计结构。
- [配置参考](./configuration)：JSON/YAML、驱动字段、池、治理、路由与 Oracle 语义。
- [SQL Builder 与工具](./sql-tools)：结构化 CRUD、SQL 分析、例程、索引和脚本。

## 最小完整程序

```cpp
#include "sqlconduit/sqlconduit.h"
#include "sqlconduit/drivers/postgres.h"

int main() {
    sqlconduit::Client client;
    auto st = client.addDriver(sqlconduit::drivers::postgres());
    if (st.ok()) st = client.init("config/datasources.yaml");
    if (!st.ok()) return 1;

    sqlconduit::common::ResultSet rows;
    st = client.query(
        "SELECT id, name FROM users WHERE active = ?",
        sqlconduit::common::Params{true}, rows);

    client.shutdown();
    return st.ok() ? 0 : 1;
}
```

::: warning 生命周期
再次调用 `init()` 会返回 `AlreadyInitialized`，配置更新用 `reload()`。不要从当前 Client 的 observer、interceptor、逐行或事务回调内部销毁、移动、reload 或 shutdown 同一个 Client；应在回调返回后安排生命周期变更。
:::

公共签名以仓库的 [`include/sqlconduit`](https://github.com/matergreen/SQLConduit/tree/v1.2.0/include/sqlconduit) 为准。1.x 对文档化应用 API、配置 Schema、错误码数值和稳定指标保持源码兼容。

## 1.2 新版入口

- [直接返回查询结果](/api/query-results)：实体/单条/标量/单列、命名参数、Builder 执行、严格错误与单次超时/取消。
- [类型化分页](/api/pagination)：页码/大小、hasNext、可选总数、异步汇合与 Session 一致性。
- [配置工具与诊断](/api/diagnostics)：validate/explain/doctor、运行时快照、可选 OpenTelemetry（1.1 起）。

示例以 v1.2.0 为准；旧输出参数和 mapping 自由函数继续支持。
