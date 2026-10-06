# 批量、逐行、游标与大字段

## 如何选择

| 场景 | API | 内存/连接特征 |
| --- | --- | --- |
| 结果较小且需要随机访问 | `query` | 全量物化 |
| 单遍处理大结果 | `queryEach` | 驱动逐行/内部流式能力，回调不可保留引用 |
| 分页式拉取和背压 | `openCursor` | 长时间占用一个连接 |
| 多组参数写入 | `executeBatch` | 原子契约，驱动快速路径或事务回退 |
| 大 BLOB/CLOB 输入 | `StreamSource` | 统一接口，但当前仍先缓冲 |

## 原子批量

```cpp
sqlconduit::common::ParamBatch batch{
    {std::string("a"), std::int64_t(10)},
    {std::string("b"), std::int64_t(20)}
};
sqlconduit::common::BatchResult out;
auto st = client.executeBatch(
    "INSERT INTO item(name, qty) VALUES(?, ?)", batch, out);
if (st.ok()) log(out.totalAffected(), out.affected.size(), out.keys.size());
```

所有参数组必须形状一致，校验在第一行执行前完成。没有外层事务时，任一项失败会回滚整体。驱动快速路径并不改变每项 affected/keys 的契约；不能准确返回每项结果的驱动会选择安全 fallback。

## 逐行读取

```cpp
std::uint64_t rows = 0;
auto st = client.queryEach(
    "SELECT id,payload FROM event ORDER BY id", {},
    [](const sqlconduit::common::Row &row) {
        return enqueue(row); // false 正常早停
    }, rows);
```

回调在执行线程中同步发生，应短小、线程安全，不要保存 Row 引用。早停的 `rows` 是已交付数量。

## Cursor 背压

```cpp
sqlconduit::core::CursorOptions options;
options.batch_size = 500;
options.auto_transaction = true;
std::unique_ptr<sqlconduit::core::Cursor> cursor;
auto st = client.openCursor("SELECT id,payload FROM event ORDER BY id", {}, options, cursor);

while (st.ok() && cursor->hasNext()) {
    sqlconduit::common::ResultSet page;
    st = cursor->fetch(options.batch_size, page);
    consume(page);
}
```

Cursor 会占用连接直到 close/析构。连接池应按并发 Cursor 数量规划；`max_open_cursors` 是防止耗尽池的硬预算。PostgreSQL 服务端 cursor 可能需要自动事务，MySQL 使用 unbuffered result，ODBC/OCI 使用各自游标语义。

## 大字段输入

```cpp
std::ifstream file("payload.bin", std::ios::binary);
sqlconduit::common::StreamParams params{
    sqlconduit::common::StreamSource(file, true), std::int64_t(42)};
sqlconduit::common::GeneratedKeys keys;
std::int64_t affected = 0;

client.withSession([&](sqlconduit::core::Session &s) {
    return s.execute("UPDATE files SET body=? WHERE id=?",
                     params, affected, keys);
});
```

当前 `StreamSource` 仍在驱动层缓冲，解决的是统一输入 API 而非恒定内存。Oracle 的 `lob_max_bytes` 同时限制结果 LOB 物化；超过护栏会返回错误而非截断。
