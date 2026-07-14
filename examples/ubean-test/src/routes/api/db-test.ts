import { defineHandler, defineDatabase, useDatabase } from 'ubean';

defineDatabase();

export const GET = defineHandler(async c => {
  const db = useDatabase();
  const action = c.req.query('action') || 'list';

  if (action === 'init') {
    await db.exec('CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY, name TEXT, created_at TEXT)');
    return c.json({ message: 'Table "items" created' });
  }

  if (action === 'insert') {
    const name = c.req.query('name') || `item-${Date.now()}`;
    await db.exec(`INSERT INTO items (name, created_at) VALUES ('${name}', '${new Date().toISOString()}')`);
    return c.json({ message: 'Item inserted', name });
  }

  if (action === 'clear') {
    await db.exec('DROP TABLE IF EXISTS items');
    return c.json({ message: 'Table dropped' });
  }

  const result = await db.sql`SELECT * FROM items ORDER BY id DESC LIMIT 10`;
  return c.json({ action: 'list', items: result.rows, count: result.rows.length });
});

export const POST = defineHandler(async c => {
  const db = useDatabase();
  const body = await c.req.json().catch(() => ({}));
  const name = body.name || `item-${Date.now()}`;

  await db.exec('CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY, name TEXT, created_at TEXT)');
  await db.exec(`INSERT INTO items (name, created_at) VALUES ('${name}', '${new Date().toISOString()}')`);
  const result = await db.sql`SELECT * FROM items ORDER BY id DESC LIMIT 10`;

  return c.json({ message: 'Item created', name, items: result.rows }, 201);
});
