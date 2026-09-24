---
title: 数据库
description: 基于 db0 connector 抽象构建的数据库层，提供 defineDatabase/useDatabase 与内存回退。
translatedFrom: f15e3906cae3
sections: ["02206c77","e3b0c442","3ecb8b10","d716d0e4","b6398cea","8cca4da5","0862bd87","93fef277","a5505e21","2960a1bc","2150f714","232355de","2b2cc79b","c19c3fff"]
---

# 数据库集成

ubean 的数据库层（`defineDatabase` / `useDatabase`）构建在 `db0` 的 connector 抽象之上，并自带内存回退实现。若需要更丰富的查询 API，可以引入自己的 ORM，并通过虚拟模块接线，让各个 handler 导入同一个客户端实例。

内置 API 的完整参考见 <Link to="/reference/database">数据库操作</Link>。

## Drizzle ORM

### 安装

```bash
pnpm add drizzle-orm
pnpm add -D drizzle-kit
# 再加上你选用的驱动：
pnpm add better-sqlite3        # SQLite (Node)
# 或
pnpm add postgres              # PostgreSQL
# 或
pnpm add mysql2                # MySQL
```

### 方案 A —— 通过虚拟模块注册（推荐）

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
import { defineHandler } from 'ubean/server';
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

### 迁移

Drizzle 的迁移由 `drizzle-kit` 管理：

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio"
  }
}
```

如果想在 ubean 启动时以编程方式执行迁移，可以把 `drizzle-kit generate` 产出的 SQL 交给 `migrateDatabase(db, statements)`。

## Prisma

### 安装

```bash
pnpm add @prisma/client
pnpm add -D prisma
```

### Schema 与客户端

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

### 通过虚拟模块接线

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
import { defineHandler } from 'ubean/server';
import prisma from '#prisma';

export const GET = defineHandler(async c => {
  const users = await prisma.user.findMany();
  return c.json(users);
});
```

## 使用内置数据库层

对于用 ORM 显得过重的简单场景，直接使用 `defineDatabase` + `useDatabase`：

```typescript
// app.ts (或某个模块的 setup)
import { defineDatabase, registerDb0Create } from 'ubean/server';
import { postgres } from 'db0/connectors/postgres';

// 注册一次 db0 工厂
registerDb0Create(createFn);

export const db = defineDatabase({
  connector: postgres({ url: process.env.DATABASE_URL! })
});
```

```typescript
// routes/api/users.ts
import { defineHandler, useDatabase } from 'ubean/server';

export const GET = defineHandler(async c => {
  const db = useDatabase();
  const { rows } = await db.sql<{ id: number; email: string }>`
    SELECT id, email FROM users ORDER BY id DESC LIMIT 50
  `;
  return c.json(rows);
});
```

## MongoDB（Mongoose）

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
import { defineHandler } from 'ubean/server';
import { User } from '@/db/models/User';

export const GET = defineHandler(async c => {
  const users = await User.find();
  return c.json(users);
});
```

## 最佳实践

1. **schema 稍复杂就优先用 ORM 而非裸 SQL** —— 类型安全带来的收益很快就显现出来。
2. **客户端只注册一次** —— 在 `setup()` 里创建实例，再通过 `addVirtualImports` 暴露；绝不要按请求实例化。
3. **使用迁移** —— Drizzle 与 Prisma 都自带迁移工具，用 npm scripts 串起来即可。
4. **凭据放进 `defineEnv()`**，用 `{ type: String, required: true }` 声明 —— 也绝不要把含真实密钥的 `.env` 文件提交到仓库。
5. **关闭时释放连接** —— 在 shutdown hook 中调用 `closeDatabases()`（内置数据库层），或 `await mongoose.disconnect()` / `await prisma.$disconnect()`。
