import { defineMiddleware } from 'ubean';

export default defineMiddleware(async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  c.header('X-Test-Middleware', 'ubean-test-global');
  c.header('X-Response-Time', `${duration}ms`);
});
