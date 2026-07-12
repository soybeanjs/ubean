# Database Operations

## useDatabase()

Access database connection.

```typescript
import { useDatabase } from '@ubean/core';

const db = useDatabase();
```

### Query Builder

```typescript
// Select
const users = await db.select().from('users');

// Select with conditions
const activeUsers = await db
  .select()
  .from('users')
  .where('active', true);

// Select with joins
const postsWithAuthor = await db
  .select('posts.*', 'users.name as author')
  .from('posts')
  .join('users', 'posts.author_id', 'users.id');

// Select with limit/offset
const paginated = await db
  .select()
  .from('posts')
  .limit(10)
  .offset(20);

// Count
const count = await db.count().from('users');

// Sum
const total = await db.sum('amount').from('orders');
```

### Insert

```typescript
// Insert single
const result = await db
  .insert('users')
  .values({ name: 'John', email: 'john@example.com' });

// Insert multiple
const results = await db
  .insert('users')
  .values([
    { name: 'John', email: 'john@example.com' },
    { name: 'Jane', email: 'jane@example.com' }
  ]);
```

### Update

```typescript
const result = await db
  .update('users')
  .set({ name: 'John Doe' })
  .where('id', 1);
```

### Delete

```typescript
const result = await db
  .delete('users')
  .where('id', 1);
```

### Transactions

```typescript
const result = await db.transaction(async (tx) => {
  const user = await tx
    .insert('users')
    .values({ name: 'John' })
    .returning('id');
  
  await tx.insert('profiles').values({
    user_id: user[0].id,
    bio: 'Hello'
  });
  
  return user[0];
});
```

## defineDatabase()

Define database configuration.

```typescript
import { defineDatabase } from '@ubean/core';

export default defineDatabase({
  connection: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  },
  migrations: {
    path: './src/migrations'
  },
  seeds: {
    path: './src/seeds'
  }
});
```

### Connection Options

| Option | Type | Description |
|--------|------|-------------|
| host | string | Database host |
| port | number | Database port |
| user | string | Database user |
| password | string | Database password |
| database | string | Database name |
| ssl | boolean | Enable SSL |

### Migration Options

| Option | Type | Description |
|--------|------|-------------|
| path | string | Migrations directory |
| table | string | Migration table name |

## Migration System

### Creating Migrations

```bash
ubean db migrate:create create_users_table
```

### Migration File

```typescript
import { defineMigration } from '@ubean/core';

export default defineMigration({
  up: async (db) => {
    await db.schema.createTable('users', (table) => {
      table.increments('id').primary();
      table.string('name').notNullable();
      table.string('email').unique().notNullable();
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('updated_at').defaultTo(db.fn.now());
    });
  },
  
  down: async (db) => {
    await db.schema.dropTable('users');
  }
});
```

### Running Migrations

```bash
# Run all pending migrations
ubean db migrate

# Rollback last migration
ubean db migrate:rollback

# Rollback all migrations
ubean db migrate:reset

# Refresh database (drop, migrate, seed)
ubean db migrate:refresh
```

## Seed System

### Creating Seeds

```bash
ubean db seed:create users
```

### Seed File

```typescript
import { defineSeed } from '@ubean/core';

export default defineSeed(async (db) => {
  await db.insert('users').values([
    { name: 'Admin', email: 'admin@example.com' },
    { name: 'User', email: 'user@example.com' }
  ]);
});
```

### Running Seeds

```bash
# Run all seeds
ubean db seed

# Run specific seed
ubean db seed users
```

## ORM Integration

### Drizzle ORM

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client);

// Usage
const users = await db.select().from(usersTable);
```

### Prisma

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Usage
const users = await prisma.user.findMany();
```

## Connection Pooling

### Configuration

```typescript
export default defineDatabase({
  connection: {
    // ...
  },
  pool: {
    min: 2,
    max: 10,
    idleTimeoutMillis: 30000
  }
});
```

### Pool Options

| Option | Type | Description |
|--------|------|-------------|
| min | number | Minimum connections |
| max | number | Maximum connections |
| idleTimeoutMillis | number | Idle timeout |
| connectionTimeoutMillis | number | Connection timeout |

## Query Logging

### Enable Logging

```typescript
export default defineDatabase({
  connection: {
    // ...
  },
  logging: true
});
```

### Custom Logger

```typescript
export default defineDatabase({
  connection: {
    // ...
  },
  logging: (query, params) => {
    console.log(`Query: ${query}`);
    console.log(`Params: ${params}`);
  }
});
```

## Best Practices

1. **Use transactions**: Wrap multiple operations in transactions
2. **Parameterized queries**: Always use parameterized queries
3. **Connection pooling**: Configure pool for production
4. **Migrations**: Use migrations for schema changes
5. **Seeds**: Use seeds for test data
6. **Logging**: Enable logging for debugging
7. **Close connections**: Always close connections when done
