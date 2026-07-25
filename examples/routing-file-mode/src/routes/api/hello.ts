import { defineHandler } from 'ubean';

export const GET = defineHandler(c =>
  c.json({
    message: 'Hello from routing-file-mode',
    mode: 'file',
    timestamp: new Date().toISOString()
  })
);
