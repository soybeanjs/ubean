import { describe, it, expect, afterEach } from 'vitest';
import {
  defineDatabase,
  useDatabase,
  closeDatabases,
  runMigrations,
  migrateDatabase,
  getDatabaseHooks,
  sqlRaw
} from '../src/runtime/database';

describe('In-Memory Database', () => {
  afterEach(async () => {
    await closeDatabases();
  });

  it('creates table and inserts data via exec', async () => {
    const db = defineDatabase();
    await db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, age INTEGER)`);
    await db.exec(`INSERT INTO users (id, name, age) VALUES ('1', 'Alice', 30)`);

    const { rows } = await db.sql`SELECT * FROM users`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ id: '1', name: 'Alice', age: 30 });
  });

  it('inserts data via tagged template with parameters', async () => {
    const db = defineDatabase();
    await db.exec(`CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT, price REAL)`);
    await db.sql`INSERT INTO products (id, name, price) VALUES (${'p1'}, ${'Widget'}, ${9.99})`;

    const { rows } = await db.sql`SELECT * FROM products WHERE id = ${'p1'}`;
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Widget');
    expect(rows[0].price).toBe(9.99);
  });

  it('handles NULL values', async () => {
    const db = defineDatabase();
    await db.exec(`CREATE TABLE items (id TEXT PRIMARY KEY, description TEXT)`);
    await db.sql`INSERT INTO items (id, description) VALUES (${'1'}, ${null})`;

    const { rows } = await db.sql`SELECT * FROM items`;
    expect(rows[0].description).toBeNull();
  });

  it('handles boolean values', async () => {
    const db = defineDatabase();
    await db.exec(`CREATE TABLE flags (id TEXT PRIMARY KEY, active INTEGER)`);
    await db.sql`INSERT INTO flags (id, active) VALUES (${'1'}, ${true})`;
    await db.sql`INSERT INTO flags (id, active) VALUES (${'2'}, ${false})`;

    const { rows } = await db.sql`SELECT * FROM flags ORDER BY id`;
    expect(rows[0].active).toBe(1);
    expect(rows[1].active).toBe(0);
  });

  it('filters with WHERE clause', async () => {
    const db = defineDatabase();
    await db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, city TEXT)`);
    await db.exec(`INSERT INTO users (id, name, city) VALUES ('1', 'Alice', 'NYC')`);
    await db.exec(`INSERT INTO users (id, name, city) VALUES ('2', 'Bob', 'LA')`);
    await db.exec(`INSERT INTO users (id, name, city) VALUES ('3', 'Charlie', 'NYC')`);

    const { rows } = await db.sql`SELECT * FROM users WHERE city = ${'NYC'}`;
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.name).sort()).toEqual(['Alice', 'Charlie']);
  });

  it('deletes all rows from table', async () => {
    const db = defineDatabase();
    await db.exec(`CREATE TABLE temp (id TEXT PRIMARY KEY)`);
    await db.exec(`INSERT INTO temp (id) VALUES ('1')`);
    await db.exec(`INSERT INTO temp (id) VALUES ('2')`);

    let { rows } = await db.sql`SELECT * FROM temp`;
    expect(rows).toHaveLength(2);

    await db.exec(`DELETE FROM temp`);

    ({ rows } = await db.sql`SELECT * FROM temp`);
    expect(rows).toHaveLength(0);
  });

  it('drops table', async () => {
    const db = defineDatabase();
    await db.exec(`CREATE TABLE obsolete (id TEXT PRIMARY KEY)`);
    await db.exec(`INSERT INTO obsolete (id) VALUES ('1')`);

    await db.exec(`DROP TABLE obsolete`);

    const { rows } = await db.sql`SELECT * FROM obsolete`;
    expect(rows).toHaveLength(0);
  });

  it('executes multiple statements separated by semicolon', async () => {
    const db = defineDatabase();
    await db.exec(`
      CREATE TABLE a (id TEXT PRIMARY KEY);
      CREATE TABLE b (id TEXT PRIMARY KEY);
      INSERT INTO a (id) VALUES ('a1');
      INSERT INTO b (id) VALUES ('b1');
    `);

    const { rows: rowsA } = await db.sql`SELECT * FROM a`;
    const { rows: rowsB } = await db.sql`SELECT * FROM b`;
    expect(rowsA).toHaveLength(1);
    expect(rowsB).toHaveLength(1);
  });

  it('handles strings with single quotes via escaped quotes', async () => {
    const db = defineDatabase();
    await db.exec(`CREATE TABLE quotes (id TEXT PRIMARY KEY, text TEXT)`);
    await db.sql`INSERT INTO quotes (id, text) VALUES (${'1'}, ${"it's a test"})`;

    const { rows } = await db.sql`SELECT * FROM quotes`;
    expect(rows[0].text).toBe("it's a test");
  });

  it('supports CREATE TABLE IF NOT EXISTS', async () => {
    const db = defineDatabase();
    await db.exec(`CREATE TABLE IF NOT EXISTS exists_test (id TEXT PRIMARY KEY)`);
    await db.exec(`CREATE TABLE IF NOT EXISTS exists_test (id TEXT PRIMARY KEY)`);
    await db.sql`INSERT INTO exists_test (id) VALUES (${'1'})`;

    const { rows } = await db.sql`SELECT * FROM exists_test`;
    expect(rows).toHaveLength(1);
  });

  it('supports DROP TABLE IF EXISTS', async () => {
    const db = defineDatabase();
    await db.exec(`CREATE TABLE dropme (id TEXT PRIMARY KEY)`);
    await db.exec(`DROP TABLE IF EXISTS dropme`);
    await db.exec(`DROP TABLE IF EXISTS dropme`);
  });
});

