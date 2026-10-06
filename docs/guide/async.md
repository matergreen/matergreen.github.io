# 异步执行指南

SQLConduit 1.0 使用 `Client` 成员 Future API。最常见的用法：

```cpp
auto pending = client.queryAsync(
    "SELECT id,name FROM users WHERE id=?", {std::int64_t(42)});

// 在应用调度点等待或转交 future；不要立即 get 后把它当同步 API
auto result = pending.get();
if (!result.status.ok()) handle(result.status);
```

## 它解决什么

- 公开提交有有界队列和 `Overloaded` 背压；
- 合格 query/execute 的池等待不占 worker；
- 支持厂商能力时用真正非阻塞驱动状态机；
- 不支持的复合操作仍通过有界兼容执行器，模式不会伪装成 native；
- shutdown 会完成已接受 future，包括停在 retry backoff 的操作。

## 正确读取模式

```cpp
switch (result.mode) {
case sqlconduit::async::ExecutionMode::Native:
    recordNative();
    break;
case sqlconduit::async::ExecutionMode::CompatibilityFallback:
    recordFallback();
    break;
}
```

先判断 status，再查看 mode。fallback 仍是受支持路径，只是阻塞厂商 I/O 会占用 worker；容量规划时要监控 `fallbackOperations`、`active`、`queueDepth` 和 `rejected`。

## 读超时与写语义

native 读在 deadline 触发时先完成 future，并取消/隔离底层连接；迟到 completion 只负责安全回收。兼容读要等阻塞调用返回后才能归类超时。写可能已提交，所以 successful write/batch/transaction 不会事后改成 timeout。

## 复杂拓扑

普通 query/execute 经数据源组时，选择副本、重试、缓存、主库回退、安全写 failover 和 shadow 路由都在异步状态机中进行。外层审计/拦截器只执行一次，叶子 I/O 是否 native 由最终驱动和语句能力决定。

## 避免常见误用

- 在提交后立刻 `.get()`：语义正确，但没有并发收益；
- 在事务回调里再异步借连接：可能在小池中自我等待；
- 根据 `Native` 判断业务成功：错误，必须检查 status；
- 在 future 未完成时销毁 Client：先调用 shutdown 并按应用顺序停止提交者；
- 把 statement timeout 当数据库端强杀保证：取消能力由厂商驱动决定。

完整方法与驱动矩阵见 [Future 异步 API](/api/async)。
