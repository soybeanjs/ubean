import { defineHandler, createMemoryDriver, createStorage, clearGlobalStorage } from 'ubean';

export const GET = defineHandler(async c => {
  const action = c.req.query('action') || 'memory';

  if (action === 'memory') {
    clearGlobalStorage();
    const driver = createMemoryDriver();
    const storage = createStorage({ driver });

    await storage.set('string', 'hello');
    await storage.set('number', 42);
    await storage.set('boolean', true);
    await storage.set('object', { key: 'value', nested: { a: 1 } });
    await storage.set('array', [1, 2, 3]);

    const stringVal = await storage.get('string');
    const numberVal = await storage.get('number');
    const booleanVal = await storage.get('boolean');
    const objectVal = await storage.get('object');
    const arrayVal = await storage.get('array');

    return c.json({
      action: 'memory',
      stringVal,
      numberVal,
      booleanVal,
      objectVal,
      arrayVal,
      allStored: !!stringVal && numberVal !== null && booleanVal !== null && objectVal !== null && arrayVal !== null
    });
  }

  if (action === 'serialization') {
    clearGlobalStorage();
    const driver = createMemoryDriver();
    const storage = createStorage({ driver });

    // Test automatic serialization/deserialization
    const testData = [
      { type: 'string', value: 'hello world' },
      { type: 'number', value: 123.45 },
      { type: 'boolean', value: false },
      { type: 'null', value: null },
      { type: 'object', value: { a: 1, b: { c: 2 } } },
      { type: 'array', value: [1, 'two', { three: 3 }] }
    ];

    const results: Record<string, unknown> = {};
    for (const item of testData) {
      const key = `test-${item.type}`;
      await storage.set(key, item.value);
      const retrieved = await storage.get(key);
      results[item.type] = {
        original: item.value,
        retrieved,
        matches: JSON.stringify(item.value) === JSON.stringify(retrieved)
      };
    }

    return c.json({
      action: 'serialization',
      results,
      allMatch: Object.values(results).every((r: any) => r.matches)
    });
  }

  if (action === 'mount') {
    clearGlobalStorage();
    const driver1 = createMemoryDriver();
    const driver2 = createMemoryDriver();
    const storage = createStorage({ driver: driver1 });

    // Mount a second driver at a specific prefix
    storage.mount('cache', driver2);

    await storage.set('main-key', 'from-main');
    await storage.set('cache:key1', 'from-cache-driver');
    await storage.set('cache:key2', 'also-from-cache');

    const mainVal = await storage.get('main-key');
    const cacheVal1 = await storage.get('cache:key1');
    const cacheVal2 = await storage.get('cache:key2');

    const allKeys = await storage.keys();

    return c.json({
      action: 'mount',
      mainVal,
      cacheVal1,
      cacheVal2,
      allKeys,
      hasKeysFromBothDrivers: allKeys.includes('main-key') && cacheVal1 === 'from-cache-driver' && cacheVal2 === 'also-from-cache'
    });
  }

  if (action === 'ttl') {
    clearGlobalStorage();
    const driver = createMemoryDriver();
    const storage = createStorage({ driver });

    await storage.set('temp', 'data', 1);
    const beforeExpiry = await storage.has('temp');
    await new Promise(r => setTimeout(r, 1100));
    const afterExpiry = await storage.has('temp');

    return c.json({
      action: 'ttl',
      beforeExpiry,
      afterExpiry,
      ttlExpired: !afterExpiry
    });
  }

  return c.json({
    actions: ['memory', 'serialization', 'mount', 'ttl']
  });
});
