# 扩展数据库驱动

驱动 SPI 分三层：`IDriver` 创建连接，`IDatabaseConnection` 实现协议，`ICursor` 实现增量读取。应用通常把自定义 `DriverRegistration` 加到自己的 Client，而不是修改全局状态。

## 注册对象

```cpp
class ExampleDriver final : public sqlconduit::driver::IDriver {
public:
    const char *name() const override { return "example"; }
    std::unique_ptr<sqlconduit::core::IDatabaseConnection>
    createConnection() override {
        return std::make_unique<ExampleConnection>();
    }
};

auto st = client.addDriver({
    "example", [] { return std::make_unique<ExampleDriver>(); }
});
```

必须在 `init()` 前注册。低层 `DriverRegistry::instance()` 仅用于特殊全局扩展；内置和普通应用驱动优先 Client 级注册，避免跨实例泄漏。

## 最小连接契约

必须实现 connect/ping/query/execute/begin/commit/rollback/close/isOpen。参数、prepared、batch、cursor、多结果、call、生成键、stream、savepoint、cancel 和 native async 有默认 fallback 或 `NotSupported`，但生产驱动应明确覆盖实际能力。

```cpp
class ExampleConnection final : public sqlconduit::core::IDatabaseConnection {
public:
    sqlconduit::common::Status connect(
        const sqlconduit::config::DataSourceConfig &) override;
    sqlconduit::common::Status ping() override;
    sqlconduit::common::Status query(
        const std::string &, sqlconduit::common::ResultSet &) override;
    sqlconduit::common::Status execute(
        const std::string &, std::int64_t &) override;
    sqlconduit::common::Status begin() override;
    sqlconduit::common::Status commit() override;
    sqlconduit::common::Status rollback() override;
    void close() override;
    bool isOpen() const override;
};
```

## 参数与 prepared

- 支持原生参数时覆盖带 `Params` 的 query/execute 并让 `supportsParams()` 返回 true。
- 只有确实安全时才允许 literal interpolation；默认 false。
- prepared 支持需实现 prepare、两个 executePrepared、closeAllPrepared、cache limit，并返回 `supportsPrepared=true`。
- 占位符转换可使用基类 helper，但必须正确跳过字符串、注释和方言结构。

## Native async 合同

```cpp
sqlconduit::core::AsyncCapability asyncCapability() const override {
    return sqlconduit::core::AsyncCapability::Native;
}

bool queryAsync(const std::string &sql,
                const sqlconduit::common::Params &params,
                AsyncQueryCompletion completion) override;
```

Native 实现必须：

1. 不阻塞调用线程，启动后立即返回 true；
2. completion 恰好调用一次，即使失败或取消；
3. 返回 false 代表完全没有启动操作，调用方可安全 fallback；
4. completion 前保持连接状态可判断，取消后不可证明可复用则报告 broken；
5. 不把 reactor/polling worker 上的阻塞调用伪装成 native。

## 错误映射

尽可能填充 `ErrorCode`、SQLSTATE、native code、retryable 和 connectionBroken。约束、死锁、取消、超时和断线应映射为稳定错误码。错误文本必须脱敏连接串和凭据。

## Cursor、批量与调用

`ICursor` 实现 fetch/fetchRow/close/isOpen/hasNext/rowsFetched，并明确事务所有权。批量快速路径必须保留整体原子性和每项 affected/keys；厂商无法提供精确每项结果时使用事务逐行 fallback。多结果与 OUT/INOUT 必须完整收集，不能只返回第一个结果集。

## 测试清单

- 参数边界：NULL、Unicode、binary、decimal、时间、极大值；
- 事务：所有隔离级别、保存点、异常和析构回滚；
- 池复用：取消/超时/错误后 ping 和下一条 SQL；
- async：立即失败、迟到回调、取消竞态、并发、关闭；
- batch/cursor/call/generated keys 与 fallback 等价；
- 错误分类、脱敏、Windows/macOS/Linux 编译；
- 真实数据库集成，不只 mock。
