# SQL Builder、分析与例程工具

`sqlconduit/sqlconduit.h` 重新导出常用 Builder、Condition、Dialect 和工具函数；深层命名空间仍保持兼容。

## 结构化 CRUD Builder

```cpp
auto built = sqlconduit::Builder::select(
        "users", sqlconduit::Dialect::Postgres)
    .columns({"id", "name"})
    .where(sqlconduit::all({
        sqlconduit::eq("status", std::string("active")),
        sqlconduit::ge("age", std::int64_t(18)),
        sqlconduit::not_(sqlconduit::isNull("email"))
    }))
    .orderBy("id", sqlconduit::sql::SortDirection::Descending)
    .build();

if (built.ok())
    client.query(built.statement.sql, built.statement.params, rows);
```

INSERT/UPDATE/DELETE：

```cpp
auto insert = sqlconduit::Builder::insert("users")
    .value("name", std::string("Ada"))
    .value("active", true)
    .build();

auto update = sqlconduit::Builder::update("users")
    .value("active", false)
    .where(sqlconduit::eq("id", std::int64_t(42)))
    .build();

auto remove = sqlconduit::Builder::deleteFrom("sessions")
    .where(sqlconduit::lt("expires_at", cutoff))
    .build();
```

条件还有 `ne/lt/le/gt/ge/like/in/notIn/between/isNull/isNotNull/all/any/not_`。值始终进入 Params，标识符按方言引用。没有 WHERE 的 UPDATE/DELETE 默认拒绝，确实需要全表操作时显式 `.allowAllRows()`。

Builder 有意只覆盖可验证的可移植 CRUD，不猜测 JOIN、表达式、upsert、锁、生成键和存储过程方言；这些场景直接写参数化 SQL。

## SQL 分析

```cpp
auto kind = sqlconduit::classifyStatement(sql);
bool write = sqlconduit::isWrite(kind);
bool where = sqlconduit::hasWhereClause(sql);
bool bounded = sqlconduit::hasRowLimitClause(sql);
bool multi = sqlconduit::hasMultipleStatements(sql);
auto normalized = sqlconduit::structuralTemplate(sql);
auto fingerprint = sqlconduit::fingerprintTemplate(sql);
```

这些函数用于审计、指标和日志，不是完整 SQL parser，也不能替代数据库权限。不要用启发式分类结果授权不可信 SQL。

## 例程调用

```cpp
sqlconduit::RoutineRef ref{
    "report_pkg.run", sqlconduit::RoutineKind::Procedure, "oracle"};

sqlconduit::CallParams params{
    sqlconduit::CallParam{std::int64_t(7)},
    sqlconduit::CallParam::out(sqlconduit::ValueType::String, 2048),
    sqlconduit::CallParam::refCursor()
};

sqlconduit::CallResult result;
sqlconduit::CallOptions options;
options.dataSource = "ora";
options.dialect = sqlconduit::Dialect::Oracle;
auto st = sqlconduit::call(client, ref, params, result, options);
```

MySQL OUT/INOUT 等需要同连接的调用应使用带 `Session&` 的 overload。Oracle procedure 在 `returnsRows=true` 时需要显式 ref cursor。SQLConduit 负责调用协议和结果归一化，不翻译 procedure/function body。

已有 SQL 可用 `call`、`callQuery`、`callEach` 直接执行；优先使用 `Client::call` 处理原生 OUT/INOUT。

## Routine 生命周期

```cpp
sqlconduit::CreateRoutineOptions create;
create.dataSource = "main";
create.dialect = sqlconduit::Dialect::MySQL;
create.replace = true;
auto st = sqlconduit::createRoutine(
    client,
    "CREATE PROCEDURE p(IN x INT) BEGIN UPDATE t SET a=x; END",
    create);

sqlconduit::DropRoutineOptions drop;
drop.dataSource = "main";
drop.dialect = sqlconduit::Dialect::MySQL;
st = sqlconduit::dropRoutine(
    client, {"p", sqlconduit::RoutineKind::Procedure, "main"}, drop);
```

DDL 默认固定主库、非幂等且使缓存失效。replace/if-not-exists 能力按方言验证；工具不会假装数据库支持不存在的语法。

## 索引

```cpp
sqlconduit::IndexSpec index;
index.table = "events";
index.name = "idx_events_tenant_created";
index.columns = {"tenant_id", "created_at"};
index.ifNotExists = true;

sqlconduit::CreateIndexOptions options;
options.dataSource = "primary";
options.dialect = sqlconduit::Dialect::Postgres;
auto st = sqlconduit::createIndex(client, index, options);

sqlconduit::DropIndexOptions drop;
drop.dataSource = "primary";
drop.dialect = sqlconduit::Dialect::Postgres;
st = sqlconduit::dropIndex(client, "events", index.name, drop);
```

PostgreSQL `CONCURRENTLY` 不能在事务块中执行，工具会提前拒绝冲突组合。

## SQL 脚本

```cpp
sqlconduit::ScriptOptions options;
options.dataSource = "primary";
options.recursive = true;
options.extension = ".sql";
options.stopOnError = true;

std::vector<sqlconduit::ScriptResult> files;
auto st = sqlconduit::runScriptsInDir(client, "migrations", options, &files);
```

文件按路径排序。splitter 识别引号、注释和常见 BEGIN/END 块，但不是完整厂商 parser；复杂 delimiter、动态 SQL 或特殊过程体应由应用预处理或直接作为单条显式 SQL 执行。脚本工具不提供 migration version table 或分布式锁。

## 1.2 成员指针 Builder 与分页

SQLCONDUIT_ENTITY 注册后，`select<T>`/`insert<T>`/`update<T>`/`deleteFrom<T>` 使用映射成员指针表达条件、投影、排序与绑定赋值；条件式方法不会绕过全表写入保护。build() 返回现有 BuildResult，可直接交给 Client/Session 查询或 execute；buildPage() 生成排序 SELECT 计划与结构化 COUNT。见[类型化 Builder 完整示例](./query-results)及[分页与方言边界](./pagination)。
