/**
 * ubean/i18n — 服务端 i18n 入口
 *
 * re-export `@ubean/i18n`(ALS `t()`/`d()`/`n()`、路径编译、检测、cookie)并在
 * 其上显式覆盖路由相关符号的服务端版本(`createI18nMiddleware` /
 * `switchLocalePath` / `compileLocalePaths` 等,来自 `@ubean/i18n/routing`)。
 * 包含 `node:async_hooks`(ALS)与 Hono 中间件 —— 禁止在浏览器代码中导入。
 *
 * 浏览器端 `useI18n` 直接从 `vue-i18n` 导入(自动导入直源 vue-i18n);
 * `setLocale` 等 ubean 封装从 isomorphic 主入口或 `ubean/client` 导入。
 *
 * ```ts
 * import { t, getRequestLocale, createI18nMiddleware } from 'ubean/i18n';
 * ```
 */
export * from '@ubean/i18n';

// ============== i18n 路由(服务端,覆盖 @ubean/i18n 的浏览器版 switchLocalePath)==============
export {
  createI18nMiddleware,
  switchLocalePath,
  getRequestLocale,
  getPathWithoutLocale,
  compileLocalePaths,
  extractLocaleFromPath
} from '@ubean/i18n/routing';
export type { I18nMiddlewareOptions, I18nRoutingStrategy } from '@ubean/i18n/routing';
