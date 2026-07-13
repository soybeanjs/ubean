import { defineHandler } from 'ubean';

export const GET = defineHandler(c => {
  const origin = c.req.raw.headers.get('origin') || 'none';
  return c.json({
    cors: 'enabled',
    origin,
    note: 'CORS headers are handled by the CORS middleware. By default, CORS is not enabled globally. Use defineCors() or createCorsMiddleware() to enable it.',
    timestamp: new Date().toISOString()
  });
});
