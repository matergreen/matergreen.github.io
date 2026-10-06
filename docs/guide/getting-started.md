# 下载、编译与配置

## 获取源码

```bash
git clone https://github.com/matergreen/dbmw.git SQLConduit
cd SQLConduit
```

正式使用优先选择 GitHub Release 的稳定 tag，并核对 release 附带的 SHA-256。`dev` 可能包含下一补丁版本的实现与文档。

## 按需编译驱动

```bash
cmake -S . -B build \
  -DCMAKE_BUILD_TYPE=Release \
  -DSQLCONDUIT_ENABLE_POSTGRES=ON \
  -DSQLCONDUIT_BUILD_TESTS=ON
cmake --build build -j
ctest --test-dir build --output-on-failure
```

开关：`SQLCONDUIT_ENABLE_MYSQL`、`SQLCONDUIT_ENABLE_POSTGRES`、`SQLCONDUIT_ENABLE_ORACLE`、`SQLCONDUIT_ENABLE_ODBC`。Core 不强制引入所有厂商 SDK；只启用需要的驱动。

依赖概览：MySQL 需 libmysqlclient，PostgreSQL 需 libpqxx/libpq，Oracle 需 Instant Client Basic + SDK，ODBC 在 Linux/macOS 使用 unixODBC、Windows 使用系统 ODBC。

## 安装和消费

```bash
cmake --install build --prefix /opt/sqlconduit
```

下游 CMake：

```cmake
find_package(sqlconduit REQUIRED COMPONENTS Postgres)
target_link_libraries(my_app PRIVATE sqlconduit::postgres)
```

可选组件名为 `MySQL`、`Postgres`、`ODBC`、`Oracle`；驱动目标会传递 Core。Debug 安装库使用 `d` postfix，可与 Release 共存。

## 创建 YAML 配置

```yaml
# yaml-language-server: $schema=./sqlconduit.schema.json
default_datasource: main
pool:
  min: 1
  max: 8
  borrow_timeout_ms: 3000
async:
  enabled: true
  queue_size: 4096
datasources:
  - name: main
    type: postgres
    host: 127.0.0.1
    port: 5432
    user: app
    password_env: APP_DB_PASSWORD
    database: app
```

JSON 使用完全相同的字段。复制仓库中的 `config/datasource.yaml.example` 或 `datasources.json.example`，并让 IDE 关联 `sqlconduit.schema.json`。

```bash
export APP_DB_PASSWORD='your-password'
```

## 初始化第一个 Client

```cpp
#include "sqlconduit/sqlconduit.h"
#include "sqlconduit/drivers/postgres.h"

sqlconduit::Client client;
auto st = client.addDriver(sqlconduit::drivers::postgres());
if (st.ok()) st = client.init("config/datasources.yaml");
if (!st.ok()) {
    std::cerr << sqlconduit::common::errorCodeToString(st.code)
              << ": " << st.message << '\n';
    return 1;
}

sqlconduit::common::ResultSet rows;
st = client.query("SELECT current_database() AS name", rows);
client.shutdown();
```

::: warning 两步都需要
CMake 启用/链接驱动组件解决“代码是否存在”；`client.addDriver(...)` 解决“这个 Client 是否允许使用”。缺少前者通常是 `DriverDisabled`，缺少后者是 `UnknownDriver`。
:::

## 部署前检查

- 密码来自环境变量或外部 secret，不提交明文配置；
- TLS 验证保持开启并提供 CA/证书；
- pool max 按每个叶子数据源计算，并纳入数据库连接上限；
- 先在真实厂商驱动上验证 timeout、取消和 async mode；
- 打开完整带参 SQL 前完成敏感字段评审；
- 运行安装后 consumer smoke test，而不只运行仓库内测试。

更完整字段见[配置参考](/api/configuration)。
