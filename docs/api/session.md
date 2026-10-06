# Session、Prepared 与 Cursor

`Session` 独占一个连接池 handle，适合需要连接级状态、显式 prepared handle、手动事务或会话内游标的代码。不能复制，可以移动；不要在回调外保存它的引用。

## 获取 Session

```cpp
auto st = client.withSession("primary", [](sqlconduit::core::Session &s) {
    inspect(s.dataSourceName(), s.driverType(), s.inTransaction(), s.didWrite());
    return sqlconduit::common::Status::OK();
});
```

`withSession` 只固定连接，不自动 `BEGIN`。需要原子事务时优先使用 `Client::transaction()`；仅在一个回调中需要多个事务段时手动控制。

## 查询、写入和多结果集

```cpp
client.withSession([](sqlconduit::core::Session &s) {
    sqlconduit::common::ResultSet rows;
    auto st = s.query("SELECT id FROM users WHERE active=?", {true}, rows);
    if (!st.ok()) return st;

    std::vector<sqlconduit::common::ResultSet> sets;
    st = s.queryAll("CALL report(?)", {std::int64_t(7)}, sets);
    if (!st.ok()) return st;

    std::int64_t affected = 0;
    return s.execute("UPDATE jobs SET seen=1 WHERE id=?",
                     {std::int64_t(9)}, affected);
});
```

Session 还提供 `call`、`queryEach`、`executeBatch`，与 Client 同名方法共享相同类型和状态语义。

## 生成键

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

- MySQL 可从 auto-increment 取得键。
- PostgreSQL 通常在 SQL 中写 `RETURNING`。
- SQL Server/ODBC 通常写 `OUTPUT` 或数据库等价语法。
- SQLConduit 不会自动重写任意 SQL；生成键 overload 会在填充前清空 `GeneratedKeys`，失败时不应使用其中内容。

## 显式 prepared handle

普通带参数调用已经使用驱动 prepared 路径和连接级 LRU cache。仅在同一 Session 内需要明确复用一个 native statement 时使用下面的 API：

```cpp
client.withSession([](sqlconduit::core::Session &s) {
    sqlconduit::core::PreparedStatementHandle h;
    auto st = s.prepare(
        "SELECT name FROM users WHERE id=?",
        {std::int64_t(0)}, h); // typesSample 提供参数形状
    if (!st.ok()) return st;

    sqlconduit::common::ResultSet rows;
    st = s.executePrepared(h, {std::int64_t(42)}, rows);

    std::int64_t affected = 0;
    // 同一 handle 只能用于它准备的 SQL 形态
    return st;
});
```

handle 绑定当前物理连接，不能跨 Session、reload 或断线重连使用。

## 手动事务与保存点

```cpp
client.withSession([](sqlconduit::core::Session &s) {
    sqlconduit::common::TransactionOptions options;
    options.isolation = sqlconduit::common::IsolationLevel::ReadCommitted;
    options.readOnly = false;

    auto st = s.begin(options);
    if (!st.ok()) return st;

    st = s.savepoint("before_optional_step");
    if (st.ok()) {
        std::int64_t affected = 0;
        st = s.execute("UPDATE ledger SET reviewed=1 WHERE id=?",
                       {std::int64_t(1)}, affected);
    }
    if (!st.ok()) {
        auto rb = s.rollbackToSavepoint("before_optional_step");
        if (!rb.ok()) return rb;
    }
    st = s.releaseSavepoint("before_optional_step");
    return st.ok() ? s.commit() : s.rollback();
});
```

Session 析构时若事务仍打开会尝试回滚，避免脏连接回池；这不是忽略显式错误处理的理由。保存点名称应是应用控制的标识符，不要直接使用用户输入。

## 取消与状态

```cpp
auto st = session.cancel();
bool tx = session.inTransaction();
bool wrote = session.didWrite();
auto source = session.dataSourceName();
auto driver = session.driverType();
```

`cancel()` 请求驱动取消当前语句，精度和可恢复性取决于厂商驱动。取消失败或连接状态不可证明安全时，连接会被隔离或丢弃。

## Cursor

### Client 拥有的游标

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

### Session 内游标

```cpp
client.transaction([](sqlconduit::core::Session &s) {
    sqlconduit::core::CursorOptions options;
    std::unique_ptr<sqlconduit::core::Cursor> cursor;
    auto st = s.openCursor("SELECT id FROM jobs", {}, options, cursor);
    if (!st.ok()) return st;

    sqlconduit::common::Row row;
    bool ok = false;
    while ((st = cursor->fetchRow(row, ok)).ok() && ok) consume(row);
    auto close = cursor->close();
    return st.ok() ? close : st;
});
```

`fetch(n, out)` 把新行追加到 `out`，所以循环复用同一个 ResultSet 时应先 `clear()`。Session 游标必须先于 Session 销毁；Client 游标独占借来的连接直到关闭/析构。`max_open_cursors` 可限制并发游标数，`allow_scrollable=false` 会拒绝滚动游标请求。

## 大字段 Stream 参数

```cpp
std::ifstream input("payload.bin", std::ios::binary);
sqlconduit::common::StreamParams params{
    sqlconduit::common::StreamSource(input, true),
    std::int64_t(42)
};
std::int64_t affected = 0;
sqlconduit::common::GeneratedKeys keys;
auto st = session.execute(
    "UPDATE files SET payload=? WHERE id=?", params, affected, keys);
```

当前 `StreamSource` 是统一输入接口，但驱动会先缓冲再绑定，不承诺常量内存上传。输入流在调用完成前必须保持有效。
