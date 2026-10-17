/**
 * 应用实例（`{ app, router, head, page }`）的运行时访问入口。
 *
 * ## 为什么需要它
 *
 * `createUbeanClientApp()` 一直**返回**完整实例，但框架自产的客户端入口
 * （`virtual:ubean-app` 的 `createApp()`）丢弃了返回值，用户代码因此拿不到 router ——
 * 而 `useRouter()`（vue-router）只能在组件 `setup()` 里调用，路由守卫回调、插件、
 * 工具函数、`onClientReady` 之外的地方全都够不着。
 *
 * ## 两个入口，各自解决不同场景
 *
 * 1. **模块级单例**（`useUbeanApp()`）—— 浏览器端。一个页面只有一个应用实例，模块级
 *    持有是安全的。任何客户端模块 import 即可取用，不必在组件上下文里。
 * 2. **`UBEAN_APP_KEY`（`app.provide`）** —— 服务端 SSR 的**正确**答案。SSR 实例是
 *    每请求新建的，模块级变量在并发请求下会互相覆盖，因此服务端只走 `inject`：
 *
 *    ```ts
 *    import { inject } from 'vue';
 *    import { UBEAN_APP_KEY } from 'ubean/client';
 *
 *    const { router } = inject(UBEAN_APP_KEY)!;
 *    ```
 *
 * `useUbeanApp()` 在服务端**故意抛错**（而不是悄悄返回某个并发请求的实例），
 * 错误信息里直接给出 `inject` 的写法。需要在同构代码里判断是否存在时用
 * `getUbeanAppInstance()`（不抛错，返回 `null`）。
 */
import type { InjectionKey } from 'vue';
import type { Router } from 'vue-router';
import type { UbeanAppInstance } from './app';

/**
 * `app.provide` 注入键。客户端与服务端**都**会 provide，因此在组件 `setup()` 内
 * 用 `inject(UBEAN_APP_KEY)` 是两端通吃的取法（也是 SSR 下唯一安全的方式）。
 */
export const UBEAN_APP_KEY: InjectionKey<UbeanAppInstance> = Symbol('ubean:app') as InjectionKey<UbeanAppInstance>;

/**
 * 浏览器端的当前实例。**仅客户端入口写入** —— 服务端不写，见文件头说明。
 */
let _current: UbeanAppInstance | null = null;

/**
 * 由 `createUbeanClientApp()` 内部调用。**不是**给用户代码用的公开 API。
 */
export function setUbeanAppInstance(instance: UbeanAppInstance | null): void {
  _current = instance;
}

/**
 * 取当前应用实例，**不抛错**。不存在时返回 `null`。
 *
 * 用途：同构代码里判断「现在有没有实例」（例如某个可选增强逻辑只在客户端跑）。
 * 服务端恒为 `null`，此时应改用 `inject(UBEAN_APP_KEY)`。
 */
export function getUbeanAppInstance(): UbeanAppInstance | null {
  return _current;
}

/**
 * 取当前应用实例（`{ app, router, head, page }`）。
 *
 * 浏览器端任何位置都可调用；服务端会抛错（并发请求下模块级单例不安全），
 * 请在组件内改用 `inject(UBEAN_APP_KEY)`。
 *
 * @throws 客户端入口尚未执行（或当前是服务端 SSR）时抛错。
 */
export function useUbeanApp(): UbeanAppInstance {
  if (!_current) {
    throw new Error(
      '[ubean] useUbeanApp() 取不到应用实例：客户端入口尚未执行，或当前是服务端 SSR。\n' +
        '- 客户端：确认调用发生在应用创建之后（不要放在模块顶层）。\n' +
        '- 服务端 SSR：实例是每请求新建的，请在组件 setup() 内改用 `inject(UBEAN_APP_KEY)`。'
    );
  }
  return _current;
}

/**
 * 取当前 `vue-router` 实例。等价于 `useUbeanApp().router`。
 *
 * 这是 `useRouter()` 的补充而非替代 —— `useRouter()` 需要组件上下文，本函数不需要。
 * 组件内两者都可用时，**优先 `useRouter()`**（它天然跟随当前应用，多实例安全）。
 *
 * @throws 同 `useUbeanApp()`。
 */
export function useUbeanRouter(): Router {
  return useUbeanApp().router;
}
