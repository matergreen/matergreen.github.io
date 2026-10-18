# 实体映射 API

头文件 `sqlconduit/mapping.h` 是 header-only 适配层。它把 `Row`/`ResultSet` 与业务结构体互转，但不是 ORM：SQL、关联关系、事务边界和对象生命周期仍由应用控制。

## 声明映射

```cpp
#include "sqlconduit/mapping.h"

struct User {
    std::int64_t id{};
    std::string name;
    std::optional<std::string> email;
};

template <> struct sqlconduit::mapping::RowMapper<User> {
    static auto describe() {
        using sqlconduit::mapping::FieldFlags;
        return sqlconduit::mapping::Mapping<User>()
            .field(&User::id, "id", FieldFlags::PrimaryKey | FieldFlags::Generated)
            .field(&User::name, "name")
            .field(&User::email, "email");
    }
};
```

常用标志：`PrimaryKey` 用于 UPDATE 条件，`Generated` 不进入普通 INSERT 参数并可回填，`ReadOnly` 不参与写入。缺列和多余列默认忽略，可收紧：

```cpp
return sqlconduit::mapping::Mapping<User>()
    .field(&User::id, "id")
    .field(&User::name, "name")
    .missingColumns(sqlconduit::mapping::MissingColumns::Error)
    .extraColumns(sqlconduit::mapping::ExtraColumns::Error);
```

SQL NULL 写入非 `std::optional<T>`、不兼容类型或整数溢出都会返回 `MappingError`，不会静默填默认值。

## Client 与 Session 查询

```cpp
auto many = sqlconduit::queryAs<User>(
    client,
    "SELECT id, name, email FROM users WHERE active=?",
    {true});
if (many.status.ok()) consume(many.items);

auto one = sqlconduit::queryOneAs<User>(
    client, "primary",
    "SELECT id, name, email FROM users WHERE id=?",
    {std::int64_t(42)});
if (one.status.ok() && one.value) consume(*one.value);

client.transaction([](sqlconduit::core::Session &s) {
    auto users = sqlconduit::queryAs<User>(s, "SELECT id,name,email FROM users");
    return users.status;
});
```

`queryOneAs` 接受 0 或 1 行；超过 1 行返回 `MappingError`。命名数据源重载明确传 Client、数据源名、SQL 和参数。

## 逐行映射

```cpp
std::uint64_t rows = 0;
auto st = sqlconduit::queryEachAs<User>(
    client,
    "SELECT id,name,email FROM users ORDER BY id", {},
    [](const User &user) {
        consume(user);
        return true;
    }, rows);
```

映射失败立即停止并返回错误；回调返回 false 是正常早停。不要从回调保留参数引用。

已有 Cursor 可分页映射：

```cpp
auto page = sqlconduit::fetchAs<User>(*cursor, 256);
if (page.status.ok()) consume(page.items);
```

`fetchAs` 每次创建独立页结果；空页与结束状态仍以 Cursor 的 `hasNext()`/驱动行为为准。

## 直接转换已有结果

```cpp
std::vector<User> users;
auto st = sqlconduit::mapping::fromRows(resultSet, users);

User user;
st = sqlconduit::mapping::fromRow(row, user);

auto keys = sqlconduit::keysAs<User>(generatedKeys);
```

原始结果仍可在 get() 后手动 fromRows；1.2 更推荐 `client.queryAsync<User>`() 等完成式映射，不增加等待线程。见[直接返回结果](./query-results)。

## 参数与 SQL 生成

```cpp
auto insertParams = sqlconduit::mapping::paramsOf(user);
auto updateParams = sqlconduit::mapping::updateParamsOf(user);
auto batch = sqlconduit::mapping::batchOf(users);

auto insertSql = sqlconduit::mapping::insertSql<User>(
    "users", sqlconduit::common::util::Dialect::Postgres);
auto updateSql = sqlconduit::mapping::updateSql<User>(
    "users", sqlconduit::common::util::Dialect::Postgres);
```

生成器只引用映射中的标识符并返回 `?` 参数 SQL，不推断表关联、方言表达式或业务规则。表名是代码控制的标识符，不应直接来自用户输入。

## 写入辅助

```cpp
User user{0, "Ada", std::nullopt};
auto inserted = sqlconduit::insertAs(client, "users", user);
if (inserted.status.ok()) {
    // 支持的驱动/SQL 会把 Generated 字段回填到 user
}

user.name = "Ada Lovelace";
auto updated = sqlconduit::updateAs(client, "users", user);

std::vector<User> users = loadUsers();
auto batchWrite = sqlconduit::insertBatchAs(client, "users", users);
```

`updateAs` 必须至少有一个 PrimaryKey 和一个可写非主键字段，否则返回 `MappingError`。生成键能力依驱动和 SQL 方言而异；需要完全可控的 `RETURNING`/`OUTPUT` 时直接写 SQL。

## 支持的成员类型

标量 bool、整数、浮点、string、Blob、Timestamp、枚举、`std::optional<T>`，以及 Decimal、Date、Time、Uuid、Json、Array、Composite 和 PostgreSQL geometry 类型都有转换器。自定义类型可特化 `mapping::ValueConverter<T>`，并应返回明确转换错误而不是截断数据。

## 1.2 一行注册实体

```cpp
struct Account { std::int64_t id = 0; std::string name; };
SQLCONDUIT_ENTITY(Account, "accounts", id, name)
// 初始化 Client 后：
// auto accounts = client.query<Account>("SELECT id, name FROM accounts");
```

宏在全局命名空间注册一次，支持 1–32 个同名列公共成员，缺列严格报错。不要再为 Account 特化 RowMapper。别名、自增字段和自定义策略可使用带 TABLE/NAMED_FIELD/FLAGGED_FIELD 的 SQLCONDUIT_MAP 或显式 Mapping。见[完整注册方式与成员指针 Builder](./query-results)。
