import { defineHandler } from 'ubean/server';

export const GET = defineHandler(c => {
  return c.redirect('/api/hello', 301);
});
