import { createError } from 'ubean';
import { defineHandler } from 'ubean/server';

export const GET = defineHandler(() => {
  throw createError({
    statusCode: 500,
    statusMessage: 'Internal Server Error',
    data: { reason: 'This is a test error from /api/error', timestamp: new Date().toISOString() }
  });
});
