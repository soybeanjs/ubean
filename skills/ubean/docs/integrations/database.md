# Database Integrations

## Drizzle ORM

### Installation

```bash
pnpm add drizzle-orm postgres
pnpm add -D drizzle-kit
```

### Configuration

```typescript
// ubean.config.ts
import { defineConfig } from '@ubean/core';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

export default defineConfig({
  modules: [
    {
      name: 'drizzle',
      setup(_, kit) {
        const client = postgres(process.env.DATABASE_URL);
        const db = drizzle(client);

        kit.addVirtualImports({
          '#drizzle/db': () => ({ default: db })
        });
      }
    }
  ]
});
```

### Schema Definition

```typescript
// src/db/schema.ts
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').unique().notNull(),
  createdAt: timestamp('created_at').defaultNow()
});
```

### Usage

```typescript
// src/routes/api/users.get.ts
import { defineEventHandler } from '@ubean/core';
import { db } from '#drizzle/db';
import { users } from '@/db/schema';

export default defineEventHandler(async () => {
  return await db.select().from(users);
});
```

### Migrations

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio"
  }
}
```

## Prisma

### Installation

```bash
pnpm add @prisma/client
pnpm add -D prisma
```

### Initialize

```bash
npx prisma init
```

### Configuration

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
  id    Int     @id @default(autoincrement())
  name  String
  email String  @unique
}
```

### Generate Client

```bash
npx prisma generate
```

### Usage

```typescript
// src/routes/api/users.get.ts
import { defineEventHandler } from '@ubean/core';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default defineEventHandler(async () => {
  return await prisma.user.findMany();
});
```

### Migrations

```bash
npx prisma migrate dev --name init
```

## MySQL

### Installation

```bash
pnpm add mysql2
```

### Configuration

```typescript
// ubean.config.ts
import { defineConfig } from '@ubean/core';

export default defineConfig({
  database: {
    driver: 'mysql',
    connection: {
      host: process.env.MYSQL_HOST,
      port: parseInt(process.env.MYSQL_PORT),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE
    }
  }
});
```

### Usage

```typescript
import { useDatabase } from '@ubean/core';

const db = useDatabase();

const users = await db.select().from('users');
```

## SQLite

### Installation

```bash
pnpm add sqlite3
```

### Configuration

```typescript
// ubean.config.ts
import { defineConfig } from '@ubean/core';

export default defineConfig({
  database: {
    driver: 'sqlite',
    connection: {
      filename: './data/database.sqlite'
    }
  }
});
```

### Usage

```typescript
import { useDatabase } from '@ubean/core';

const db = useDatabase();

const users = await db.select().from('users');
```

## MongoDB

### Installation

```bash
pnpm add mongoose
```

### Configuration

```typescript
// ubean.config.ts
import { defineConfig } from '@ubean/core';
import mongoose from 'mongoose';

export default defineConfig({
  modules: [
    {
      name: 'mongoose',
      setup(_, kit) {
        mongoose.connect(process.env.MONGODB_URI);

        kit.addVirtualImports({
          '#mongoose': () => ({ default: mongoose })
        });
      }
    }
  ]
});
```

### Schema Definition

```typescript
// src/db/models/User.ts
import { Schema, model } from '#mongoose';

const userSchema = new Schema({
  name: String,
  email: { type: String, unique: true },
  createdAt: { type: Date, default: Date.now }
});

export const User = model('User', userSchema);
```

### Usage

```typescript
// src/routes/api/users.get.ts
import { defineEventHandler } from '@ubean/core';
import { User } from '@/db/models/User';

export default defineEventHandler(async () => {
  return await User.find();
});
```

## PostgreSQL

### Installation

```bash
pnpm add pg
```

### Configuration

```typescript
// ubean.config.ts
import { defineConfig } from '@ubean/core';

export default defineConfig({
  database: {
    driver: 'postgres',
    connection: {
      host: process.env.PG_HOST,
      port: parseInt(process.env.PG_PORT),
      user: process.env.PG_USER,
      password: process.env.PG_PASSWORD,
      database: process.env.PG_DATABASE
    }
  }
});
```

### Usage

```typescript
import { useDatabase } from '@ubean/core';

const db = useDatabase();

const users = await db.select().from('users');
```

## Best Practices

1. **Use ORM**: Prefer ORM over raw SQL
2. **Connection pooling**: Configure pool for production
3. **Migrations**: Use migrations for schema changes
4. **Environment variables**: Store credentials in environment variables
5. **Validation**: Validate inputs before database operations
6. **Error handling**: Handle database errors gracefully
7. **Logging**: Enable query logging for debugging
