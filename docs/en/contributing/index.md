# Feedback and pull requests

Use [GitHub Issues](https://github.com/matergreen/dbmw/issues) and [Pull Requests](https://github.com/matergreen/dbmw/pulls). The Gitee repository is a mainland China mirror.

A useful report includes SQLConduit version/commit, OS/compiler/CMake, server and client-library versions, enabled `SQLCONDUIT_ENABLE_*` switches, minimal config/code, full Status, and expected versus actual behavior. Remove passwords, tokens, DSNs, and business data. Async reports should include result mode and asyncStats; pool reports should include target poolStats.

```bash
git clone https://github.com/YOUR_NAME/dbmw.git SQLConduit
cd SQLConduit
git remote add upstream https://github.com/matergreen/dbmw.git
cmake -S . -B build -DSQLCONDUIT_BUILD_TESTS=ON
cmake --build build -j
ctest --test-dir build --output-on-failure
```

Enable the relevant driver and `SQLCONDUIT_BUILD_INTEGRATION_TESTS=ON` for live tests, using an isolated temporary database/schema.

Keep branches and commits focused, use Conventional Commit, and describe problem, design, API/config/compatibility and consistency impact, commands actually run, live vendor versions, risks, and gaps. User-visible release work must update CHANGELOG.

For the separate Vue/VitePress site, run `npm install` and `npm run build`. Update both languages, use current namespaces and stable APIs, check links, 375px layout, keyboard navigation, themes, and long code blocks.

Contributions are licensed under Apache License 2.0.
