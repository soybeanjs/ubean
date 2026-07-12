import { createHooks } from 'hookable';

export interface DatabaseHooks {
  'db:connect': (db: Database) => void | Promise<void>;
  'db:disconnect': (db: Database) => void | Promise<void>;
  'db:query': (query: string, params?: unknown[]) => void | Promise<void>;
  'db:error': (error: Error, query?: string) => void | Promise<void>;
}

export interface Database {
  sql: <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<{ rows: T[] }>;
  exec: (query: string) => Promise<void>;
  close: () => Promise<void>;
}

export interface DatabaseConnector {
  (options?: Record<string, unknown>): DatabaseConnectorInstance;
}

export interface DatabaseConnectorInstance {
  dialect?: string;
  [key: string]: unknown;
}

export interface DrizzleConfig {
  schema?: Record<string, unknown>;
  logger?: boolean | { logQuery?: (query: string, params: unknown[]) => void };
  casing?: 'camelCase' | 'snake_case';
}

export interface DatabaseOptions {
  connector?: DatabaseConnectorInstance;
  connectors?: Record<string, DatabaseConnectorInstance>;
  default?: string;
}

export interface Migration {
  name: string;
  up: string;
  down?: string;
}

const dbRegistry = new Map<string, Database>();
const dbHooks = createHooks<DatabaseHooks>();
let defaultDatabase: Database | null = null;

const RAW_SQL = Symbol('rawSql');

interface RawSqlValue {
  [RAW_SQL]: true;
  value: string;
}

export function rawSql(str: string): RawSqlValue {
  return { [RAW_SQL]: true, value: str };
}

type RawSqlFn = <T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<{ rows: T[] }>;
type RawExecFn = (query: string) => Promise<void>;
type RawCloseFn = () => Promise<void>;

interface InMemoryTable {
  name: string;
  columns: Map<string, { type: string; primaryKey?: boolean; notNull?: boolean }>;
  rows: Record<string, unknown>[];
}