describe('Database Registry', () => {
  afterEach(async () => {
    await closeDatabases();
  });

  it('useDatabase returns default database, auto-creating if needed', () => {
    const db = useDatabase();
    expect(db).toBeDefined();
    expect(db.sql).toBeTypeOf('function');
    expect(db.exec).toBeTypeOf('function');
  });

  it('defineDatabase sets default database', () => {
    const db = defineDatabase();
    expect(useDatabase()).toBe(db);
  });

  it('useDatabase throws error for named database that does not exist', () => {
    expect(() => useDatabase('nonexistent')).toThrow(/not found/);
  });

  it('closeDatabases clears all registered databases', async () => {
    defineDatabase();
    await closeDatabases();
    const db2 = useDatabase();
    expect(db2).toBeDefined();
  });
});

describe('Migrations', () => {
  afterEach(async () => {
    await closeDatabases();
  });

  it('runs migrations and tracks applied ones', async () => {
    const db = defineDatabase();
    const migrations = [
      { name: '001_create_users', up: `CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT)` },
      { name: '002_create_posts', up: `CREATE TABLE posts (id TEXT PRIMARY KEY, title TEXT)` }
    ];

    const result = await runMigrations(db, migrations);
    expect(result.applied).toEqual(['001_create_users', '002_create_posts']);
  });

  it('does not re-apply already applied migrations', async () => {
    const db = defineDatabase();
    const migrations = [{ name: '001_initial', up: `CREATE TABLE mig_test (id TEXT PRIMARY KEY)` }];

    await runMigrations(db, migrations);
    const result = await runMigrations(db, migrations);
    expect(result.applied).toHaveLength(0);
  });

  it('apply new migrations added later', async () => {
    const db = defineDatabase();
    await runMigrations(db, [{ name: '001', up: `CREATE TABLE mig_add (id TEXT PRIMARY KEY)` }]);

    const result = await runMigrations(db, [
      { name: '001', up: `CREATE TABLE mig_add (id TEXT PRIMARY KEY)` },
      { name: '002', up: `INSERT INTO mig_add (id) VALUES ('new')` }
    ]);

    expect(result.applied).toEqual(['002']);
    const { rows } = await db.sql`SELECT * FROM mig_add`;
    expect(rows).toHaveLength(1);
  });

  it('uses custom migrations table name', async () => {
    const db = defineDatabase();
    await runMigrations(db, [{ name: '001_custom', up: `CREATE TABLE custom_t (id TEXT PRIMARY KEY)` }], {
      table: '_schema_migrations'
    });

    const { rows } = await db.sql<{ name: string }>`SELECT name FROM ${sqlRaw('_schema_migrations')}`;
    expect(rows.map(r => r.name)).toContain('001_custom');
  });

  it('migrateDatabase runs raw SQL strings in order', async () => {
    const db = defineDatabase();
    await migrateDatabase(db, [
      `CREATE TABLE raw_mig (id TEXT PRIMARY KEY)`,
      `INSERT INTO raw_mig (id) VALUES ('1')`,
      `INSERT INTO raw_mig (id) VALUES ('2')`
    ]);

    const { rows } = await db.sql`SELECT * FROM raw_mig`;
    expect(rows).toHaveLength(2);
  });
});

describe('Database Hooks', () => {
  afterEach(async () => {
    await closeDatabases();
  });

  it('calls db:connect hook on defineDatabase', async () => {
    const hooks = getDatabaseHooks();
    let connected = false;
    hooks.hook('db:connect', () => {
      connected = true;
    });

    defineDatabase();
    await new Promise(r => setTimeout(r, 10));
    expect(connected).toBe(true);
  });

  it('calls db:query hook on sql execution', async () => {
    const hooks = getDatabaseHooks();
    const queries: string[] = [];
    hooks.hook('db:query', q => {
      queries.push(q);
    });

    const db = defineDatabase();
    await db.exec(`CREATE TABLE hook_test (id TEXT PRIMARY KEY)`);
    await db.sql`SELECT 1`;

    expect(queries.length).toBeGreaterThanOrEqual(2);
  });

  it('calls db:disconnect hook on close', async () => {
    const hooks = getDatabaseHooks();
    let disconnected = false;
    hooks.hook('db:disconnect', () => {
      disconnected = true;
    });

    const db = defineDatabase();
    await db.close();
    expect(disconnected).toBe(true);
  });
});

describe('sqlRaw helper', () => {
  it('creates a raw SQL identifier that can be inserted in tagged template', async () => {
    const db = defineDatabase();
    await db.exec('CREATE TABLE test_raw (id TEXT PRIMARY KEY, val TEXT)');
    await db.sql`INSERT INTO test_raw (id, val) VALUES (${'1'}, ${'hello'})`;

    const tableName = sqlRaw('test_raw');
    const { rows } = await db.sql`SELECT * FROM ${tableName}`;
    expect(rows).toHaveLength(1);
    expect(rows[0].val).toBe('hello');
  });

  it('inserts raw SQL without escaping quotes', async () => {
    const db = defineDatabase();
    await db.exec('CREATE TABLE raw_test (id TEXT PRIMARY KEY)');
    const rawExpr = sqlRaw("'raw_value'");
    await db.sql`INSERT INTO raw_test (id) VALUES (${rawExpr})`;
    const { rows } = await db.sql`SELECT * FROM raw_test`;
    expect(rows[0].id).toBe('raw_value');
  });
});
