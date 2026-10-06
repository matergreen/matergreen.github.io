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

Existing data converts through `mapping::fromRows`, `mapping::fromRow`, and `keysAs`. For async work, await/get the Client future, check status, then map `result.rows`; 1.0 has no separate async mapping facade.

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
