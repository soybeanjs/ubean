import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  defineDatabase,
  useDatabase,
  closeDatabases,
  getDatabaseHooks,
  registerDb0Create,
  migrateDatabase,
  runMigrations,
  rawSql
} from 'ubean';
import type { Migration } from 'ubean';
import { getJson, postJson } from './helper';

describe('Database system', () => {
  beforeEach(async () => {
    await closeDatabases();
  });

  afterEach(async () => {
    await closeDatabases();
  });

  describe('defineDatabase() - built-in memory database', () => {
    it('creates an in-memory database by default', () => {
      const db = defineDatabase();
      expect(db).toBeDefined();
      expect(typeof db.sql).toBe('function');
      expect(typeof db.exec).toBe('function');
      expect(typeof db.close).toBe('function');
    });

    it('sql template tag executes queries', async () => {
      const db = defineDatabase();
      await db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
      await db.exec("INSERT INTO test (name) VALUES ('alice')");
      const result = await db.sql`SELECT * FROM test`;
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toHaveProperty('name', 'alice');
    });

    it('exec executes raw SQL', async () => {
      const db = defineDatabase();
      await db.exec('CREATE TABLE exec_test (id INTEGER PRIMARY KEY, value TEXT)');
      await db.exec("INSERT INTO exec_test (value) VALUES ('hello')");
      const result = await db.sql`SELECT * FROM exec_test`;
      expect(result.rows[0]).toHaveProperty('value', 'hello');
    });

    it('supports CREATE TABLE / INSERT / SELECT / DELETE / DROP', async () => {
      const db = defineDatabase();
      await db.exec('CREATE TABLE crud (id INTEGER PRIMARY KEY, name TEXT)');
      await db.exec("INSERT INTO crud (name) VALUES ('item1')");
      await db.exec("INSERT INTO crud (name) VALUES ('item2')");

      const all = await db.sql`SELECT * FROM crud`;
      expect(all.rows).toHaveLength(2);

      await db.exec("DELETE FROM crud WHERE name = 'item1'");
      const afterDelete = await db.sql`SELECT * FROM crud`;
      expect(afterDelete.rows).toHaveLength(1);

      await db.exec('DROP TABLE crud');
    });

    it('sql template tag with parameters', async () => {
      const db = defineDatabase();
      await db.exec('CREATE TABLE params (id INTEGER PRIMARY KEY, name TEXT)');
      await db.exec("INSERT INTO params (name) VALUES ('searchable')");

      const name = 'searchable';
      const result = await db.sql`SELECT * FROM params WHERE name = ${name}`;
      expect(result.rows).toHaveLength(1);
    });
  });

  describe('useDatabase()', () => {
    it('returns the default database', () => {
      defineDatabase();
      const db = useDatabase();
      expect(db).toBeDefined();
    });

    it('throws for unknown named database', () => {
      expect(() => useDatabase('nonexistent-db')).toThrow();
    });
  });

  describe('closeDatabases()', () => {
    it('closes all databases without error', async () => {
      defineDatabase();
      await closeDatabases();
      // After close, useDatabase should create a new one
      const db = useDatabase();
      expect(db).toBeDefined();
    });
  });

  describe('Database hooks', () => {
    it('getDatabaseHooks returns the hooks instance', () => {
      const hooks = getDatabaseHooks();
      expect(hooks).toBeDefined();
      expect(typeof hooks.callHook).toBe('function');
      expect(typeof hooks.hook).toBe('function');
    });

    it('db:connect hook fires on database creation', async () => {
      let connected = false;
      const hooks = getDatabaseHooks();
      hooks.hook('db:connect', () => {
        connected = true;
      });
      defineDatabase();
      await new Promise(r => setTimeout(r, 50));
      expect(connected).toBe(true);
    });

    it('db:query hook fires on SQL execution', async () => {
      let queryReceived = '';
      const hooks = getDatabaseHooks();
      hooks.hook('db:query', (query: string) => {
        queryReceived = query;
      });
      const db = defineDatabase();
      await db.exec('CREATE TABLE hook_test (id INTEGER)');
      expect(queryReceived).toContain('CREATE TABLE');
    });
  });

  describe('registerDb0Create() - db0 connector interface', () => {
    it('registers a custom database creator', () => {
      let called = false;
      registerDb0Create((connector) => {
        called = true;
        return {
          sql: async () => ({ rows: [] }),
          exec: async () => {},
          close: async () => {}
        };
      });
      // The function is registered on globalThis
      expect((globalThis as any).$db0Create).toBeDefined();
    });
  });

  describe('Migration system', () => {
    it('migrateDatabase executes migration SQL', async () => {
      const db = defineDatabase();
      await migrateDatabase(db, [
        'CREATE TABLE migration_test (id INTEGER PRIMARY KEY)',
        'INSERT INTO migration_test (id) VALUES (1)'
      ]);
      const result = await db.sql`SELECT * FROM migration_test`;
      expect(result.rows).toHaveLength(1);
    });

    it('runMigrations tracks applied migrations', async () => {
      const db = defineDatabase();
      const migrations: Migration[] = [
        { name: '001_initial', up: 'CREATE TABLE mig_001 (id INTEGER)' },
        { name: '002_add_data', up: 'INSERT INTO mig_001 (id) VALUES (42)' }
      ];

      const result = await runMigrations(db, migrations);
      expect(result.applied).toHaveLength(2);
      expect(result.applied).toContain('001_initial');
      expect(result.applied).toContain('002_add_data');
    });

    it('runMigrations skips already-applied migrations', async () => {
      const db = defineDatabase();
      const migrations: Migration[] = [
        { name: '001_first', up: 'CREATE TABLE mig_skip (id INTEGER)' }
      ];

      await runMigrations(db, migrations);
      const result = await runMigrations(db, migrations);
      expect(result.applied).toHaveLength(0);
    });
  });

  describe('rawSql()', () => {
    it('creates a raw SQL value for use in templates', () => {
      const raw = rawSql('RAW_TABLE_NAME');
      expect(raw).toBeDefined();
      expect(typeof raw).toBe('object');
    });
  });

  describe('HTTP integration - /api/db-test', () => {
    it('init creates table', async () => {
      const res = await getJson('/api/db-test?action=init');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('message');
    });

    it('insert adds data', async () => {
      const res = await getJson('/api/db-test?action=insert&name=test-item');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('name', 'test-item');
    });

    it('list returns items', async () => {
      // Ensure table exists and has data
      await getJson('/api/db-test?action=init');
      await getJson('/api/db-test?action=insert&name=list-item');
      const res = await getJson('/api/db-test?action=list');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('items');
      expect(res.data).toHaveProperty('count');
    });

    it('POST creates and returns items', async () => {
      const res = await postJson('/api/db-test', { name: 'post-item' });
      expect(res.status).toBe(201);
      expect(res.data).toHaveProperty('name', 'post-item');
    });

    it('clear drops table', async () => {
      const res = await getJson('/api/db-test?action=clear');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('message');
    });

    it('sql template tag works via API', async () => {
      await getJson('/api/db-test?action=init');
      const res = await getJson('/api/db-test?action=list');
      expect(res.status).toBe(200);
      // The list action uses db.sql`SELECT * FROM items`
      expect(res.data).toHaveProperty('items');
    });
  });
});
