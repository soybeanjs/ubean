import {
  defineHandler,
  useData,
  defineDataKey,
  invalidateData,
  invalidateAll,
  hasData,
  declareDependencies,
  withDependencies,
  getInvalidatedKeysForAction,
  clearDataCache
} from 'ubean';

export const GET = defineHandler(async c => {
  const action = c.req.query('action') || 'info';

  switch (action) {
    case 'cache': {
      clearDataCache();
      const key = 'test-cache';
      const result1 = await useData({
        key,
        fetcher: async () => ({ timestamp: Date.now(), value: 'first fetch' })
      });
      const result2 = await useData({
        key,
        fetcher: async () => ({ timestamp: Date.now(), value: 'should not be called' })
      });
      return c.json({
        cached: result1.data === result2.data,
        data1: result1.data,
        data2: result2.data,
        sameTimestamp: result1.timestamp === result2.timestamp,
        loading: result1.loading === false && result2.loading === false,
        error: result1.error === null && result2.error === null
      });
    }

    case 'invalidateByKey': {
      clearDataCache();
      const key = 'test-invalidate-key';
      await useData({
        key,
        fetcher: async () => ({ value: 'cached data' })
      });
      const before = hasData(key);
      const count = invalidateData(key);
      const after = hasData(key);
      return c.json({ before, after, invalidatedCount: count });
    }

    case 'invalidateByTag': {
      clearDataCache();
      const key = 'test-invalidate-tag';
      await useData({
        key,
        tags: ['users', 'data'],
        fetcher: async () => ({ value: 'tagged data' })
      });
      const before = hasData(key);
      const count = invalidateData('users');
      const after = hasData(key);
      return c.json({ before, after, invalidatedCount: count });
    }

    case 'invalidateAll': {
      await useData({ key: 'all-1', fetcher: async () => 'a' });
      await useData({ key: 'all-2', fetcher: async () => 'b' });
      await useData({ key: 'all-3', tags: ['tag3'], fetcher: async () => 'c' });
      const before1 = hasData('all-1');
      const before2 = hasData('all-2');
      const before3 = hasData('all-3');
      invalidateAll();
      const after1 = hasData('all-1');
      const after2 = hasData('all-2');
      const after3 = hasData('all-3');
      return c.json({
        before: { a1: before1, a2: before2, a3: before3 },
        after: { a1: after1, a2: after2, a3: after3 }
      });
    }

    case 'ttl': {
      clearDataCache();
      const key = 'test-ttl';
      const r1 = await useData({
        key,
        ttl: 50,
        fetcher: async () => ({ time: Date.now(), version: 1 })
      });
      const beforeExpiry = hasData(key);
      await new Promise(r => setTimeout(r, 100));
      const afterExpiry = hasData(key);
      const r2 = await useData({
        key,
        ttl: 50,
        fetcher: async () => ({ time: Date.now(), version: 2, refreshed: true })
      });
      return c.json({
        beforeExpiry,
        afterExpiry,
        version1: (r1.data as any)?.version,
        version2: (r2.data as any)?.version,
        refreshed: (r2.data as any)?.refreshed === true
      });
    }

    case 'defineDataKey': {
      clearDataCache();
      const sym = defineDataKey('my-symbol-key');
      await useData({
        key: sym,
        fetcher: async () => ({ symKey: true, value: 'symbol data' })
      });
      return c.json({
        isSymbol: typeof sym === 'symbol',
        hasData: hasData(sym),
        keyDescription: sym.toString()
      });
    }

    case 'dependencies': {
      const deps = declareDependencies({ keys: ['dep1', 'dep2'], tags: ['dep-tag'] });
      const wrappedFetcher = withDependencies(async () => ({ result: 'computed', time: Date.now() }), deps);
      const result = await wrappedFetcher();
      return c.json({
        result,
        depsKeys: deps.keys,
        depsTags: deps.tags,
        wrapped: typeof wrappedFetcher === 'function'
      });
    }

    case 'actionInvalidation': {
      clearDataCache();
      const key = 'action-test';
      await useData({
        key,
        tags: ['action-tag'],
        fetcher: async () => ({ value: 'initial' })
      });
      const before = hasData(key);
      const count = getInvalidatedKeysForAction('update', {
        update: ['action-tag'],
        delete: ['nonexistent']
      });
      const after = hasData(key);
      return c.json({ before, after, invalidatedCount: count });
    }

    case 'error': {
      clearDataCache();
      const key = 'test-error';
      const result = await useData({
        key,
        fetcher: async () => {
          throw new Error('Fetch failed');
        }
      });
      return c.json({
        hasError: result.error !== null,
        errorMessage: result.error?.message,
        data: result.data,
        loading: result.loading
      });
    }

    default:
      return c.json({
        actions: [
          'cache',
          'invalidateByKey',
          'invalidateByTag',
          'invalidateAll',
          'ttl',
          'defineDataKey',
          'dependencies',
          'actionInvalidation',
          'error'
        ]
      });
  }
});
