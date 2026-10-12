# @ubean/i18n

**[English](./README.md) | 中文**

ubean 的 i18n 引擎 —— 紧凑语言前缀路由只编译一次，Hono 与 vue-router 共用；handler 侧提供 AsyncLocalStorage 作用域的 `t()` / `d()` / `n()`。

```ts
import { compileLocalePaths } from '@ubean/i18n';

const compiled = compileLocalePaths('/about', {
  defaultLocale: 'en',
  locales: ['en', 'zh'],
  strategy: 'prefix_except_default'
});
// compiled.vuePath → '/:locale(zh)?/about'
// compiled.hono    → [{ path: '/about', locale: 'en', isDefault: true }, { path: '/zh/about', locale: 'zh', isDefault: false }]
```

## 目录

- [包定位](#包定位)
- [安装](#安装)
- [快速开始](#快速开始)
- [语言路由策略](#语言路由策略)
- [路径编译与工具函数](#路径编译与工具函数)
- [请求中间件](#请求中间件)
- [AsyncLocalStorage 中的消息](#asynclocalstorage-中的消息)
- [语言 head（hreflang / canonical）](#语言-headhreflang--canonical)
- [浏览器安全子路径](#浏览器安全子路径)
- [类型安全](#类型安全)
- [架构说明](#架构说明)

## 包定位

`@ubean/i18n` 是 ubean 中**语言路由的唯一所有者**，也是**请求作用域翻译 API** 的所在地：

| 层                            | 职责                                                                                                                                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@ubean/i18n`（本包）         | 四种紧凑语言路由策略、`compileLocalePaths`、URL 工具、语言检测（cookie / `Accept-Language`）、`createI18nMiddleware`、ALS `t()` / `d()` / `n()`、语言目录，以及 hreflang/canonical head 构建器 |
| `@ubean/client`（框架运行时） | vue-i18n 11 composer 之上的 Vue 侧接线：`setLocale`、`useLocalePath`、`useSwitchLocalePath`、`useLocaleHead`、`getI18nRuntimeConfig`                                                           |
| `@ubean/app`                  | 在 `createUbeanApp` 内挂载 `createI18nMiddleware` —— 你不需要自己接中间件                                                                                                                      |
| `@ubean/config`               | 把 `ubean.config.ts` 的 `i18n` 字段解析为 `LocaleRoutingConfig`（`resolveI18nConfig`）                                                                                                         |

**包含：**

- `compileLocalePaths(pagePath, cfg)` —— vue-router 与 Hono 共用的路径编译器（`CompiledLocalePath`）
- `getVueLocaleParam` / `toVueRouterLocalePath` / `extractLocaleFromPath` / `localizePath` / `switchLocalePath`
- `createI18nMiddleware(options)` + `getRequestLocale(c)` / `getPathWithoutLocale(c)`
- ALS 翻译作用域：`t` / `d` / `n`、`runWithI18n`、`getI18nScope`、`createRequestContext`
- 语言目录管理：`setLocaleMessages` / `getLocaleMessages` / `mergeLocaleMessages`、`setLocaleMeta` / `getLocaleMeta`、`setFallbackLocale` / `getFallbackLocale`、`registerLocaleLoader` / `ensureLocaleMessages`
- 语言元信息读取：`listLocaleCodes`、`getRegisteredLocalesMeta`、`getLocaleDir`、`getLocaleName`
- 检测工具：`detectLocaleFromAcceptLanguage`、`parseLocaleCookie`、`serializeLocaleCookie`
- SEO head 构建器：`buildLocaleHead`（`htmlAttrs` / `link` / `meta`）
- `@ubean/i18n/browser` 处的浏览器安全子集

**不包含**（由邻近包负责）：

- vue-i18n composer 本身 —— `useI18n` 直接从 `vue-i18n` 导入（Composition API，`legacy: false`）
- 应用构建与中间件挂载（`@ubean/app` 的 `createUbeanApp`）
- SEO meta 渲染 / `<Head>`（`@ubean/seo`）；本包只产出语言标签描述结构
- 语言文件发现与磁盘目录加载（`@ubean/scan` + 构建流水线，对外表现为 `loadMessages`）

**运行时依赖白名单（主入口）：`@intlify/core`、`@ubean/shared`、`hono`。** 不静态导入 `vue`，也不静态导入 `vue-i18n` —— Vue composer 由 `@ubean/client` 接线。

本包声明**无 optional peer**：任何可选包缺失都不会造成运行时能力降级。

## 安装

```bash
pnpm add @ubean/i18n
# Vue 侧（由应用安装，不由本包安装）：
pnpm add vue-i18n # vue-i18n 11，Composition API（legacy: false）
```

## 快速开始

**1. 配置** `ubean.config.ts` 的 `i18n` 字段 —— 中间件会自动挂载：

```ts
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  i18n: {
    defaultLocale: 'en',
    locales: [
      { code: 'en', language: 'en', name: 'English' },
      { code: 'zh', language: 'zh-CN', name: '简体中文' }
    ],
    strategy: 'prefix_except_default',
    detectBrowserLanguage: { cookieName: 'ubean_locale', redirectOn: 'root' }
  }
});
```

**2. 在 handler 中翻译** —— `t()` 读取请求的 AsyncLocalStorage 作用域：

```ts
import { t, getRequestLocale } from 'ubean/i18n';
// src/routes/hello.ts
import { defineHandler } from 'ubean/server';

export const GET = defineHandler(c => {
  return c.json({ locale: getRequestLocale(c), hello: t('hello') });
});
```

**3. 路径只编译一次**，让两个 router 消费同一份结果：

```ts
import { compileLocalePaths } from '@ubean/i18n';

const cfg = { defaultLocale: 'en', locales: ['en', 'zh'], strategy: 'prefix_except_default' } as const;

compileLocalePaths('/about', cfg);
// → { vuePath: '/:locale(zh)?/about', hono: [{ path: '/about', … }, { path: '/zh/about', … }] }
```

## 语言路由策略

共四种紧凑策略；`prefix_except_default` 是框架默认值。以 `defaultLocale: 'en'`、locales `en, zh`、页面 `/about` 为例：

| 策略                    | vue-router                | Hono                                    |
| ----------------------- | ------------------------- | --------------------------------------- |
| `prefix_except_default` | `/:locale(zh)?/about`     | `/about`、`/zh/about`（无 `/en/about`） |
| `prefix`                | `/:locale(en\|zh)/about`  | `/en/about`、`/zh/about`                |
| `prefix_and_default`    | `/:locale(en\|zh)?/about` | `/about`、`/en/about`、`/zh/about`      |
| `no_prefix`             | `/about`                  | `/about`                                |

```ts
import { getVueLocaleParam } from '@ubean/i18n';

const cfg = { defaultLocale: 'en', locales: ['en', 'zh'], strategy: 'prefix_except_default' } as const;

getVueLocaleParam(cfg); // ':locale(zh)?'
```

语言 **code** 是保留的 URL 段 —— 当 `zh` 是语言 code 时，`pages/[id].vue` 不会匹配 `/zh`。

## 路径编译与工具函数

```ts
import {
  compileLocalePaths,
  extractLocaleFromPath,
  localizePath,
  switchLocalePath,
  toVueRouterLocalePath
} from '@ubean/i18n';

const cfg = { defaultLocale: 'en', locales: ['en', 'zh'], strategy: 'prefix_except_default' } as const;

const { vuePath, hono } = compileLocalePaths('/about', cfg);

extractLocaleFromPath('/zh/about', cfg.locales);
// → { locale: 'zh', pathWithoutLocale: '/about' }

localizePath('/about', 'zh', cfg); // '/zh/about'
switchLocalePath('zh', '/about', cfg); // '/zh/about'

toVueRouterLocalePath('/about', getVueLocaleParam(cfg)); // '/:locale(zh)?/about'
```

- `compileLocalePaths(pagePath, cfg)` 返回 `{ vuePath, hono: HonoLocalePath[] }`；`hono` 每项为 `{ path, locale, isDefault }`。
- `switchLocalePath(locale, currentPath, cfg)` 即 `localizePath(currentPath, locale, cfg)` —— 传入当前路由路径即可得到另一语言下的同一路由。
- 这些工具是纯函数：不涉及 ALS、不依赖请求状态，放进浏览器产物是安全的。

## 请求中间件

`createI18nMiddleware(options)` 由 `createUbeanApp` 挂载；只有在自定义 app 中才需要直接调用它。

前缀策略的检测顺序：**URL 前缀 → cookie → `Accept-Language` → `defaultLocale`**。每个已解析请求都会回写 cookie。

```ts
import { createI18nMiddleware } from '@ubean/i18n';

const middleware = createI18nMiddleware({
  defaultLocale: 'en',
  locales: ['en', 'zh'],
  strategy: 'prefix_except_default',
  detectBrowserLanguage: { cookieName: 'ubean_locale', redirectOn: 'root', alwaysRedirect: false }
});
```

行为细节：

- 默认值：`cookieName: 'ubean_locale'`、`redirectOn: 'root'`、`alwaysRedirect: false`。
- `/api/`、`/_`、`/__` 路径仍进入 ALS 作用域（cookie / `Accept-Language`），但 URL 永不改写。
- `prefix_except_default` 会把 `/en/...` 302 到无前缀路径；`prefix` 会把无前缀内容 302 到偏好前缀，不受 `redirectOn` 影响。
- `redirectOn: 'root'` 只 302 `/`；`redirectOn: 'all'` 连更深路径也重定向。
- 中间件设置 `c.set('locale')`、`c.set('pathWithoutLocale')` 与 `Content-Language` 响应头，并追加 `Set-Cookie`。

```ts
import { getRequestLocale, getPathWithoutLocale } from 'ubean/i18n';
import { defineHandler } from 'ubean/server';

export const GET = defineHandler(c => {
  return c.json({ locale: getRequestLocale(c), path: getPathWithoutLocale(c) });
});
```

中间件把解析后的语言与去前缀路径写入 context；`getPathWithoutLocale(c)` 读取后者。

## AsyncLocalStorage 中的消息

handler 侧翻译活在 ALS 作用域里。`t()` 在作用域外会**抛错** —— 不存在进程全局 locale。

```ts
import { t, d, n, getI18nScope } from 'ubean/i18n';
import { defineHandler } from 'ubean/server';

export const GET = defineHandler(c => {
  const scope = getI18nScope();
  return c.json({
    hello: t('hello'),
    greeting: t('greeting', { name: 'World' }),
    when: d(new Date()),
    count: n(1200)
  });
});
```

语言目录与元信息 API：

```ts
import {
  ensureLocaleMessages,
  getFallbackLocale,
  getLocaleDir,
  getLocaleMeta,
  registerLocaleLoader,
  setFallbackLocale,
  setLocaleMessages,
  setLocaleMeta
} from '@ubean/i18n';

setFallbackLocale('en');
setLocaleMessages('en', { hello: 'Hello' });

registerLocaleLoader(async locale => {
  const messages = await import(`../locales/${locale}.json`);
  setLocaleMessages(locale, messages.default);
});
await ensureLocaleMessages('zh', getFallbackLocale());

setLocaleMeta('zh', { code: 'zh', language: 'zh-CN', name: '简体中文', dir: 'ltr' });
```

同样导出的还有：`getLocaleMessages` / `mergeLocaleMessages`、`listLocaleCodes`、`getRegisteredLocalesMeta`、`getLocaleName`。`createRequestContext(locale, fallback)` 构造测试与内部调用者交给 `runWithI18n(scope, fn)` 消费的作用域对象；`getAlsLocale()`（`getRequestLocale()` 在入口处的别名）无需 Hono context 即可读取当前语言。

## 语言 head（hreflang / canonical）

`buildLocaleHead` 把解析后的路由状态转成 head 标签 —— 不依赖 Vue、不依赖 unhead：

```ts
import { buildLocaleHead } from '@ubean/i18n';

const tags = buildLocaleHead({
  path: '/about',
  locale: 'zh',
  locales: [
    { code: 'en', language: 'en', name: 'English', isDefault: true },
    { code: 'zh', language: 'zh-CN', name: '简体中文', dir: 'ltr' }
  ],
  routing: { defaultLocale: 'en', locales: ['en', 'zh'], strategy: 'prefix_and_default' },
  baseUrl: 'https://example.com'
});

tags.htmlAttrs; // { lang, dir }
tags.link; // rel=alternate hreflang 条目（含 x-default）+ canonical
tags.meta; // og:locale / og:locale:alternate
```

- `hreflang` 交替链接包含语言组 catch-all 条目与 `x-default`。
- `prefix_and_default` 下，默认语言的 canonical 指向**无前缀** URL。
- 设置 `baseUrl` 以输出绝对 href。

## 浏览器安全子路径

`@ubean/i18n/browser` 导出无请求依赖的子集，客户端代码因此不会拉入 Hono 与 ALS 运行时：

```ts
import {
  buildLocaleHead,
  compileLocalePaths,
  detectLocaleFromAcceptLanguage,
  extractLocaleFromPath,
  getVueLocaleParam,
  localizePath,
  parseLocaleCookie,
  serializeLocaleCookie,
  switchLocalePath,
  toVueRouterLocalePath
} from '@ubean/i18n/browser';
```

该入口还导出路由类型（`I18nRoutingStrategy`、`LocaleRoutingConfig`、`CompiledLocalePath`、`HonoLocalePath`、`I18nLocaleMeta`）与 head 类型（`LocaleHeadInput`、`LocaleHeadTags`）。

## 类型安全

- 路由类型：`I18nRoutingStrategy`（`'prefix' | 'prefix_except_default' | 'prefix_and_default' | 'no_prefix'`）、`LocaleRoutingConfig`、`CompiledLocalePath`、`HonoLocalePath`、`I18nMiddlewareOptions`、`I18nDetectOptions`、`I18nLocaleMeta`。
- 运行时类型：`LocaleMessages`、`I18nRequestScope`、`I18nCoreContext`。
- head 类型：`LocaleHeadInput`、`LocaleHeadTags`。
- `LocaleRoutingConfig` 与解析后的 `i18n` 配置结构兼容，`as const` 配置对象可直接传给纯函数工具，无需断言。
- 消息 key 的类型由构建流水线生成到 `.ubean/i18n.d.ts` —— 它用默认语言目录增强 vue-i18n 的 `DefineLocaleMessage`。请把 `.ubean/*.d.ts` 纳入 `tsconfig.json`。

## 架构说明

- **一个编译器，两个 router。** `compileLocalePaths` 是唯一知道前缀规则的地方；Hono 路由注册与 vue-router 路由生成都消费它的输出。改策略只改一个函数，而不是两张路由表。
- **无进程全局 locale。** `t()` / `d()` / `n()` 严格读 ALS；在请求作用域之外抛错，而不是静默回落到默认语言。Cloudflare Workers 需要 `nodejs_compat` 才能用 `AsyncLocalStorage`。
- **服务端引擎 vs Vue 引擎。** handler 用 `@intlify/core`；Vue 侧用 vue-i18n 11。两者共享语言目录，不共享实例 —— 本包从不导入 `vue-i18n`。中间件由 `createUbeanApp` 挂载，因此 `src/middleware/02.i18n.ts` 不属于本框架约定。
- **已移除且无兼容层：** `defineLocale`、`addLocale`、`mergeLocale`、`clearLocales`、`formatDate`、`formatNumber`、`formatCurrency`、`formatRelativeTime`、`formatList`，以及本包此前提供的进程全局 `useI18n()`。请改用 vue-i18n 的 `d` / `n` 与 ALS 的 `t()`。
- **决策记录：** [`docs/adr/0009-i18n-engine-and-compact-locale-routing.md`](../../docs/adr/0009-i18n-engine-and-compact-locale-routing.md)。多语言 SSG 走查示例见 [`examples/ssg-catchall`](../../examples/ssg-catchall)。
