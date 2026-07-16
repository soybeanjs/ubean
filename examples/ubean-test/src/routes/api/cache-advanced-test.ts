import { defineHandler, createMemoryStore, createCacheMiddleware } from 'ubean';

export const GET = defineHandler(c => {
  const action = c.req.query('action') || 'basic';

  if (action === 'basic') {
    createMemoryStore(100);

    return c.json({
      message: 'Memory cache store created',
      maxEntries: 100
    });
  }

  if (action === 'operations') {
    createMemoryStore(10);

    return c.json({
      message: 'Cache store created - supports get/set/delete/clear operations',
      maxSize: 10
    });
  }

  if (action === 'middleware') {
    const middleware = createCacheMiddleware({
      defaultTtl: 60,
      rules: {
        '/api/**': { ttl: 30 },
        '/static/**': { swr: true, ttl: 300 }
      }
    });

    return c.json({
      message: 'Cache middleware created',
      hasMiddleware: typeof middleware === 'function',
      defaultTtl: 60,
      rules: ['/api/** (30s ttl)', '/static/** (5min swr)']
    });
  }

  if (action === 'cached-handler') {
    return c.json({
      message: 'Cached event handler test - see /api/cache-test for basic caching',
      info: 'Use cachedEventHandler() for direct handler caching'
    });
  }

  if (action === 'invalidation') {
    return c.json({
      message: 'Cache invalidation test',
      info: 'Use invalidateRouteCache() to invalidate cached routes'
    });
  }

  if (action === 'swr') {
    return c.json({
      message: 'Stale-While-Revalidate test',
      info: 'SWR is supported via the swr property in CacheRule'
    });
  }

  return c.json({
    action: 'unknown',
    availableActions: ['basic', 'operations', 'middleware', 'cached-handler', 'invalidation', 'swr']
  });
});
