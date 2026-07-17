import { defineHandler } from 'ubean';

export const GET = defineHandler(c => {
  return c.json({
    env: {
      NODE_ENV: process.env.NODE_ENV || 'development',
      PORT: process.env.PORT || '9527'
    },
    note: 'Environment variables can be defined using defineEnv() in app.ts',
    timestamp: new Date().toISOString()
  });
});
