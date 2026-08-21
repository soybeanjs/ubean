# ADR-0009 · 翻译引擎采用 vue-i18n 11 + 语言路由采用约束前缀

- **状态**: accepted
- **日期**: 2026-08-21
- **关联**: [docs/i18n-vue-i18n.md](../i18n-vue-i18n.md)
- **决策者**: grill-with-docs 会话（Q1=1、Q2=2；明确不做兼容）

ubean 把「翻译」「语言路由」「语言检测」「请求级实例」揉进 `@ubean/i18n` 的进程单例。翻译能力是 vue-i18n 的子集；Hono 有语言前缀而 vue-router 没有；`setLocale` 既不加载文案也不改 URL。

**决定：**

1. **翻译引擎**外包给 Intlify：Vue 端 `vue-i18n@^11.4`（Composition，`legacy: false`，每 app / 每 SSR 请求一个实例）；Hono / API / 非 Vue 路径用 `@intlify/core`（`createCoreContext` + `translate`）。不保留自研 `t()` 引擎，不保留零依赖卖点，不做双引擎。
2. **语言路由**由 ubean 继续拥有，不复制 `@nuxtjs/i18n` 的 `pages:extend` / `___en` 路由名。Hono 与 vue-router **共用** `compileLocalePaths()`：按 strategy 生成约束前缀（`/:locale(zh)/about` + 默认语言 `/about`）。这与 Nuxt experimental `compactRoutes` 同构，而不是 Nuxt 的完整路由表膨胀。
3. **框架 `setLocale(locale)`** = 加载该语言文案 + 写 cookie + 导航到对应 URL。禁止把 vue-i18n 的 `locale.value = x` 当公共 API。
4. **明确不做**（与 Nuxt 模块对齐的产品面，不是引擎）：custom paths、`differentDomains`、`/_i18n/:hash/messages.json` CDN 端点、Legacy API、`petite-vue-i18n`（默认扁平 key，与嵌套 `user.name` 冲突）。

路由/检测/hreflang 不属于 vue-i18n；把它们交给引擎是类别错误。配置拆成 `ubean.config.ts` 的框架字段 + 嵌套 `vueI18n`（传给 `createI18n`），不引入独立 `i18n.config.ts` 以免每请求加载拖 TTFB。
