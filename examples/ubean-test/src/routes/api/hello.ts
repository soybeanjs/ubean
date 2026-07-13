import { defineHandler } from 'ubean';

export const GET = defineHandler(c => {
  return c.json({
    message: 'Hello from ubean API!',
    timestamp: new Date().toISOString(),
    method: 'GET'
  });
});

export const POST = defineHandler(async c => {
  const body = await c.req.json().catch(() => ({}));
  return c.json({
    message: 'POST received!',
    received: body,
    timestamp: new Date().toISOString(),
    method: 'POST'
  });
});
