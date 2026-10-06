# Download, build, and configure

```bash
git clone https://github.com/matergreen/dbmw.git SQLConduit
cd SQLConduit
cmake -S . -B build \
  -DCMAKE_BUILD_TYPE=Release \
  -DSQLCONDUIT_ENABLE_POSTGRES=ON \
  -DSQLCONDUIT_BUILD_TESTS=ON
cmake --build build -j
ctest --test-dir build --output-on-failure
```

Driver switches are MYSQL, POSTGRES, ORACLE, and ODBC with the `SQLCONDUIT_ENABLE_` prefix. Core does not force every vendor SDK. MySQL needs libmysqlclient, PostgreSQL libpqxx/libpq, Oracle Instant Client Basic + SDK, and ODBC uses unixODBC or Windows ODBC.

Install and consume as a component package:

```bash
cmake --install build --prefix /opt/sqlconduit
```

```cmake
find_package(sqlconduit REQUIRED COMPONENTS Postgres)
target_link_libraries(my_app PRIVATE sqlconduit::postgres)
```

Components are MySQL, Postgres, ODBC, and Oracle. Debug libraries use a `d` postfix.

## Minimal YAML

```yaml
# yaml-language-server: $schema=./sqlconduit.schema.json
default_datasource: main
pool: { min: 1, max: 8, borrow_timeout_ms: 3000 }
async: { enabled: true, queue_size: 4096 }
datasources:
  - name: main
    type: postgres
    host: 127.0.0.1
    port: 5432
    user: app
    password_env: APP_DB_PASSWORD
    database: app
```

JSON uses identical fields. Start from the repository examples and associate the shared Schema. Prefer environment-backed passwords.

## First Client

```cpp
#include "sqlconduit/sqlconduit.h"
#include "sqlconduit/drivers/postgres.h"

sqlconduit::Client client;
auto st = client.addDriver(sqlconduit::drivers::postgres());
if (st.ok()) st = client.init("config/datasources.yaml");
if (!st.ok()) return 1;

sqlconduit::common::ResultSet rows;
st = client.query("SELECT current_database() AS name", rows);
client.shutdown();
```

Building/linking a component controls whether code exists; `addDriver()` controls whether this Client can use it. A missing component yields DriverDisabled, while missing registration yields UnknownDriver.

Before production, validate secrets/TLS, per-leaf pool sizing, timeout and cancellation on the real vendor driver, actual async mode, rendered-SQL disclosure, and an installed-package consumer build. See the [configuration reference](/en/api/configuration).
