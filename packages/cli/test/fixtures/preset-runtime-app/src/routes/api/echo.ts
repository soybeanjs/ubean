import { defineHandler } from '@ubean/routes';

export const POST = defineHandler(c => c.json({ ok: true, route: 'echo' }));
