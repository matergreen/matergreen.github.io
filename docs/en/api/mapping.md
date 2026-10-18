# Entity mapping API

`sqlconduit/mapping.h` is a header-only adapter between `Row`/`ResultSet` and application structures. It is not an ORM: SQL, relationships, transaction boundaries, and object lifetime stay explicit.

## Declare a mapping

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

`PrimaryKey` contributes UPDATE predicates, `Generated` is omitted from ordinary INSERT parameters and may be backfilled, and `ReadOnly` is excluded from writes. Missing and extra columns default to Ignore and can independently be changed to Error.

SQL NULL into a non-optional member, incompatible conversion, or integer overflow returns `MappingError`; values are never silently defaulted.

## Read with Client or Session

```cpp
auto many = sqlconduit::queryAs<User>(
    client, "SELECT id,name,email FROM users WHERE active=?", {true});

auto one = sqlconduit::queryOneAs<User>(
    client, "primary",
    "SELECT id,name,email FROM users WHERE id=?", {std::int64_t(42)});

std::uint64_t count = 0;
auto st = sqlconduit::queryEachAs<User>(
    client, "SELECT id,name,email FROM users", {},
    [](const User &u) { consume(u); return true; }, count);
```

`queryOneAs` accepts zero or one row and returns `MappingError` for more. Row mapping stops on its first error; callback false is a successful early stop.

Map an existing cursor one page at a time:

```cpp
auto page = sqlconduit::fetchAs<User>(*cursor, 256);
if (page.status.ok()) consume(page.items);
```

Each `fetchAs` call returns an independent page. Use Cursor state and driver semantics to determine completion.

Existing data still converts through `mapping::fromRows`, `mapping::fromRow`, and `keysAs`. Since 1.2, prefer `client.queryAsync<User>`() and related completion-based helpers without an extra waiting thread. See [direct results](./query-results).

## Generate parameters and writes

```cpp
auto params = sqlconduit::mapping::paramsOf(user);
auto updates = sqlconduit::mapping::updateParamsOf(user);
auto batch = sqlconduit::mapping::batchOf(users);

auto sql = sqlconduit::mapping::insertSql<User>(
    "users", sqlconduit::common::util::Dialect::Postgres);

auto inserted = sqlconduit::insertAs(client, "users", user);
auto updated = sqlconduit::updateAs(client, "users", user);
auto batchWrite = sqlconduit::insertBatchAs(client, "users", users);
```

Generated SQL uses mapped identifiers and `?` values only; it does not infer relationships or business expressions. `updateAs` requires at least one primary key and one writable non-key field. Generated-key support varies by driver and dialect; use explicit `RETURNING`/`OUTPUT` SQL when exact control matters.

Built-in converters cover scalar numbers, bool, string, Blob, Timestamp, enums, `std::optional<T>`, Decimal, Date, Time, Uuid, Json, Array, Composite, and PostgreSQL geometry values. Custom types can specialize `mapping::ValueConverter<T>` and should return explicit conversion errors.

## One-line entity registration since 1.2

```cpp
struct Account { std::int64_t id = 0; std::string name; };
SQLCONDUIT_ENTITY(Account, "accounts", id, name)
// After initializing Client:
// auto accounts = client.query<Account>("SELECT id, name FROM accounts");
```

Place the macro once at global namespace scope. It supports 1–32 public members with matching column names and strict missing-column checks. Do not also specialize RowMapper for Account. Use SQLCONDUIT_MAP with TABLE/NAMED_FIELD/FLAGGED_FIELD or explicit Mapping for aliases, generated fields or custom policies. [All variants and typed Builder](./query-results).
