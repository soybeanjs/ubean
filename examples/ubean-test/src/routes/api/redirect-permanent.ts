import { defineHandler } from 'ubean';

export const GET = defineHandler(c => {
  return c.redirect('/api/hello', 301);
});
