/**
 * ubean/runtime/i18n — 服务端 i18n 入口
 *
 * 纯 re-export `@ubean/i18n`,提供纯函数版 i18n API:
 * - `defineLocale` / `t` / `setLocale` / `mergeLocale` / `addLocale` / `clearLocales`
 * - `getLocaleMessages` / `getRegisteredLocales`
 * - `formatDate` / `formatNumber` / `formatCurrency` / `formatRelativeTime` / `formatList`
 *
 * 注意:浏览器端 Vue 响应式版本应从 `ubean/runtime/vue` 导入(`useI18n` 等)。
 *
 * ```ts
 * import { defineLocale, setLocale, mergeLocale, getRegisteredLocales } from 'ubean/runtime/i18n';
 * ```
 */
export * from '@ubean/i18n';
