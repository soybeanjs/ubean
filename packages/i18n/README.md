# @ubean/i18n

**English | [中文](./README.zh-CN.md)**

i18n engine for ubean — compact locale routing compiled once and shared by Hono and vue-router, plus AsyncLocalStorage-scoped `t()` / `d()` / `n()` for handlers.

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

## Table of Contents

- [Package Positioning](#package-positioning)
- [Install](#install)
- [Quick Start](#quick-start)
- [Locale Routing Strategies](#locale-routing-strategies)
- [Path Compilation & Helpers](#path-compilation--helpers)
- [Request Middleware](#request-middleware)
- [Messages in AsyncLocalStorage](#messages-in-asynclocalstorage)
- [Locale Head (hreflang / canonical)](#locale-head-hreflang--canonical)
- [Browser-Safe Subpath](#browser-safe-subpath)
- [Type Safety](#type-safety)
- [Architecture Notes](#architecture-notes)

## Package Positioning

`@ubean/i18n` is the **single owner of locale routing** in ubean, and the home of the **request-scoped translation API**:

| Layer                               | Responsibility                                                                                                                                                                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@ubean/i18n` (this package)        | The four compact locale-routing strategies, `compileLocalePaths`, URL helpers, locale detection (cookie / `Accept-Language`), `createI18nMiddleware`, ALS `t()` / `d()` / `n()`, locale catalogs, and the hreflang/canonical head builder |
| `@ubean/client` (framework runtime) | Vue-side wiring over the vue-i18n 11 composer: `setLocale`, `useLocalePath`, `useSwitchLocalePath`, `useLocaleHead`, `getI18nRuntimeConfig`                                                                                               |
| `@ubean/app`                        | Mounts `createI18nMiddleware` inside `createUbeanApp` — you do not wire the middleware yourself                                                                                                                                           |
| `@ubean/config`                     | Resolves the `i18n` field of `ubean.config.ts` into a `LocaleRoutingConfig` (`resolveI18nConfig`)                                                                                                                                         |

**Included:**

- `compileLocalePaths(pagePath, cfg)` — the shared vue-router + Hono path compiler (`CompiledLocalePath`)
- `getVueLocaleParam` / `toVueRouterLocalePath` / `extractLocaleFromPath` / `localizePath` / `switchLocalePath`
- `createI18nMiddleware(options)` + `getRequestLocale(c)` / `getPathWithoutLocale(c)`
- ALS translation scope: `t` / `d` / `n`, `runWithI18n`, `getI18nScope`, `createRequestContext`
- Locale catalog management: `setLocaleMessages` / `getLocaleMessages` / `mergeLocaleMessages`, `setLocaleMeta` / `getLocaleMeta`, `setFallbackLocale` / `getFallbackLocale`, `registerLocaleLoader` / `ensureLocaleMessages`
- Locale metadata readers: `listLocaleCodes`, `getRegisteredLocalesMeta`, `getLocaleDir`, `getLocaleName`
- Detection helpers: `detectLocaleFromAcceptLanguage`, `parseLocaleCookie`, `serializeLocaleCookie`
- SEO head builder: `buildLocaleHead` (`htmlAttrs` / `link` / `meta`)
- Browser-safe subset at `@ubean/i18n/browser`

**NOT included** (owned next door):

- The vue-i18n composer itself — `useI18n` is imported from `vue-i18n` directly (Composition API, `legacy: false`)
- App construction and middleware mounting (`createUbeanApp` in `@ubean/app`)
- SEO meta rendering / `<Head>` (`@ubean/seo`); this package only produces the locale tag descriptors
- Locale file discovery and catalog loading on disk (`@ubean/scan` + the build pipeline, surfaced as `loadMessages`)

**Runtime dependency whitelist (main entry): `@intlify/core`, `@ubean/shared`, `hono`.** No `vue` and no `vue-i18n` static import — the Vue composer is wired by `@ubean/client`.

This package declares **no optional peers**: nothing degrades at runtime when an optional package is absent.

## Install

```bash
pnpm add @ubean/i18n
# Vue side (installed by the application, not by this package):
pnpm add vue-i18n # vue-i18n 11, Composition API (legacy: false)
```

## Quick Start

**1. Configure** the `i18n` field in `ubean.config.ts` — the middleware is mounted automatically:

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

**2. Translate in handlers** — `t()` reads the request AsyncLocalStorage scope:

```ts
import { t, getRequestLocale } from 'ubean/i18n';
// src/routes/hello.ts
import { defineHandler } from 'ubean/server';

export const GET = defineHandler(c => {
  return c.json({ locale: getRequestLocale(c), hello: t('hello') });
});
```

**3. Compile paths** once and let both routers consume the same result:

```ts
import { compileLocalePaths } from '@ubean/i18n';

const cfg = { defaultLocale: 'en', locales: ['en', 'zh'], strategy: 'prefix_except_default' } as const;

compileLocalePaths('/about', cfg);
// → { vuePath: '/:locale(zh)?/about', hono: [{ path: '/about', … }, { path: '/zh/about', … }] }
```

## Locale Routing Strategies

Four compact strategies; `prefix_except_default` is the framework default. With `defaultLocale: 'en'`, locales `en, zh`, page `/about`:

| Strategy                | vue-router                | Hono                                   |
| ----------------------- | ------------------------- | -------------------------------------- |
| `prefix_except_default` | `/:locale(zh)?/about`     | `/about`, `/zh/about` (no `/en/about`) |
| `prefix`                | `/:locale(en\|zh)/about`  | `/en/about`, `/zh/about`               |
| `prefix_and_default`    | `/:locale(en\|zh)?/about` | `/about`, `/en/about`, `/zh/about`     |
| `no_prefix`             | `/about`                  | `/about`                               |

```ts
import { getVueLocaleParam } from '@ubean/i18n';

const cfg = { defaultLocale: 'en', locales: ['en', 'zh'], strategy: 'prefix_except_default' } as const;

getVueLocaleParam(cfg); // ':locale(zh)?'
```

Locale **codes** are reserved URL segments — `pages/[id].vue` will not match `/zh` when `zh` is a locale code.

## Path Compilation & Helpers

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

- `compileLocalePaths(pagePath, cfg)` returns `{ vuePath, hono: HonoLocalePath[] }`; `hono` carries `{ path, locale, isDefault }` per locale.
- `switchLocalePath(locale, currentPath, cfg)` is `localizePath(currentPath, locale, cfg)` — pass the current route path to get the same route in another locale.
- These helpers are pure functions: no ALS, no request state, safe in the browser bundle.

## Request Middleware

`createI18nMiddleware(options)` is mounted by `createUbeanApp`; call it directly only in a custom app.

Detection order for prefixed strategies: **URL prefix → cookie → `Accept-Language` → `defaultLocale`**. The cookie is written back on every resolved request.

```ts
import { createI18nMiddleware } from '@ubean/i18n';

const middleware = createI18nMiddleware({
  defaultLocale: 'en',
  locales: ['en', 'zh'],
  strategy: 'prefix_except_default',
  detectBrowserLanguage: { cookieName: 'ubean_locale', redirectOn: 'root', alwaysRedirect: false }
});
```

Behavior details:

- Defaults: `cookieName: 'ubean_locale'`, `redirectOn: 'root'`, `alwaysRedirect: false`.
- `/api/`, `/_`, `/__` paths still enter the ALS scope (cookie / `Accept-Language`) but the URL is never rewritten.
- `prefix_except_default` 302s `/en/...` to the unprefixed path; `prefix` 302s unprefixed content to the preferred prefix regardless of `redirectOn`.
- `redirectOn: 'root'` 302s only `/`; `redirectOn: 'all'` also redirects deeper paths.
- The middleware sets `c.set('locale')`, `c.set('pathWithoutLocale')` and a `Content-Language` response header, and appends `Set-Cookie`.

```ts
import { getRequestLocale, getPathWithoutLocale } from 'ubean/i18n';
import { defineHandler } from 'ubean/server';

export const GET = defineHandler(c => {
  return c.json({ locale: getRequestLocale(c), path: getPathWithoutLocale(c) });
});
```

The middleware stores the resolved locale and the unprefixed path on the context; `getPathWithoutLocale(c)` reads the latter.

## Messages in AsyncLocalStorage

Handler-side translation lives in an ALS scope. `t()` **throws** outside ALS — there is no process-global locale.

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

Catalog and metadata APIs:

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

Also exported: `getLocaleMessages` / `mergeLocaleMessages`, `listLocaleCodes`, `getRegisteredLocalesMeta`, `getLocaleName`. `createRequestContext(locale, fallback)` builds the scope object consumed by `runWithI18n(scope, fn)` for tests and internal callers; `getAlsLocale()` (the index alias of `getRequestLocale()`) reads the current locale without a Hono context.

## Locale Head (hreflang / canonical)

`buildLocaleHead` turns the resolved routing state into head tags — no Vue, no unhead dependency:

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
tags.link; // rel=alternate hreflang entries (incl. x-default) + canonical
tags.meta; // og:locale / og:locale:alternate
```

- `hreflang` alternates include the language-group catch-all entry and `x-default`.
- With `prefix_and_default`, the default locale's canonical points at the **unprefixed** URL.
- Set `baseUrl` to emit absolute hrefs.

## Browser-Safe Subpath

`@ubean/i18n/browser` exports the request-free subset, so client code never pulls in Hono or the ALS runtime:

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

Also exported there: the routing types (`I18nRoutingStrategy`, `LocaleRoutingConfig`, `CompiledLocalePath`, `HonoLocalePath`, `I18nLocaleMeta`) and the head types (`LocaleHeadInput`, `LocaleHeadTags`).

## Type Safety

- Routing types: `I18nRoutingStrategy` (`'prefix' | 'prefix_except_default' | 'prefix_and_default' | 'no_prefix'`), `LocaleRoutingConfig`, `CompiledLocalePath`, `HonoLocalePath`, `I18nMiddlewareOptions`, `I18nDetectOptions`, `I18nLocaleMeta`.
- Runtime types: `LocaleMessages`, `I18nRequestScope`, `I18nCoreContext`.
- Head types: `LocaleHeadInput`, `LocaleHeadTags`.
- `LocaleRoutingConfig` is structurally compatible with the resolved `i18n` config, so a `as const` config object can be passed to the pure helpers without casts.
- Message-key typing is generated by the build pipeline into `.ubean/i18n.d.ts`, which augments vue-i18n's `DefineLocaleMessage` from the default locale catalog. Include `.ubean/*.d.ts` in `tsconfig.json`.

## Architecture Notes

- **One compiler, two routers.** `compileLocalePaths` is the only place that knows the prefix rules; Hono route registration and vue-router route generation both consume its output. Changing a strategy changes one function, not two route tables.
- **No process-global locale.** `t()` / `d()` / `n()` read ALS strictly; outside a request scope they throw instead of silently falling back to a default locale. Cloudflare Workers need `nodejs_compat` for `AsyncLocalStorage`.
- **Server engine vs Vue engine.** Handlers use `@intlify/core`; the Vue side uses vue-i18n 11. The two share catalogs, not instances — this package never imports `vue-i18n`. Middleware is framework-mounted by `createUbeanApp`, so `src/middleware/02.i18n.ts` is not part of the convention.
- **Removed, with no compatibility layer:** `defineLocale`, `addLocale`, `mergeLocale`, `clearLocales`, `formatDate`, `formatNumber`, `formatCurrency`, `formatRelativeTime`, `formatList`, and a process-global `useI18n()` from this package. Use vue-i18n's `d` / `n` and the ALS `t()` instead.
- **Decision record:** [`docs/adr/0009-i18n-engine-and-compact-locale-routing.md`](../../docs/adr/0009-i18n-engine-and-compact-locale-routing.md). A multilingual SSG walkthrough lives in [`examples/ssg-catchall`](../../examples/ssg-catchall).
