import { defineServer } from 'ubean/server';
import { registerMatchers } from './matchers';

// 动态路由 matcher（Task 7）：服务端 router 在匹配到 `[id=numeric]` 这类路由后按名字校验参数，
// 失败返回 404。注册表是图内单例 —— 客户端图（`src/app.ts`）与这里是两份实例，必须都注册。
registerMatchers();

export default defineServer({
  // 运行时钩子(dev 下请求日志已由 CLI 输出,如需自定义可在此添加)
  hooks: {},

  /**
   * P9-09 全局 handle hook。
   *
   * 这里给每个响应加一个标记头，作用**不只是示例**：它是「用户的 `defineServer` 配置
   * 真的在 dev 生效了」的可观测证据 —— 配置必须在 `app.init()` **之前**应用，否则
   * `applyHandleHook` 中间件不会出现在链上（见 `@ubean/app` 的 `applyServerConfig` 文档）。
   * `packages/cli/test/dev-topology.test.ts` 断言这个头的存在，守住 RM-V11 搬迁
   * `createDevAppReady()` 时最容易丢的时序。
   *
   * 用新建 Response 而不是就地改 headers：`resolve()` 返回的响应可能不可变（来自平台
   * fetch 时），`new Response(body, ...)` 转发流式 body 同样安全。
   */
  globalHooks: {
    handle: async ({ event, resolve }) => {
      const response = await resolve(event);
      const headers = new Headers(response.headers);
      headers.set('x-ubean-server-config', 'applied');
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }
  },

  // 在 app.init() 后调用
  onServerReady: async _app => {}
});