function createInMemoryDatabase(): { sql: RawSqlFn; exec: RawExecFn; close: RawCloseFn } {
  const tables = new Map<string, InMemoryTable>();

  function getTable(name: string): InMemoryTable | undefined {
    return tables.get(name.toLowerCase());
  }

  function parseSqlValue(val: string): unknown {
    const trimmed = val.trim();
    const upper = trimmed.toUpperCase();
    if (upper === 'NULL') return null;
    if (upper === 'TRUE') return true;
    if (upper === 'FALSE') return false;
    if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10);
    if (/^-?\d+\.\d+$/.test(trimmed)) return parseFloat(trimmed);
    if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
      const quote = trimmed[0];
      const inner = trimmed.slice(1, -1);
      return inner.replace(new RegExp(quote + quote, 'g'), quote);
    }
    return trimmed;
  }

  function splitByCommaRespectingStrings(str: string): string[] {
    const parts: string[] = [];
    let current = '';
    let inString = false;
    let stringChar = '';
    let depth = 0;

    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      const next = str[i + 1];

      if (!inString && (ch === "'" || ch === '"')) {
        inString = true;
        stringChar = ch;
        current += ch;
      } else if (inString && ch === stringChar) {
        if (next === stringChar) {
          current += ch + ch;
          i++;
        } else {
          inString = false;
          current += ch;
        }
      } else if (!inString && ch === '(') {
        depth++;
        current += ch;
      } else if (!inString && ch === ')') {
        depth--;
        current += ch;
      } else if (!inString && depth === 0 && ch === ',') {
        parts.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
  }

  function parseCreateTable(query: string): void {
    const ifNotExists = /IF\s+NOT\s+EXISTS/i.test(query);
    const match = query.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)["`]?\s*\(([\s\S]+)\)\s*;?\s*$/i);
    if (!match) return;

    const [, tableName, colsStr] = match;
    const lowerName = tableName.toLowerCase();

    if (ifNotExists && tables.has(lowerName)) return;

    const table: InMemoryTable = { name: tableName, columns: new Map(), rows: [] };
    const colDefs = splitByCommaRespectingStrings(colsStr);

    for (const colDef of colDefs) {
      const upperDef = colDef.toUpperCase().trim();
      if (
        upperDef.startsWith('PRIMARY KEY') ||
        upperDef.startsWith('CONSTRAINT') ||
        upperDef.startsWith('FOREIGN') ||
        upperDef.startsWith('UNIQUE') ||
        upperDef.startsWith('INDEX')
      ) {
        continue;
      }

      const match2 = colDef.match(/^["`]?(\w+)["`]?\s+(\w+)?(.*)$/);
      if (!match2) continue;

      const [, colNameRaw, colTypeRaw = 'TEXT', rest] = match2;
      const colName = colNameRaw.replace(/["`]/g, '');
      const colType = (colTypeRaw || 'TEXT').toUpperCase();
      const isPK = /PRIMARY\s+KEY/i.test(rest);
      const notNull = /NOT\s+NULL/i.test(rest);
      table.columns.set(colName, { type: colType, primaryKey: isPK, notNull });
    }

    tables.set(lowerName, table);
  }

  function parseInsert(query: string): { table: string; columns: string[]; values: unknown[] } | null {
    const insertMatch = query.match(
      /INSERT\s+INTO\s+["`]?(\w+)["`]?\s*(?:\(([^)]+)\))?\s*VALUES\s*\(([\s\S]+)\)\s*;?\s*$/i
    );
    if (!insertMatch) return null;

    const [, tableName, colsStr, valuesStr] = insertMatch;
    const table = getTable(tableName);
    if (!table) return null;

    const columns = colsStr
      ? splitByCommaRespectingStrings(colsStr).map(c => c.trim().replace(/["`]/g, ''))
      : Array.from(table.columns.keys());

    const valueStrs = splitByCommaRespectingStrings(valuesStr);
    const values = valueStrs.map(s => parseSqlValue(s));

    return { table: tableName.toLowerCase(), columns, values };
  }

  function parseSelect(query: string): { table: string; where?: { col: string; val: unknown } } | null {
    const simpleMatch = query.match(/SELECT\s+([\s\S]+?)\s+FROM\s+["`]?(\w+)["`]?/i);
    if (!simpleMatch) return null;

    const tableName = simpleMatch[2];
    let where: { col: string; val: unknown } | undefined;

    const whereIdx = query.toUpperCase().indexOf('WHERE');
    if (whereIdx !== -1) {
      let wherePart = query.slice(whereIdx + 5);
      const orderIdx = wherePart.toUpperCase().indexOf('ORDER');
      const limitIdx = wherePart.toUpperCase().indexOf('LIMIT');
      let endIdx = wherePart.length;
      if (orderIdx !== -1) endIdx = Math.min(endIdx, orderIdx);
      if (limitIdx !== -1) endIdx = Math.min(endIdx, limitIdx);
      wherePart = wherePart.slice(0, endIdx).trim().replace(/;$/, '');

      const eqIdx = wherePart.indexOf('=');
      if (eqIdx !== -1) {
        const col = wherePart.slice(0, eqIdx).trim().replace(/["`]/g, '');
        const valStr = wherePart.slice(eqIdx + 1).trim();
        where = { col, val: parseSqlValue(valStr) };
      }
    }

    return { table: tableName.toLowerCase(), where };
  }

  function escapeValue(val: unknown): string {
    if (val !== null && typeof val === 'object' && RAW_SQL in (val as object)) {
      return (val as RawSqlValue).value;
    }
    if (val === null || val === undefined) {
      return 'NULL';
    }
    if (typeof val === 'number') {
      return String(val);
    }
    if (typeof val === 'boolean') {
      return val ? '1' : '0';
    }
    if (val instanceof Date) {
      return `'${val.toISOString()}'`;
    }
    return `'${String(val).replace(/'/g, "''")}'`;
  }

  function buildQueryFromTemplate(strings: TemplateStringsArray, values: unknown[]): string {
    let query = '';
    for (let i = 0; i < strings.length; i++) {
      query += strings[i];
      if (i < values.length) {
        query += escapeValue(values[i]);
      }
    }
    return query;
  }

  function executeRaw(query: string): Record<string, unknown>[] {
    const upperQuery = query.toUpperCase().trim();

    if (upperQuery.startsWith('CREATE TABLE')) {
      parseCreateTable(query);
      return [];
    }

    if (upperQuery.startsWith('INSERT INTO')) {
      const parsed = parseInsert(query);
      if (parsed) {
        const table = getTable(parsed.table);
        if (table) {
          const row: Record<string, unknown> = {};
          for (let i = 0; i < parsed.columns.length; i++) {
            row[parsed.columns[i]] = parsed.values[i] ?? null;
          }
          table.rows.push(row);
        }
      }
      return [];
    }

    if (upperQuery.startsWith('SELECT')) {
      const parsed = parseSelect(query);
      if (parsed) {
        const table = getTable(parsed.table);
        if (!table) return [];

        let rows = [...table.rows];
        if (parsed.where) {
          rows = rows.filter(row => row[parsed.where!.col] == parsed.where!.val);
        }
        return rows;
      }
      return [];
    }

    if (upperQuery.startsWith('DELETE FROM')) {
      const match = query.match(/DELETE\s+FROM\s+["`]?(\w+)["`]?/i);
      if (match) {
        const table = getTable(match[1]);
        if (table) table.rows = [];
      }
      return [];
    }

    if (upperQuery.startsWith('DROP TABLE')) {
      const match = query.match(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?["`]?(\w+)["`]?/i);
      if (match) {
        tables.delete(match[1].toLowerCase());
      }
      return [];
    }

    return [];
  }

  return {
    async sql<T = Record<string, unknown>>(
      strings: TemplateStringsArray,
      ...values: unknown[]
    ): Promise<{ rows: T[] }> {
      const query = buildQueryFromTemplate(strings, values);
      try {
        await dbHooks.callHook('db:query', query, values);
        const rows = executeRaw(query);
        return { rows: rows as T[] };
      } catch (err) {
        await dbHooks.callHook('db:error', err instanceof Error ? err : new Error(String(err)), query);
        throw err;
      }
    },

    async exec(query: string): Promise<void> {
      const statements = splitSqlStatements(query);
      for (const stmt of statements) {
        const trimmed = stmt.trim();
        if (!trimmed) continue;
        try {
          await dbHooks.callHook('db:query', trimmed);
          executeRaw(trimmed);
        } catch (err) {
          await dbHooks.callHook('db:error', err instanceof Error ? err : new Error(String(err)), trimmed);
          throw err;
        }
      }
    },

    async close(): Promise<void> {
      tables.clear();
    }
  };
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (!inString && (ch === "'" || ch === '"')) {
      inString = true;
      stringChar = ch;
      current += ch;
    } else if (inString && ch === stringChar) {
      if (sql[i + 1] === stringChar) {
        current += ch + ch;
        i++;
      } else {
        inString = false;
        current += ch;
      }
    } else if (!inString && ch === ';') {
      statements.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) {
    statements.push(current);
  }
  return statements;
}

function wrapDatabase(raw: { sql: RawSqlFn; exec: RawExecFn; close: RawCloseFn }, name?: string): Database {
  const db: Database = {
    sql: raw.sql,
    exec: raw.exec,

    async close(): Promise<void> {
      await raw.close();
      if (name) dbRegistry.delete(name);
      if (defaultDatabase === db) defaultDatabase = null;
      await dbHooks.callHook('db:disconnect', db);
    }
  };

  return db;
}

export function defineDatabase(options: DatabaseOptions = {}): Database {
  if (!options.connector && !options.connectors) {
    const mem = createInMemoryDatabase();
    const db = wrapDatabase(mem);
    if (!defaultDatabase) defaultDatabase = db;
    dbRegistry.set('default', db);
    void dbHooks.callHook('db:connect', db);
    return db;
  }

  const createFn = (globalThis as any).$db0Create as
    | ((connector: DatabaseConnectorInstance) => { sql: RawSqlFn; exec: RawExecFn; close: RawCloseFn })
    | undefined;

  let raw: { sql: RawSqlFn; exec: RawExecFn; close: RawCloseFn };

  if (options.connector) {
    if (createFn) {
      try {
        raw = createFn(options.connector);
      } catch {
        raw = createInMemoryDatabase();
      }
    } else {
      raw = createInMemoryDatabase();
    }
  } else if (options.connectors) {
    const defaultName = options.default || Object.keys(options.connectors)[0];
    const connector = options.connectors[defaultName];
    if (connector && createFn) {
      try {
        raw = createFn(connector);
      } catch {
        raw = createInMemoryDatabase();
      }
    } else {
      raw = createInMemoryDatabase();
    }
  } else {
    raw = createInMemoryDatabase();
  }

  const dbName = options.default || 'default';
  const db = wrapDatabase(raw!, dbName);
  dbRegistry.set(dbName, db);
  if (!defaultDatabase) defaultDatabase = db;
  void dbHooks.callHook('db:connect', db);
  return db;
}

export function useDatabase(name?: string): Database {
  if (name) {
    const db = dbRegistry.get(name);
    if (!db) {
      throw new Error(`Database '${name}' not found. Call defineDatabase() first.`);
    }
    return db;
  }
  if (!defaultDatabase) {
    defaultDatabase = defineDatabase();
  }
  return defaultDatabase;
}

export async function closeDatabases(): Promise<void> {
  const dbs = Array.from(dbRegistry.values());
  dbRegistry.clear();
  defaultDatabase = null;
  for (const db of dbs) {
    await db.close();
  }
}

export function getDatabaseHooks() {
  return dbHooks;
}

export function registerDb0Create(
  fn: (connector: DatabaseConnectorInstance) => { sql: RawSqlFn; exec: RawExecFn; close: RawCloseFn }
): void {
  (globalThis as any).$db0Create = fn;
}

export async function migrateDatabase(db: Database, migrations: string[]): Promise<void> {
  for (const migration of migrations) {
    await db.exec(migration);
  }
}

export async function runMigrations(
  db: Database,
  migrations: Migration[],
  options: { table?: string; log?: boolean } = {}
): Promise<{ applied: string[] }> {
  const tableName = options.table || '_migrations';
  const applied: string[] = [];

  await db.exec(`CREATE TABLE IF NOT EXISTS ${tableName} (name TEXT PRIMARY KEY, applied_at INTEGER)`);

  const { rows } = await db.sql<{ name: string }>`SELECT name FROM ${rawSql(tableName)}`;
  const appliedNames = new Set(rows.map(r => r.name));

  for (const migration of migrations) {
    if (appliedNames.has(migration.name)) continue;

    await db.exec(migration.up);
    await db.sql`INSERT INTO ${rawSql(tableName)} (name, applied_at) VALUES (${migration.name}, ${Date.now()})`;
    applied.push(migration.name);

    if (options.log) {
      console.log(`[db] Applied migration: ${migration.name}`);
    }
  }

  return { applied };
}

export { rawSql as sqlRaw };
export { rawSql as raw };
