---
layout: home

hero:
  name: "SQLConduit"
  text: "把数据库连接治理，交给中间件"
  tagline: 面向 C++17 服务的数据库访问层。统一 MySQL、PostgreSQL、Oracle 与 ODBC，并集中管理连接池、事务、路由、故障策略和可观测性。
  image:
    src: /logo.svg
    alt: SQLConduit 数据库中间件标志
  actions:
    - theme: brand
      text: 5 分钟开始使用
      link: /guide/getting-started
    - theme: alt
      text: 查看 API
      link: /api/
    - theme: alt
      text: GitHub
      link: https://github.com/matergreen/dbmw

features:
  - title: 实例级 Client
    details: 每个 Client 独立拥有驱动、连接拓扑、缓存、拦截器、观测状态和异步执行器；没有隐式全局客户端。
  - title: 四类数据库驱动
    details: MySQL、PostgreSQL、Oracle OCI 与 ODBC 按组件启用，统一使用 ? 占位符和原生参数绑定。
  - title: 完整数据访问能力
    details: 查询、多结果集、存储过程、事务、保存点、批量、游标、逐行回调、生成键和显式 prepared handle。
  - title: 真异步并且可辨认
    details: Future 结果明确区分 Native 与 CompatibilityFallback；连接池等待、超时、重试和复杂路由都有可观测状态。
  - title: 明确的韧性语义
    details: 读写组、写后读、副本回退、熔断、幂等重试、影子流量和带 fencing 声明的写故障转移，不盲目重放未知结果的写。
  - title: 配置与治理
    details: JSON/YAML 严格校验，支持 SQL 审计、限流、查询缓存、慢 SQL、完整带参 SQL、池指标和 Prometheus 文本导出。
  - title: 1.x 稳定契约
    details: Client、配置 Schema、错误码和稳定指标在 1.x 内保持源码兼容；新能力通过增量接口演进。
---

<HomeExtras />

::: info 文档版本
公共 API 以 1.0 稳定契约为基线；站点同时跟踪 `dev` 中已实现的 Unreleased 能力。开发中功能会在相关页面明确标注，部署时请以所用 tag 的 CHANGELOG 为准。
:::

## 最小示例

```cpp
#include "sqlconduit/sqlconduit.h"
#include "sqlconduit/drivers/postgres.h"

sqlconduit::Client client;
auto status = client.addDriver(sqlconduit::drivers::postgres());
if (status.ok()) status = client.init("config/datasources.yaml");

sqlconduit::common::ResultSet rows;
if (status.ok()) {
    status = client.query(
        "SELECT id, name FROM users WHERE id = ?",
        sqlconduit::common::Params{std::int64_t(42)}, rows);
}

client.shutdown();
```

从[下载、编译与配置](/guide/getting-started)开始，或者直接查看完整的 [SQLConduit API](/api/)。
