# SQL Builder, analysis, and utilities

`sqlconduit/sqlconduit.h` re-exports common Builder, Condition, Dialect, and utility names while deep namespaces remain compatible.

## Structured CRUD

```cpp
auto built = sqlconduit::Builder::select("users", sqlconduit::Dialect::Postgres)
    .columns({"id", "name"})
    .where(sqlconduit::all({
        sqlconduit::eq("status", std::string("active")),
        sqlconduit::ge("age", std::int64_t(18)),
        sqlconduit::not_(sqlconduit::isNull("email"))
    }))
    .orderBy("id", sqlconduit::sql::SortDirection::Descending)
    .build();

if (built.ok()) client.query(built.statement.sql, built.statement.params, rows);
```

Use `Builder::insert/update/deleteFrom`, `value(s)`, and conditions `eq/ne/lt/le/gt/ge/like/in/notIn/between/isNull/isNotNull/all/any/not_`. Values always stay in Params and identifiers are quoted for the dialect. UPDATE/DELETE without WHERE fail unless `.allowAllRows()` is explicit.

The builder intentionally covers verifiable portable CRUD only. Write parameterized SQL for joins, expressions, upsert, locking, generated-key clauses, and routine dialects.

## SQL analysis

```cpp
auto kind = sqlconduit::classifyStatement(sql);
bool write = sqlconduit::isWrite(kind);
bool where = sqlconduit::hasWhereClause(sql);
bool bounded = sqlconduit::hasRowLimitClause(sql);
bool multi = sqlconduit::hasMultipleStatements(sql);
auto normalized = sqlconduit::structuralTemplate(sql);
auto fingerprint = sqlconduit::fingerprintTemplate(sql);
```

These helpers support audit and telemetry; they are not a full parser or authorization boundary.

## Routines

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

Use the Session overload when a dialect's OUT/INOUT protocol needs one connection. Oracle procedures returning rows require an explicit ref cursor. SQLConduit normalizes the call protocol; it does not translate routine bodies.

`createRoutine`/`dropRoutine` govern routine DDL. `createIndex`/`dropIndex` build dialect-aware index DDL and reject invalid combinations such as PostgreSQL CONCURRENTLY inside a transaction. DDL is primary-pinned, non-idempotent by default, and invalidates cache.

## Scripts

```cpp
sqlconduit::ScriptOptions options;
options.dataSource = "primary";
options.recursive = true;
options.extension = ".sql";
options.stopOnError = true;
std::vector<sqlconduit::ScriptResult> files;
auto st = sqlconduit::runScriptsInDir(client, "migrations", options, &files);
```

Files are path-sorted. The splitter understands quotes, comments, and common BEGIN/END blocks but is not a complete vendor parser. SQLConduit does not provide migration version tables or distributed migration locking.

## Member-pointer Builder and pagination since 1.2

After SQLCONDUIT_ENTITY registration, `select<T>`/`insert<T>`/`update<T>`/`deleteFrom<T>` use mapped member pointers for conditions, projections, sorting and bound assignments. Conditional methods do not bypass the full-table write guard. build() returns the existing BuildResult and can be passed directly to Client/Session queries or execute. buildPage() generates an ordered SELECT plan plus a structural COUNT. [Complete typed Builder examples](./query-results#member-pointer-builder-and-one-line-entities) · [Pagination and dialect rules](./pagination).
