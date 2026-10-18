# Pagination (since 1.2)

::: warning Validation boundary
Oracle/OCI was not revalidated for 1.2.0, including Oracle pagination. Automated CI covers MySQL, PostgreSQL and SQL Server/ODBC paths. Validate your actual server and SDK before deployment.
:::

Include `sqlconduit/query_page.h` or the full umbrella. These APIs require SQLConduit 1.2 or later.
Register entities as described in [Direct query results](/en/api/query-results).

## Example entity

```cpp
#include "sqlconduit/sqlconduit.h"
struct User { std::int64_t id = 0; std::string name; int age = 0; };
SQLCONDUIT_ENTITY(User, "users", id, name, age)
```

Declare this once at global namespace scope, then initialize Client and its driver.

## Query a typed page

```cpp
sqlconduit::PageOptions options;
options.page = 1;
options.pageSize = 20;
auto query = sqlconduit::sql::select<User>(sqlconduit::Dialect::Postgres)
    .ge(&User::age, 18).orderByDesc(&User::id);
auto page = client.queryPage<User>(query, options);
if (!page.ok()) return page.status;
for (const auto &user : page.items) { /* use user */ }
```

`PageResult<T>` exposes `status`, `items`, `page`, `pageSize`, `hasNext`, optional int64 `total`,
`mode`, `ok()` and opt-in `itemsOrThrow()`. Page numbers are one-based. One extra row determines
hasNext; it is removed before entity mapping. Empty/beyond-last pages are successful, not clamped.
No COUNT is executed by default.

## Optional totals and structured plans

```cpp
options.includeTotal = true;
auto plan = query.buildPage();
auto counted = client.queryPage<User>(plan, options);
auto pending = client.queryPageAsync<User>(plan, options);
auto asyncPage = pending.get();
```

Passing a Builder/TypedBuilder directly calls buildPage(). COUNT is generated from structured
table/WHERE metadata, with its own parameters and no ordering (SQL Server uses COUNT_BIG).
Ordinary build() results still
support pagination, but require an explicit COUNT if totals are requested. No arbitrary COUNT
rewrite is attempted. COUNT must return exactly one nonnegative int64-compatible integer value;
exact integral Decimal aggregates are accepted for Oracle. NULL, overflow and fractional totals
fail. Data, COUNT and mapping failures clear items/total/hasNext, retaining structured errors.

## Raw SQL and named bindings

```cpp
options.countQuery = sqlconduit::sql::Statement{
    "SELECT COUNT(*) FROM users WHERE age>=?", {18}};
auto page = client.queryPageNamed<User>(
    "SELECT id, name, age FROM users WHERE age>=:age ORDER BY id", {{"age", 18}}, options);
```

Explicit COUNT has independent positional parameters. For named COUNT, bind it with bindNamed,
check the result and copy/move its SQL and Params into countQuery. The caller must preserve
equivalent filters/JOIN/GROUP BY/DISTINCT semantics. PageOptions.countQuery overrides a plan's
countQuery and is unused when includeTotal is false.

| Method | Supported inputs |
| --- | --- |
| `Client/Session::queryPage<T>` | PageQuery, BuildResult, Builder, `TypedBuilder<T>`, or `(sql, Params, PageOptions)` |
| `Client/Session::queryPageNamed<T>` | `(sql, NamedParams, PageOptions)` |
| `Client::queryPageAsync<T>` | Same inputs as synchronous Client queryPage |
| `Client::queryPageNamedAsync<T>` | `(sql, NamedParams, PageOptions)` |
| `Builder/TypedBuilder::buildPage()` | Unpaginated ordered SELECT with structurally generated COUNT |

Options default on every overload; raw Params/NamedParams also default to empty. Use
withOptions({operation options}) or ContextScope for named-source routing, avoiding ambiguous
`(source, {})` overloads. Templates are defined in query_page.h, not mapping.h.

Raw data SQL must be a single unpaginated SELECT with a top-level ORDER BY and no semicolon.
Existing LIMIT/OFFSET/FETCH/TOP, SELECT INTO, locking/trailing OPTION and CTE forms are rejected;
use ordinary query with manually paginated SQL for unsupported forms. The conservative lexical
gate is not a full dialect parser or an SQL security firewall. Values remain bound parameters.
Ordering must include a unique tie-breaker; the library checks presence, not uniqueness.

## Async, lifetime and consistency

```cpp
sqlconduit::common::OperationOptions budget;
budget.timeout = std::chrono::milliseconds(250);
budget.dataSource = "reporting";
auto pending = client.withOptions(budget).queryPageAsync<User>(plan, options);
```

Both statements share the captured context/operation budget and a retained topology handle.
Group routing/failover policies remain in force. Async combines completions without waiting
threads or blocking pool acquisition. Data and COUNT may run concurrently on two connections;
one-connection pools queue the other request nonblockingly. Any compatibility fallback makes
the combined mode CompatibilityFallback. An early error with an unresolved sibling also reports
CompatibilityFallback conservatively. Failure may resolve the result while another submitted
statement still needs physical cleanup; future readiness does not mean its connection is free.
Driver cancellation remains cooperative. Do not wait in executor/driver/custom mapping callbacks.

Session helpers are synchronous and reuse the current connection. No implicit transaction is
opened. COUNT and data are not a shared snapshot by default; use a Session and explicitly chosen
transaction isolation when snapshot consistency is required. Concurrent changes can still affect
offset pagination across separate requests. This API does not implement keyset/cursor pagination.

MySQL/PostgreSQL use bound LIMIT/OFFSET; SQL Server/Oracle use bound OFFSET/FETCH and require a
server version supporting it. PageOptions dialect overrides the PageQuery dialect, then the
driver type is used; unknown custom drivers require an explicit dialect. This controls pagination
syntax, not requoting existing SQL: choose the matching Builder dialect, especially for MySQL.
Page/size must be positive; offset plus the probe row must fit int64. Large offsets may be costly.
Partial projections still require an appropriate DTO instead of mapping an incomplete strict entity.

See [中文版](/api/pagination).

See also [per-call controls and named parameters](/en/api/query-results), [mapping](/en/api/mapping) and [SQL Builder](/en/api/sql-tools).

## PageOptions defaults

| Field | Default | Meaning |
| --- | --- | --- |
| page | 1 | One-based page number |
| pageSize | 20 | Positive size; reserve one extra probe row within int64 |
| includeTotal | false | Enable COUNT; not needed for hasNext |
| dialect | Auto | Override plan/driver pagination syntax, not SQL identifier quoting |
| countQuery | Empty | Explicit sql::Statement override with independent Params |

Client/Session `queryPageNamed<T>` and Client `queryPageNamedAsync<T>` take (sql, NamedParams, PageOptions). Named-source pagination uses withOptions or ContextScope, not a source-first page overload.
