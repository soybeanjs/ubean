import { defineHandler, createKV } from 'ubean';

const kv = createKV({ prefix: 'test-kv' });

export const GET = defineHandler(async c => {
  const action = c.req.query('action') || 'get';
  const key = c.req.query('key') || 'default-key';

  if (action === 'set') {
    const value = c.req.query('value') || `value-${Date.now()}`;
    await kv.set(key, value, 60);
    return c.json({ action: 'set', key, value, ttl: 60 });
  }

  if (action === 'remove') {
    await kv.remove(key);
    return c.json({ action: 'remove', key });
  }

  if (action === 'keys') {
    const keys = await kv.keys();
    return c.json({ action: 'keys', keys });
  }

  if (action === 'clear') {
    await kv.clear();
    return c.json({ action: 'clear' });
  }

  const value = await kv.get(key);
  const has = await kv.has(key);
  return c.json({ action: 'get', key, value, has });
});

export const POST = defineHandler(async c => {
  const body = await c.req.json().catch(() => ({}));
  const { key = `post-${Date.now()}`, value = 'default' } = body;

  await kv.set(key, value);
  const allKeys = await kv.keys();

  return c.json({ action: 'set', key, value, totalKeys: allKeys.length }, 201);
});
