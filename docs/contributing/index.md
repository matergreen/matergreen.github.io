# 反馈与 Pull Request

主要渠道：[GitHub Issues](https://github.com/matergreen/dbmw/issues) 和 [Pull Requests](https://github.com/matergreen/dbmw/pulls)。Gitee 仓库是国内镜像。

## 提交问题

请提供：SQLConduit 版本/commit、OS/编译器/CMake、数据库服务端和客户端库版本、启用的 `SQLCONDUIT_ENABLE_*`、最小配置/代码、完整 `Status`、预期与实际结果。日志先删除密码、Token、DSN 和业务数据。

异步问题还应提供 `result.mode` 与 `client.asyncStats()`；池问题提供目标数据源的 poolStats；一致性问题说明幂等、事务和 failover 配置。

## 本地开发

```bash
git clone https://github.com/YOUR_NAME/dbmw.git SQLConduit
cd SQLConduit
git remote add upstream https://github.com/matergreen/dbmw.git

cmake -S . -B build -DSQLCONDUIT_BUILD_TESTS=ON
cmake --build build -j
ctest --test-dir build --output-on-failure
```

实库测试按驱动打开 `SQLCONDUIT_ENABLE_*` 和 `SQLCONDUIT_BUILD_INTEGRATION_TESTS=ON`，使用专用临时数据库/schema，不连接生产库。

## 分支、提交和 PR

```bash
git fetch upstream
git switch main
git pull --ff-only upstream main
git switch -c feat/short-description
```

提交保持单一目的并使用 Conventional Commit，例如 `fix(pool): ...`、`feat(oracle): ...`、`docs(async): ...`。PR 说明问题、方案、API/配置/兼容性与一致性影响、实际运行的命令、实库版本、风险与未覆盖项。发版可见功能必须同步 CHANGELOG。

## 文档站

文档站是独立 `dbmw-web` 目录：

```bash
npm install
npm run build
```

API 改动同时更新中英文页面，确保示例使用当前命名空间和稳定入口。构建会检查死链；还应检查 375px 移动端、键盘导航、明暗主题和长代码块横向滚动。

贡献按 Apache License 2.0 授权。
