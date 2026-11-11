/**
 * 滚动位置恢复 —— vue-router 5.5 起 `scrollBehavior` 已 deprecated，
 * 官方替代是 `vue-router/experimental` 的 `ScrollRestoration` 插件 +
 * 组件内 `useScrollRestoration()`。这里把两者包成 ubean 的一个入口：
 *
 * - `installScrollRestoration(app, router)` 在 `app.use(router)` **之前** 装插件
 *   （插件需要 router 实例，但必须在 router 之前安装）。
 * - `<PageView>` 渲染的页面包装组件会自动调用 `useScrollRestoration()`，
 *   页面无需自己写（必须在 `<RouterView>` 内部才能拿到正确的渲染时机）。
 *
 * SSR 环境下插件本身是 noop，`installScrollRestoration` 直接跳过。
 */
import {
  ScrollRestoration,
  useScrollRestoration,
  SCROLL_RESTORATION_CAPTURE_DEFAULT,
  SCROLL_RESTORATION_RESTORE_DEFAULT
} from 'vue-router/experimental';
import type { ScrollRestorationPluginOptions } from 'vue-router/experimental';
import type { App } from 'vue';
import type { Router } from 'vue-router';

export { useScrollRestoration, SCROLL_RESTORATION_CAPTURE_DEFAULT, SCROLL_RESTORATION_RESTORE_DEFAULT };
export type { ScrollRestorationPluginOptions };

export type ScrollRestorationOptions = Omit<ScrollRestorationPluginOptions, 'router' | 'capture' | 'restore'> &
  Partial<Pick<ScrollRestorationPluginOptions, 'capture' | 'restore'>>;

declare global {
  // eslint-disable-next-line no-var
  var __ubeanScrollRestoration: boolean | undefined;
}

/** 页面包装组件据此决定是否调用 `useScrollRestoration()`。 */
export function isScrollRestorationEnabled(): boolean {
  return globalThis.__ubeanScrollRestoration === true;
}

/**
 * 安装滚动位置恢复。必须在 `app.use(router)` 之前调用。
 *
 * `capture` / `restore` 默认用 vue-router 的实现（保存窗口位置、有 hash 时滚到
 * 锚点、否则回顶部）。传 `false` 关闭。
 */
export function installScrollRestoration(
  app: App,
  router: Router,
  options: ScrollRestorationOptions | false = {}
): void {
  // Keep the page wrapper in sync across app instances in the same process:
  // a previous app enabled it, so a `false` app must clear the flag again.
  globalThis.__ubeanScrollRestoration = options !== false;
  if (options === false || typeof document === 'undefined') return;
  app.use(ScrollRestoration, {
    ...options,
    router,
    capture: options.capture ?? SCROLL_RESTORATION_CAPTURE_DEFAULT,
    restore: options.restore ?? SCROLL_RESTORATION_RESTORE_DEFAULT
  });
}
