---
title: 数据库
description: "数据库操作：defineDatabase、useDatabase 与内存回退实现。"
---

# 数据库操作

ubean 在 `db0` 连接器抽象之上提供了一套轻量数据库层，并带有一个在未注册连接器时启用的内存回退实现。所有数据库 API 在服务端代码中均自动导入。

## defineDatabase()

创建或注册数据库实例。

```typescript
import { defineDatabase } from 'ubean/server';

// 默认内存数据库（无可用连接器时使用）
const db = defineDatabase();

// 通过 db0 连接器实例注册具名数据库
import { defineDatabase, registerDb0Create } from 'ubean/server';
import { sqlite } from 'db0/connectors/better-sqlite3';

// 注册 db0 工厂一次即可（通常放在 app.ts / 模块 setup 中）
registerDb0Create(createFn);

const sqliteDb = defineDatabase({
  connector: sqlite({ path: './data/app.sqlite' })
});

// 多个具名连接器
const multi = defineDatabase({
  default: 'primary',
  connectors: {
    primary: postgresConnector,
    replica: postgresReplicaConnector
  }
});
```

### DatabaseOptions

| 选项      | 类型                              | 说明                                           |
| ----------- | --------------------------------- | ----------------------------------------------------- |
| connector   | DatabaseConnectorInstance         | 单个连接器实例（成为默认连接器）    |
| connectors  | Record<string, DatabaseConnectorInstance> | 以别名为键的具名连接器              |
| default     | string                            | 默认连接器名（需配合 `connectors`） |

若 `connector` 与 `connectors` 都未提供，则使用内存 SQL 实现，使同一份代码在测试与 edge 运行时无需外部驱动即可工作。

## useDatabase()

获取已注册的数据库。首次无参调用会惰性创建默认的内存数据库。

```typescript
import { useDatabase } from 'ubean/server';

const db = useDatabase();          // 默认数据库
const replica = useDatabase('replica'); // 具名数据库（不存在则抛错）
```

### Database 接口

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

`sql` 是返回 `{ rows }` 的标签模板。参数会自动绑定——绝不要直接拼接用户输入。

```typescript
// 参数化查询
const { rows } = await db.sql<{ id: number; email: string }>`
  SELECT id, email FROM users WHERE id = ${userId}
`;
```

若需要原始 SQL 片段（例如无法绑定的表名/列名），使用 `rawSql`（别名为 `sqlRaw` 与 `raw`）。

```typescript
import { rawSql } from 'ubean/server';

const table = rawSql('users');
const { rows } = await db.sql`SELECT name FROM ${table}`;
```

## 迁移

ubean 提供两个迁移辅助函数，都不需要专用 CLI——迁移从你的应用代码或脚本中执行。

### migrateDatabase(db, statements)

按顺序执行一组原始 SQL 语句。

```typescript
import { migrateDatabase, useDatabase } from 'ubean/server';

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

在 `_migrations` 表中记录已应用的迁移，只执行尚未应用的。

```typescript
import { runMigrations, useDatabase } from 'ubean/server';
import { type Migration } from 'ubean/server';

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

### Migration 类型

```typescript
export interface Migration {
  name: string;
  up: string;
  down?: string;
}
```

ubean **不**提供 `defineMigration()` 或 `defineSeed()` API。若需要结构化的迁移执行器，请自行实现一个加载器：扫描 `migrations/` 目录并把结果传给 `runMigrations`。

## 钩子

数据库生命周期钩子通过 `getDatabaseHooks()`（一个 `hookable` 实例）暴露。

```typescript
import { getDatabaseHooks } from 'ubean/server';

const hooks = getDatabaseHooks();

hooks.hook('db:connect', db => console.log('connected', db));
hooks.hook('db:disconnect', db => console.log('disconnecting'));
hooks.hook('db:query', (query, params) => console.log(query, params));
hooks.hook('db:error', (err, query) => console.error(err, query));
```

| 钩子           | 载荷                              |
| -------------- | ------------------------------------ |
| `db:connect`   | `(db: Database)`                     |
| `db:disconnect` | `(db: Database)`                     |
| `db:query`     | `(query: string, params?: unknown[])` |
| `db:error`     | `(error: Error, query?: string)`     |

## 清理

```typescript
import { closeDatabases } from 'ubean/server';

await closeDatabases(); // 关闭所有已注册的数据库并清空注册表
```

请在 `onAppCreated`（仅服务端）、`shutdown` 钩子或平台生命周期处理器中调用 `closeDatabases()`。

## 与 ORM 层配合使用

ubean 的数据库接口刻意保持底层。若需要查询构建器，请自带 ORM，并通过虚拟模块接线，让服务端代码导入时不会在每个请求上重建客户端。

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
import { defineHandler } from 'ubean/server';
import db, { users } from '#db';

export const GET = defineHandler(async c => {
  const rows = await db.select().from(users).limit(50);
  return c.json(rows);
});
```

## 最佳实践

1. **始终参数化** —— 使用 `db.sql` 标签模板，绝不要用字符串拼接用户输入。
2. **注册一次，处处复用** —— 在应用启动阶段调用 `defineDatabase()`，在处理器中使用 `useDatabase()`。
3. **关闭时释放** —— 调用 `closeDatabases()` 干净地释放连接池。
4. **使用迁移** —— 修改表结构时优先用 `runMigrations`，而不是临时 `exec` 调用。
5. **自带 ORM** —— 需要更丰富的查询 API 时，Drizzle、Prisma 或 Mongoose 都可经虚拟模块接入。
