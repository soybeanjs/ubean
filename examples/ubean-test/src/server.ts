import { defineServer } from 'ubean/runtime/app';

export default defineServer({
  // 运行时钩子(dev 下请求日志已由 CLI 输出,如需自定义可在此添加)
  hooks: {},

  // 在 app.init() 后调用
  onServerReady: async _app => {}
});
