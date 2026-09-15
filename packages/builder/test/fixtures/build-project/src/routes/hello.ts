import { defineHandler } from '@ubean/routes';

export const GET = defineHandler(c => c.json({ ok: true }));
