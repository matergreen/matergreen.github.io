---
layout: home

hero:
  name: "SQLConduit"
  text: "Move database governance out of business code"
  tagline: A C++17 data-access layer for MySQL, PostgreSQL, Oracle, and ODBC with centralized pooling, transactions, routing, failure policy, and telemetry.
  image:
    src: /logo.svg
    alt: SQLConduit database middleware logo
  actions:
    - theme: brand
      text: Start in 5 minutes
      link: /en/guide/getting-started
    - theme: alt
      text: Browse the API
      link: /en/api/
    - theme: alt
      text: GitHub
      link: https://github.com/matergreen/SQLConduit

features:
  - title: Instance-owned Client
    details: Every Client owns its drivers, topology, cache, interceptors, telemetry, and async executor. There is no implicit global client.
  - title: Four driver families
    details: Enable MySQL, PostgreSQL, Oracle OCI, and ODBC as components while keeping one ? placeholder and native-binding model.
  - title: Typed queries and pages
    details: Query entities, single values, columns, or pages directly. One-line mappings, member-pointer conditions, and named bindings reduce decoding code.
  - title: Complete data access
    details: Queries, multiple result sets, routines, transactions, savepoints, batches, cursors, row callbacks, generated keys, and prepared handles.
  - title: Real, observable async
    details: Futures distinguish Native from CompatibilityFallback; pool waits, deadlines, retries, and complex routing stay visible.
  - title: Explicit resilience semantics
    details: Read/write groups, sticky reads, replica fallback, circuits, idempotent retry, shadow traffic, and fenced write failover never blindly replay ambiguous writes.
  - title: Configuration and governance
    details: Strict JSON/YAML plus audit, rate limiting, query cache, slow SQL, rendered SQL, pool metrics, and Prometheus text export.
  - title: Stable 1.x contract
    details: Client APIs, configuration Schema, error values, and stable metrics remain source-compatible throughout 1.x.
---

<HomeExtras lang="en" />

::: info Documentation version
This site is aligned with SQLConduit 1.2.0. The public API follows the stable 1.x contract; deployment decisions should still follow the CHANGELOG for the exact tag in use.
:::

## Minimal example

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

Continue with [download, build, and configuration](/en/guide/getting-started), or open the [API reference](/en/api/).

## Less application code in 1.2

[Query directly into entities](/en/api/query-results), build conditions with mapped member pointers, and [return typed pages](/en/api/pagination) without manually decoding ResultSet.

Oracle/OCI was not revalidated for this release; previous manual evidence does not certify the new APIs.
