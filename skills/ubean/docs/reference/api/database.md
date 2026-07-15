# Database Operations

ubean provides a lightweight database layer built on top of the `db0` connector abstraction, with an in-memory fallback used when no connector is registered. All database APIs are auto-imported in server-side code.

## defineDatabase()

Create or register a database instance.

```typescript
import { defineDatabase } from 'ubean';

// Default in-memory database (used when no connector is available)
const db = defineDatabase();

// Register a named database via a db0 connector instance
import { defineDatabase, registerDb0Create } from 'ubean';
import { sqlite } from 'db0/connectors/better-sqlite3';

// Register the db0 factory once (usually in app.ts / a module setup)
registerDb0Create(createFn);

const sqliteDb = defineDatabase({
  connector: sqlite({ path: './data/app.sqlite' })
});

// Multiple named connectors
const multi = defineDatabase({
  default: 'primary',
  connectors: {
    primary: postgresConnector,
    replica: postgresReplicaConnector
  }
});
```

### DatabaseOptions

| Option      | Type                              | Description                                           |
| ----------- | --------------------------------- | ----------------------------------------------------- |
| connector   | DatabaseConnectorInstance         | A single connector instance (becomes the default)    |
| connectors  | Record<string, DatabaseConnectorInstance> | Named connectors keyed by alias              |
| default     | string                            | Name of the default connector (requires `connectors`) |

If neither `connector` nor `connectors` is provided, an in-memory SQL implementation is used so the same code path works in tests and edge runtimes without an external driver.

## useDatabase()

Retrieve a registered database. The first call without arguments lazily creates the default in-memory database.

```typescript
import { useDatabase } from 'ubean';

const db = useDatabase();          // default database
const replica = useDatabase('replica'); // named database (throws if missing)
```

### Database interface

```typescript
export interface Database {
  sql: <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<{ rows: T[] }>;
  exec: (query: string) => Promise<void>;
  close: () => Promise<void>;
}
```

`sql` is a tagged template that returns `{ rows }`. Parameters are automatically bound — never interpolate user input directly.

```typescript
// Parameterized query
const { rows } = await db.sql<{ id: number; email: string }>`
  SELECT id, email FROM users WHERE id = ${userId}
`;
```

For raw SQL fragments (e.g. table/column names that cannot be bound), use the `rawSql` (aliased as `sqlRaw` and `raw`) helper.

```typescript
import { rawSql } from 'ubean';

const table = rawSql('users');
const { rows } = await db.sql`SELECT name FROM ${table}`;
```

## Migrations

ubean provides two migration helpers. Neither requires a dedicated CLI — migrations are run from your application code or scripts.

### migrateDatabase(db, statements)

Runs an array of raw SQL statements sequentially.

```typescript
import { migrateDatabase, useDatabase } from 'ubean';

const db = useDatabase();

await migrateDatabase(db, [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`
]);
```

### runMigrations(db, migrations, options)

Tracks applied migrations in a `_migrations` table and only runs pending ones.

```typescript
import { runMigrations, useDatabase, type Migration } from 'ubean';

const migrations: Migration[] = [
  {
    name: '0001_create_users',
    up: `CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT UNIQUE)`,
    down: `DROP TABLE users`
  }
];

const { applied } = await runMigrations(useDatabase(), migrations, {
  table: '_migrations',
  log: true
});
```

### Migration type

```typescript
export interface Migration {
  name: string;
  up: string;
  down?: string;
}
```

ubean does **not** ship a `defineMigration()` or `defineSeed()` API. If you need a structured migration runner, define your own loader that scans `migrations/` and passes the result to `runMigrations`.

## Hooks

Database lifecycle hooks are exposed via `getDatabaseHooks()` (a `hookable` instance).

```typescript
import { getDatabaseHooks } from 'ubean';

const hooks = getDatabaseHooks();

hooks.hook('db:connect', db => console.log('connected', db));
hooks.hook('db:disconnect', db => console.log('disconnecting'));
hooks.hook('db:query', (query, params) => console.log(query, params));
hooks.hook('db:error', (err, query) => console.error(err, query));
```

| Hook           | Payload                              |
| -------------- | ------------------------------------ |
| `db:connect`   | `(db: Database)`                     |
| `db:disconnect` | `(db: Database)`                     |
| `db:query`     | `(query: string, params?: unknown[])` |
| `db:error`     | `(error: Error, query?: string)`     |

## Cleanup

```typescript
import { closeDatabases } from 'ubean';

await closeDatabases(); // closes every registered database and clears the registry
```

Call `closeDatabases()` from `onAppCreated` (server only), a `shutdown` hook, or a platform lifecycle handler.

## Using with ORM layers

ubean's database interface is intentionally low-level. For query builders, bring your own ORM and wire it through a virtual module so server code can import it without re-creating clients on every request.

```typescript
// ubean.config.ts
import { defineConfig } from 'ubean';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';

export default defineConfig({
  modules: [
    {
      name: 'drizzle',
      setup(_options, kit) {
        const client = new Database('./data/app.sqlite');
        const db = drizzle(client);
        kit.addVirtualImports({
          '#db': () => ({ default: db, db })
        });
      }
    }
  ]
});
```

```typescript
// routes/users.ts
import { defineHandler } from 'ubean';
import db, { users } from '#db';

export const GET = defineHandler(async c => {
  const rows = await db.select().from(users).limit(50);
  return c.json(rows);
});
```

## Best Practices

1. **Always parameterize** — use `db.sql` tagged templates; never string-concatenate user input.
2. **Register once, reuse everywhere** — call `defineDatabase()` during app setup and use `useDatabase()` in handlers.
3. **Close on shutdown** — call `closeDatabases()` to release connection pools cleanly.
4. **Use migrations** — prefer `runMigrations` over ad-hoc `exec` calls for schema changes.
5. **Bring your own ORM** — Drizzle, Prisma, or Mongoose work via virtual modules when you need a richer query API.
