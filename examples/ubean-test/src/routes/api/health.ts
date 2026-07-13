import { defineHandler } from 'ubean';

export const GET = defineHandler(c => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0-test'
  });
});
