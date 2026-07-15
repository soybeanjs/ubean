# Database Integrations

ubean's database layer (`defineDatabase` / `useDatabase`) is built on the `db0` connector abstraction and ships with an in-memory fallback. For richer query APIs, bring your own ORM and wire it through a virtual module so handlers import a shared client instance.

See [Database Operations](../reference/api/database.md) for the full built-in API reference.

## Drizzle ORM

### Installation

```bash
pnpm add drizzle-orm
pnpm add -D drizzle-kit
# Plus a driver of your choice:
pnpm add better-sqlite3        # SQLite (Node)
# or
pnpm add postgres              # PostgreSQL
# or
pnpm add mysql2                # MySQL
```

### Option A — Register via virtual module (recommended)

```typescript
// ubean.config.ts
import { defineConfig } from 'ubean';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';

const client = new Database('./data/app.sqlite');
const db = drizzle(client);

export default defineConfig({
  modules: [
    {
      name: 'drizzle',
      setup(_options, kit) {
        kit.addVirtualImports({
          '#db': () => ({ default: db, db })
        });
      }
    }
  ]
});
```

```typescript
// src/db/schema.ts
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').unique().notNull()
});
```

```typescript
// routes/api/users.ts
import { defineHandler } from 'ubean';
import db, { users } from '#db';

export const GET = defineHandler(async c => {
  const rows = await db.select().from(users).limit(50);
  return c.json(rows);
});

export const POST = defineHandler(async c => {
  const body = await c.req.json();
  const [created] = await db.insert(users).values(body).returning();
  return c.json(created, 201);
});
```

### Migrations

Drizzle migrations are managed with `drizzle-kit`:

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio"
  }
}
```

To run them programmatically inside ubean at boot, call `migrateDatabase(db, statements)` with the SQL produced by `drizzle-kit generate`.

## Prisma

### Installation

```bash
pnpm add @prisma/client
pnpm add -D prisma
```

### Schema & client

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id    Int    @id @default(autoincrement())
  name  String
  email String @unique
}
```

```bash
npx prisma generate
npx prisma migrate dev --name init
```

### Wire through a virtual module

```typescript
// ubean.config.ts
import { defineConfig } from 'ubean';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default defineConfig({
  modules: [
    {
      name: 'prisma',
      setup(_options, kit) {
        kit.addVirtualImports({
          '#prisma': () => ({ default: prisma, prisma })
        });
      }
    }
  ]
});
```

```typescript
// routes/api/users.ts
import { defineHandler } from 'ubean';
import prisma from '#prisma';

export const GET = defineHandler(async c => {
  const users = await prisma.user.findMany();
  return c.json(users);
});
```

## Using the built-in database layer

For simple use cases where an ORM is overkill, use `defineDatabase` + `useDatabase` directly:

```typescript
// app.ts (or a module setup)
import { defineDatabase, registerDb0Create } from 'ubean';
import { postgres } from 'db0/connectors/postgres';

// Register the db0 factory once
registerDb0Create(createFn);

export const db = defineDatabase({
  connector: postgres({ url: process.env.DATABASE_URL! })
});
```

```typescript
// routes/api/users.ts
import { defineHandler, useDatabase } from 'ubean';

export const GET = defineHandler(async c => {
  const db = useDatabase();
  const { rows } = await db.sql<{ id: number; email: string }>`
    SELECT id, email FROM users ORDER BY id DESC LIMIT 50
  `;
  return c.json(rows);
});
```

## MongoDB (Mongoose)

```bash
pnpm add mongoose
```

```typescript
// ubean.config.ts
import { defineConfig } from 'ubean';
import mongoose from 'mongoose';

export default defineConfig({
  modules: [
    {
      name: 'mongoose',
      async setup(_options, kit) {
        await mongoose.connect(process.env.MONGODB_URI!);
        kit.addVirtualImports({
          '#mongoose': () => ({ default: mongoose, mongoose })
        });
      }
    }
  ]
});
```

```typescript
// src/db/models/User.ts
import { Schema, model } from '#mongoose';

const userSchema = new Schema({
  name: String,
  email: { type: String, unique: true }
});

export const User = model('User', userSchema);
```

```typescript
// routes/api/users.ts
import { defineHandler } from 'ubean';
import { User } from '@/db/models/User';

export const GET = defineHandler(async c => {
  const users = await User.find();
  return c.json(users);
});
```

## Important corrections

Older versions of this document used APIs that do not exist in ubean. When migrating, replace:

- `import { defineEventHandler } from '@ubean/core'` → `import { defineHandler } from 'ubean'`
- `routes/api/users.get.ts` → `routes/api/users.ts` with `export const GET = defineHandler(...)`
- Standalone `json(...)` helper → `c.json(...)` on the Hono context
- `defineConfig({ database: { driver, connection } })` — this config field does **not** exist. Use a `modules` setup with `kit.addVirtualImports` (shown above), or call `defineDatabase({ connector })` at app startup.

## Best Practices

1. **Prefer ORMs over raw SQL** for non-trivial schemas — type safety pays off quickly.
2. **Register the client once** — create it in `setup()` and expose via `addVirtualImports`; never instantiate per-request.
3. **Use migrations** — both Drizzle and Prisma ship their own tooling; integrate them via npm scripts.
4. **Store credentials in `defineEnv()`** with `.secret()` — never commit `.env` files with real secrets.
5. **Close connections on shutdown** — call `closeDatabases()` (built-in layer) or `await mongoose.disconnect()` / `await prisma.$disconnect()` from a `shutdown` hook.
