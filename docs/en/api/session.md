# Session, prepared handles, and Cursor

`Session` owns one pool handle. Use it for connection-local state, explicit prepared handles, manual transaction segments, or session-bound cursors. It is move-only; never keep a callback reference after the callback returns.

## Acquire and use a Session

```cpp
auto st = client.withSession("primary", [](sqlconduit::core::Session &s) {
    sqlconduit::common::ResultSet rows;
    auto q = s.query("SELECT id FROM users WHERE active=?", {true}, rows);
    if (!q.ok()) return q;

    std::vector<sqlconduit::common::ResultSet> sets;
    q = s.queryAll("CALL report(?)", {std::int64_t(7)}, sets);
    if (!q.ok()) return q;

    std::int64_t affected = 0;
    return s.execute("UPDATE jobs SET seen=1 WHERE id=?",
                     {std::int64_t(9)}, affected);
});
```

`withSession()` pins a connection but does not issue `BEGIN`. Session also exposes `call`, `queryEach`, `executeBatch`, generated-key execute, streaming parameters, explicit prepare, cursor, transaction, savepoint, and cancel methods.

## Generated keys

```cpp
client.withSession([](sqlconduit::core::Session &s) {
    std::int64_t affected = 0;
    sqlconduit::common::GeneratedKeys keys;
    auto st = s.execute(
        "INSERT INTO users(name) VALUES(?) RETURNING id",
        {std::string("Ada")}, affected, keys);
    if (st.ok() && !keys.empty()) consume(keys.rows);
    return st;
});
```

MySQL can expose its auto-increment ID. PostgreSQL normally needs `RETURNING`; SQL Server normally needs `OUTPUT` or equivalent. SQLConduit does not rewrite arbitrary SQL. Generated-key overloads clear the output before filling it; do not consume its contents after a failed call.

## Explicit prepared handle

Parameterized operations already use prepared driver paths and a per-connection LRU cache. Use an explicit handle only for deliberate reuse on this same physical connection:

```cpp
client.withSession([](sqlconduit::core::Session &s) {
    sqlconduit::core::PreparedStatementHandle h;
    auto st = s.prepare("SELECT name FROM users WHERE id=?",
                        {std::int64_t(0)}, h);
    if (!st.ok()) return st;

    sqlconduit::common::ResultSet rows;
    return s.executePrepared(h, {std::int64_t(42)}, rows);
});
```

The handle is connection-bound and must not cross Sessions, reload, or reconnect.

## Manual transactions and savepoints

```cpp
client.withSession([](sqlconduit::core::Session &s) {
    sqlconduit::common::TransactionOptions options;
    options.isolation = sqlconduit::common::IsolationLevel::ReadCommitted;
    auto st = s.begin(options);
    if (!st.ok()) return st;

    st = s.savepoint("before_optional_step");
    if (!st.ok()) return s.rollback();
    // execute work, optionally rollbackToSavepoint(...)
    st = s.releaseSavepoint("before_optional_step");
    return st.ok() ? s.commit() : s.rollback();
});
```

An open transaction is rolled back during Session destruction so a dirty connection cannot return to the pool; explicit error handling is still required. Savepoint names must be application-controlled identifiers.

`cancel()` asks the vendor driver to cancel the current statement. Precision and reusability are vendor-specific; an unproven connection is quarantined or discarded. State accessors are `inTransaction()`, `didWrite()`, `dataSourceName()`, and `driverType()`.

## Cursor

```cpp
sqlconduit::core::CursorOptions options;
options.batch_size = 256;
options.scrollable = false;

std::unique_ptr<sqlconduit::core::Cursor> cursor;
auto st = client.openCursor(
    "SELECT id, payload FROM events ORDER BY id", {}, options, cursor);

while (st.ok() && cursor->hasNext()) {
    sqlconduit::common::ResultSet page;
    st = cursor->fetch(256, page);
    consume(page);
}
if (cursor) cursor->close();
```

`fetch(n, out)` appends rows, so clear a reused ResultSet. A Client cursor owns a borrowed connection until close/destruction; a Session cursor must die before its Session. `fetchRow`, `isOpen`, `hasNext`, and `rowsFetched` expose incremental state. Configuration can cap open cursors and reject scrollable requests.

## Stream parameters

```cpp
std::ifstream input("payload.bin", std::ios::binary);
sqlconduit::common::StreamParams params{
    sqlconduit::common::StreamSource(input, true), std::int64_t(42)};
std::int64_t affected = 0;
sqlconduit::common::GeneratedKeys keys;
auto st = session.execute("UPDATE files SET payload=? WHERE id=?",
                          params, affected, keys);
```

`StreamSource` is a uniform input surface, but current drivers buffer before binding; it is not a constant-memory upload guarantee. Keep the source alive through the call.
