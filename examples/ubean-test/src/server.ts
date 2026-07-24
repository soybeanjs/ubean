import { defineServer } from 'ubean/runtime/app';

export default defineServer({
  // 运行时钩子
  hooks: {
    'request:start': c => {
      console.log(`[server] ${c.req.method} ${c.req.path}`);
    }
  },

  // 在 app.init() 后调用
  onServerReady: async _app => {
    console.log('[server] Server is ready');
  }
});
