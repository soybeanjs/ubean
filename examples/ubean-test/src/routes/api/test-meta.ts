import { defineHandler, defineHandlerMeta } from 'ubean';

const metaMiddleware = defineHandlerMeta({ public: true });

export const GET = defineHandler(metaMiddleware, c => {
  return c.json({ message: 'defineHandlerMeta works!', meta: { public: true } });
});
