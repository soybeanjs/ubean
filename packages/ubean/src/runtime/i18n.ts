/**
 * ubean/runtime/i18n — 服务端 i18n 入口
 *
 * 纯 re-export `@ubean/i18n`: ALS `t()`/`d()`/`n()`、`compileLocalePaths`、
 * `createI18nMiddleware`、`runWithI18n`。
 *
 * 浏览器端 `useI18n` 直接从 `vue-i18n` 导入(自动导入直源 vue-i18n);
 * `setLocale` 等 ubean 封装从 `ubean/runtime/vue` 导入。
 */
export * from '@ubean/i18n';
