import { defineHandler, cachedEventHandler, invalidateRouteCache } from 'ubean';

let callCount = 0;

const cachedHandler = cachedEventHandler(
  c => {
    callCount++;
    return c.json({
      cached: true,
      callCount,
      timestamp: Date.now(),
      message: callCount === 1 ? 'First call (miss)' : 'Served from cache (hit)'
    });
  },
  { ttl: 10, name: 'cache-test' }
);

export const GET = defineHandler(cachedHandler);

export const POST = defineHandler(async c => {
  await invalidateRouteCache('cache-test');
  callCount = 0;
  return c.json({ invalidated: true, message: 'Cache cleared for cache-test' });
});
