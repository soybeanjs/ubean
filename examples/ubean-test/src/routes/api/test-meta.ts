import { defineHandler, defineHandlerMeta } from 'ubean/server';

const metaMiddleware = defineHandlerMeta({ public: true });

export const GET = defineHandler(metaMiddleware, c => {
  return c.json({ message: 'defineHandlerMeta works!', meta: { public: true } });
});
