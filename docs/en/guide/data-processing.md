# Batches, rows, cursors, and large values

Choose materialized `query` for small random-access results, `queryEach` for one-pass row delivery, Cursor for explicit page/backpressure control, `executeBatch` for atomic parameter sets, and `StreamSource` for one large-value input surface.

```cpp
sqlconduit::common::BatchResult out;
auto st = client.executeBatch(
    "INSERT INTO item(name, qty) VALUES(?, ?)",
    {{std::string("a"), std::int64_t(10)},
     {std::string("b"), std::int64_t(20)}}, out);
```

All parameter groups must have identical shape and are validated before the first row. Without an outer transaction, any failure rolls back the batch. Vendor fast paths never weaken per-item affected/key semantics; otherwise execution safely falls back.

```cpp
std::uint64_t rows = 0;
st = client.queryEach("SELECT id,payload FROM event", {},
    [](const sqlconduit::common::Row &row) { return enqueue(row); }, rows);
```

Callbacks are synchronous on the execution thread, must stay short, and must not retain Row references. False is successful early stop.

```cpp
sqlconduit::core::CursorOptions options;
options.batch_size = 500;
std::unique_ptr<sqlconduit::core::Cursor> cursor;
st = client.openCursor("SELECT id,payload FROM event ORDER BY id", {}, options, cursor);
while (st.ok() && cursor->hasNext()) {
    sqlconduit::common::ResultSet page;
    st = cursor->fetch(options.batch_size, page);
    consume(page);
}
```

Cursors hold a connection until close/destruction; size the pool and configure `max_open_cursors` accordingly. PostgreSQL may use an automatic transaction, MySQL unbuffered results, and ODBC/OCI their native cursor semantics.

`StreamSource` can wrap an input stream or read callback, but current drivers buffer before binding. It is a unified API, not a constant-memory guarantee. Oracle `lob_max_bytes` bounds result LOB materialization and fails rather than truncating.
