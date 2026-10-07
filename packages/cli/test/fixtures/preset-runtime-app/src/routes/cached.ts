import { defineHandler } from '@ubean/routes';

let hits = 0;

export const GET = defineHandler(c => {
  hits += 1;
  return c.json({ ok: true, route: 'cached', hits });
});
