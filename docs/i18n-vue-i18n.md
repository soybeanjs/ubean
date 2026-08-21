# ubean i18n 重设计：vue-i18n 11 + 约束前缀语言路由

> **状态图例**：⬜ 待开始 | 🔄 进行中 | ✅ 已完成 | ⏸️ 暂缓
>
> 当前整体状态：**已落地（任务全部 ✅）**。文档版本：v1.1（2026-08-21）。
>
> 决策记录：[ADR-0009](adr/0009-i18n-engine-and-compact-locale-routing.md)。词汇：[glossary.md](glossary.md)「国际化」。
>
> grilling：Q1=翻译引擎用 vue-i18n 11 + `@intlify/core`；Q2=Hono 与 vue-router 共用约束前缀。用户明确 **不做兼容**（删除自研引擎与旧 API，不保留零依赖卖点，不双引擎）。

本文是开发任务型文档（ADR-0007）：方案 + 任务清单。落地后的用户指南写进 `apps/docs`，不要把本文件搬到站点。

---

## 1. 问题

当前实现（证据见源码，不在此复述细节）把四件事绑在 `globalThis.__ubean_i18n_state__` 上：

| 层 | 今天 | 缺陷 |
| --- | --- | --- |
| 翻译引擎 | 自研 flatten + `{name}` + `\|` 复数 + `@:key` | vue-i18n 子集；无编译器、无 TS schema、无每请求实例 |
| 语言路由 | 仅 Hono 双注册 `/${locale}/path` | vue-router 仍是 `/path`；`<Link>` 本地化后 SPA 对不上 |
| 语言检测 | 用户手写 `src/middleware/02.i18n.ts` | `ubean.config.ts` 的 cookie/header 字段未接线；cookie 只读不写 |
| 语言实例 | 进程单例 `setLocale` | 并发 SSR 串 locale；客户端 `setLocale` 不加载文案、不改 URL |

`@nuxtjs/i18n` 的对照结论：它是 vue-i18n v11 的 **Nuxt 编排层**，不是另一套引擎。真正费工的是路由表、SSR 水合、懒加载投递、SEO。ubean 对齐的是这条 **切缝**，不是把模块搬过来。

---

## 2. 目标形态

```
ubean.config.ts  i18n { locales, strategy, detectBrowserLanguage, vueI18n }
        │
        ├─ compileLocalePaths()          纯函数，零 Vue
        │     ├─ @ubean/vue 虚拟路由表    约束前缀（数据注入，vue 不依赖 i18n）
        │     └─ @ubean/routes Hono       同一张 path 列表
        │
        ├─ @ubean/i18n                   框架层 + @intlify/core（Hono / API）
        │     ├─ ALS 请求级 CoreContext
        │     ├─ createI18nMiddleware    由 app 工厂按配置自动挂载
        │     └─ t() 读 ALS
        │
        └─ @ubean/client                 vue-i18n 插件层
              ├─ createI18n({ legacy: false })  每 app / 每 SSR 请求一个实例
              ├─ app.use(i18n)
              ├─ setLocale = load + cookie + navigate
              └─ useLocalePath / useSwitchLocalePath / useLocaleHead
```

`@ubean/vue` 继续零 i18n 依赖。精简 SPA 不启用语言路由；框架层把 `compileLocalePaths` 的结果作为 **纯数据** 传进 `generatePagesModuleSource`。

---

## 3. 决策（最佳实现，无兼容层）

### 3.1 引擎

| 项 | 决定 |
| --- | --- |
| Vue | `vue-i18n@^11.4.8`，`createI18n({ legacy: false })`。v11 默认 `legacy: true`，**必须显式关掉**，否则 SSR `useI18n` 译空 |
| 非 Vue | `@intlify/core`：`createCoreContext` + `translate` / `datetime` / `number`。不要为 handler 拉 `vue-i18n` |
| 体积发行 | **完整 `vue-i18n`**，不用 `petite-vue-i18n`（默认扁平 key，打断嵌套 `user.name`） |
| 版本 | 钉 11。v12 仍是 alpha（删 Legacy / `v-t`），不跟 |
| Node | 与 vue-i18n 11 对齐 `engines.node: >= 22` |
| 实例 | 客户端一个 Vue app 一个；SSR **每个请求** `createI18n`。共享的是编译后的 messages 表，不是 Composer |
| 依赖形态 | `@ubean/i18n` **hard** `@intlify/core`；`@ubean/client` **hard** `vue-i18n`（i18n 是内置能力，不是 Pinia 那种可选扩展） |
| 单实例 | Vite `resolve.alias['vue-i18n']` 钉到 `@ubean/client` 解析到的那一份，避免 pnpm 双拷贝（Nuxt [#2243](https://github.com/nuxt-modules/i18n/issues/2243)） |
| 自动导入 | `useI18n` / `t` 从 `ubean/runtime/vue` 导入（内部 re-export 已 alias 的 vue-i18n），**禁止**用户再直连另一份 `vue-i18n` |

消息语法保持 Intlify 默认（**不是 ICU**）：`{name}`、`@:key`、`a \| b \| {n} c`。与现有 `src/locales/*.json` 同构，文案文件不用迁。不把 ICU 当第一期目标。

### 3.2 语言路由（约束前缀）

`compileLocalePaths(path, cfg)` 返回 `{ path, locale, isDefault }[]`。Hono `app.on` 与 vue-router `RouteRecordRaw.path` 用同一结果。

以 `defaultLocale: 'en'`、`locales: ['en','zh']`、页面 `/about` 为例：

| strategy | 生成的 path |
| --- | --- |
| `prefix_except_default` | `/about`（en）、`/:locale(zh)/about`（zh） |
| `prefix` | `/:locale(en\|zh)/about`；`/` 不是有效页，检测中间件 302 到 `/{preferred}` |
| `prefix_and_default` | `/about`（en 规范）、`/:locale(en\|zh)/about`（en 带前缀也接受，SEO canonical 指向无前缀） |
| `no_prefix` | `/about` 仅一条；locale 只来自 cookie/header |

约束：首段 **仅当** 命中已注册 `code` 才当 locale。`pages/[id].vue` 的 `/zh` 若 `zh` 是 locale code 则走语言前缀，不再当 `id`。locale code 是保留段，写进文档。

vue-router **同名一条**：`name` 仍是页面名（`About`），locale 在 `params.locale`（缺省 = defaultLocale）。不要 `About___zh`。并行路由 / 拦截路由 / reuse / 404 catch-all 一律套同一编译器：

- 404：`/:pathMatch(.*)*` + `/:locale(zh)/:pathMatch(.*)*`（按 strategy 裁剪）
- intercept：`__intercept_*` 的 path 同样加约束前缀
- file mode `routes.ts` 生成器走同一注入口

`<Link>` 继续经 `LOCALIZE_PATH_KEY` 调 `localePath`；此时 `localePath('/about')` 对 zh 返回 `/zh/about`，vue-router **能匹配**。

### 3.3 框架 `setLocale`

```
setLocale(code):
  1. loadLocaleMessages(code)     // 动态 import，已加载则跳过
  2. i18n.global.locale.value = code
  3. 写 cookie（cookieName）
  4. router.replace(switchLocalePath(code))   // no_prefix 跳过导航
```

vue-i18n 的 `locale.value = x` 不导出为公共 API。语言切换按钮必须走框架 `setLocale`。

### 3.4 检测与 cookie

中间件由 `createUbeanApp` **按配置自动挂载**（不再要求 `src/middleware/02.i18n.ts`）。

顺序（有前缀的 strategy）：

1. URL 约束前缀命中 → 该 locale，**写 cookie**
2. 否则若允许检测：cookie → `Accept-Language` → `defaultLocale`
3. `redirectOn: 'root'`（默认，SEO）：只在 `/` 上 302；已是内容路径则不因 header 改 URL
4. `redirectOn: 'all'`：无前缀内容路径也可 302（`prefix` 策略访问无前缀时仍必须 302，与 `redirectOn` 无关）

`no_prefix`：永不改 URL；只 set locale + cookie。

删除「用户 middleware 里 `setI18nConfig` 与 config 两份真相」。

### 3.5 文案加载

- 约定仍是 `src/locales/**/*.{json,json5,yaml,yml,ts,js}`
- `ubean:locales` 导出 `loadLocale(code)` / `localeCodes`，**禁止**启动时 `await` 全部文件
- SSR：当前 locale + `fallbackLocale`；`__UBEAN_LOCALE__` 只序列化这两份（可 JSON 的 messages）
- 客户端水合：用 payload 灌进 `createI18n({ messages })`；切换时再 `loadLocale`
- 不实现 `/_i18n/:hash/messages.json`（Nuxt v10 蓝绿/CDN 坑，见 [nuxt-modules/i18n#3970](https://github.com/nuxt-modules/i18n/issues/3970)）

### 3.6 SEO（第一期就做自动，因为「最佳」且输入已是路由表）

SSR HTML shell 自动：

- `<html lang>` 用 locale 的 `language`（BCP 47，缺省回退 `code`）
- `<html dir>`
- `link rel="alternate" hreflang`（含语言组 catchall 与 `x-default` → defaultLocale）
- `prefix_and_default` 的 canonical 指向 **无前缀** 默认 URL
- `og:locale` / `og:locale:alternate`（`-` → `_`）

需要 `baseUrl`（`i18n.baseUrl` 或站点 URL）。无 `baseUrl` 时 hreflang 用相对路径并在 dev warn。

公开 `useLocaleHead()` 供运行时切换后更新 head；首屏不要求用户手调。

### 3.7 配置

全部进 `ubean.config.ts` 的 `i18n`。**不**增加 `src/i18n.config.ts`（Nuxt 每请求 merge 会拖 TTFB）。

```ts
i18n: false | {
  defaultLocale: string;
  locales: Array<string | {
    code: string;
    language?: string;      // BCP 47，hreflang / html lang
    name?: string;
    dir?: 'ltr' | 'rtl';
    files?: string[];       // 相对 locales 目录；默认按 code 扫描
  }>;
  strategy?: 'prefix' | 'prefix_except_default' | 'prefix_and_default' | 'no_prefix';
  baseUrl?: string;
  detectBrowserLanguage?: false | {
    cookieName?: string;    // 默认 ubean_locale
    redirectOn?: 'root' | 'all';
    alwaysRedirect?: boolean;
  };
  vueI18n?: {
    fallbackLocale?: string;
    fallbackWarn?: boolean;
    missingWarn?: boolean;
    datetimeFormats?: object;
    numberFormats?: object;
    modifiers?: object;
    escapeParameter?: boolean;
  };
}
```

默认：`strategy: 'prefix_except_default'`，`detectBrowserLanguage.redirectOn: 'root'`。`i18n: false` 或 `src/locales` 为空且未配多 locale → 不挂中间件、不改路由表。

字符串 `locales: ['en','zh']` 在 loader 里正规化为 `{ code }` 对象。

### 3.8 删除的 API / 行为

不做兼容层，下列从包导出、文档、自动导入、示例中删除：

- 自研引擎：`defineLocale`、`addLocale`、`mergeLocale`、`clearLocales`、进程级 `useI18n()`（`@ubean/i18n` 那份）、`formatDate` / `formatNumber` / `formatCurrency` / `formatRelativeTime` / `formatList`（改用 vue-i18n `d`/`n`）
- 双份 `switchLocalePath`（core vs routing vs client）→ 只留 composable + 服务端纯函数各一个，签名统一为 `(locale, path, cfg)`
- `getLocalePath(c)` 名实不符 → 改为 `getRequestLocale(c)`
- 用户必须手写 `02.i18n.ts` 才能工作的约定（CLI unify 模板删掉这段）
- AGENTS / 站点中的「零依赖 i18n、不引入 vue-i18n」
- 文档中不存在的 `<Link locale>` prop（要么本轮实现 `locale` prop 调 `localePath(to, locale)`，要么删文档；**实现该 prop**，因为有了真路由后它有意义）

保留并成为唯一表面：

| API | 从哪来 |
| --- | --- |
| `useI18n` / `t` / `d` / `n` / `tm` | vue-i18n（经 `ubean/runtime/vue`） |
| `useLocalePath` / `useSwitchLocalePath` / `useLocaleRoute` | `@ubean/client` |
| `setLocale` | `@ubean/client`（框架语义） |
| `useLocaleHead` | `@ubean/client` |
| `t`（handler） | `ubean/runtime/i18n`（ALS） |
| `compileLocalePaths` / `createI18nMiddleware` | `@ubean/i18n` |

### 3.9 明确不做（后续另开任务）

- per-locale custom paths（`/about` → `/a-propos`）
- `differentDomains` / `multiDomainLocales`
- 消息 CDN / hash endpoint
- SFC `<i18n>` 块（`@intlify/unplugin-vue-i18n` 第一期只编译 `src/locales`，块作为 I18N-07 可选项）
- IP 地理检测、query `?lang=`
- vue-i18n Legacy / `v-t`（v11 deprecated）

---

## 4. 包边界与改动面

| 包 | 职责变化 |
| --- | --- |
| `@ubean/i18n` | 删除自研引擎。保留 routing/detection/ALS/`compileLocalePaths`。hard 依赖 `@intlify/core`。可去掉对完整 `hono` 的硬依赖（类型从 `@ubean/shared` 取），若去掉需测 |
| `@ubean/client` | 删除 `localeRef` hack。`createI18n` + `app.use`。hard `vue-i18n`。框架 composable + `setLocale` |
| `@ubean/vue` | `generatePagesModuleSource(input, { localePaths? })` 可选数据；`Link` 增加可选 `locale` prop。**不** import `@ubean/i18n` |
| `@ubean/routes` | `getLocalePrefixedPaths` 换成 `compileLocalePaths`；渲染前 ALS 已有 locale；`renderContext` 从实例读 messages |
| `@ubean/app` | 读 resolved `i18n`，自动 `app.use(createI18nMiddleware)`（挂在用户 middleware 之前） |
| `@ubean/builder` / `@ubean/vite` | 虚拟模块改 lazy `loadLocale`；alias `vue-i18n`；接入 unplugin；server entry 不再 `loadLocales()` 全量 |
| `@ubean/config` | 新 `i18n` 类型与正规化（string[] → LocaleObject[]） |
| `@ubean/pages` / `@ubean/ssr` | payload 带 `messages` + `fallbackMessages`；htmlAttrs 用 `language` |
| `@ubean/codegen` | 自动导入表改源；去掉旧 `defineLocale` |
| `@ubean/cli` | unify 模板删手写 i18n middleware |
| `ubean` 主包 | `runtime/i18n` 改为 ALS + core；不要把 Vue `useI18n` 从主入口导出 |
| `examples/ubean-test` | 删 `02.i18n.ts`；切换器用 `setLocale`；加 SPA 导航 `/zh/about` 断言 |
| `apps/docs` | guide/reference/framework-comparison 重写 |

---

## 5. SSR / 水合时序

1. Hono 中间件：检测 locale → 写 cookie（如需要）→ 可能 302 → `ALS.run({ locale, ctx })`
2. `loadLocale(locale)` + `loadLocale(fallback)`（服务端模块缓存）
3. 页面渲染：`createI18n({ locale, fallbackLocale, messages, legacy: false })` → `createUbeanSSRApp` 里 `app.use(i18n)`
4. HTML：`__UBEAN_LOCALE__` + `lang`/`dir` + hreflang
5. 客户端：`createI18n` 用 payload 的 locale/messages 创建（**与 SSR 同一 locale**，禁止在 hydrate 前读 `navigator`）
6. `app:mounted` 之后才允许 `detectBrowserLanguage` 在 `no_prefix` 下纠偏（对齐 Nuxt `ssg-detect`：SSG 尤其不能首屏改语言）

并发验收：两个 overlapping 请求 `/zh/about` 与 `/en/about` 不得串译。用 ALS + 每请求 `createI18n` 保证；包内加并行测。

---

## 6. 任务清单

> 波次内可并行；波次间有依赖。每项独立 PR 更好 review。状态在本表更新。

### 波次 A — 契约（不换引擎也能合，但本轮按新类型写，旧引擎随后删）

| ID | 任务 | 包 | 验收 | 状态 |
| --- | --- | --- | --- | --- |
| I18N-01 | `UbeanConfig.i18n` 新类型 + loader 正规化（LocaleObject、`detectBrowserLanguage`、`vueI18n`、`i18n: false`） | `config` | 单测：string[] 正规化、默认 `redirectOn: 'root'`、`false` 关闭 | ✅ |
| I18N-02 | 实现 `compileLocalePaths` + `extractLocaleFromPath`（白名单 code）+ 四种 strategy 金样 | `i18n` | 包内单测覆盖 §3.2 表；`prefix_and_default` 与 `prefix_except_default` **不再同实现** | ✅ |

### 波次 B — 语言路由（vue-router 与 Hono 对齐）

| ID | 任务 | 包 | 验收 | 状态 |
| --- | --- | --- | --- | --- |
| I18N-03 | `generatePagesModuleSource` 接收 `localeRecords`，为每页/拦截/404 写入约束前缀；file mode `routes.ts` 同步 | `vue`、`vite`、`builder` | 虚拟模块快照：`/about` + `/:locale(zh)/about`；vue 包仍无 `@ubean/i18n` import | ✅ |
| I18N-04 | `registerPageRoutes` 改用 `compileLocalePaths`，删除手写 `getLocalePrefixedPaths` | `routes`、`app` | `/zh/about` 与 `/about` 均 200；`prefix_except_default` 下 `/en/about` 302 到 `/about`（Hono 表不注册 `/en/about`） | ✅ |
| I18N-05 | `Link` 增加 `locale` prop；`LOCALIZE_PATH_KEY` 签名 `(path, locale?) => string` | `vue`、`client` | 单测：无 inject 时透传；有 inject 时按 locale 前缀 | ✅ |

### 波次 C — 换引擎

| ID | 任务 | 包 | 验收 | 状态 |
| --- | --- | --- | --- | --- |
| I18N-06 | 删除自研引擎；`@ubean/i18n` 改为 `@intlify/core` + ALS；`ubean/runtime/i18n` 的 `t()` 读 ALS | `i18n`、`ubean` | 无 `__ubean_i18n_state__`；并行测两个 locale 不串；Workers 无 ALS 时的降级策略写进注释（请求上下文 `c.get('locale')` 必达） | ✅ |
| I18N-07 | `@ubean/client`：`createI18n({ legacy: false })` per app/request，`app.use(i18n)`；删除 `localeRef`；re-export `useI18n` | `client` | SSR 与 CSR `t('x')` 走 vue-i18n；hydrate 不 mismatch | ✅ |
| I18N-08 | 依赖与 alias：catalog 钉 `vue-i18n` / `@intlify/core`；Vite alias；`engines.node` | `client`、`i18n`、`vite`、根 package | `pnpm why vue-i18n` 单份；构建 resolve 到 runtime 构建 | ✅ |

### 波次 D — 运行时 UX

| ID | 任务 | 包 | 验收 | 状态 |
| --- | --- | --- | --- | --- |
| I18N-09 | `ubean:locales` 改为 `loadLocale(code)`；SSR 只预载当前+fallback | `builder`、`dev-server`、`production` | 切 zh 才拉取 zh chunk；server entry 无全量 `loadLocales()` | ✅ |
| I18N-10 | 框架 `setLocale`：load + cookie + `router.replace`；`no_prefix` 不导航 | `client` | e2e：点中文 → URL `/zh/...` 且文案变中文 | ✅ |
| I18N-11 | `createUbeanApp` 自动挂载检测中间件；cookie **写**；`redirectOn: 'root'` | `app`、`i18n` | 无 `02.i18n.ts` 时检测仍工作；`/` 可 302，`/about` 不因 Accept-Language 302 | ✅ |

### 波次 E — SEO 与编译

| ID | 任务 | 包 | 验收 | 状态 |
| --- | --- | --- | --- | --- |
| I18N-12 | 自动 hreflang / canonical / og:locale；`useLocaleHead` | `client`、`pages`、`ssr`、`seo` | `/zh/about` HTML 含 `hreflang="zh-CN"` 与 `x-default`；`prefix_and_default` canonical 无前缀 | ✅ |
| I18N-13 | `@intlify/unplugin-vue-i18n`：`include: locales/**`，`ssr: true`，`compositionOnly: true` | `vite` | 生产 runtime-only；dev 可编译；可选 SFC `<i18n>` 默认关 | ✅ |
| I18N-14 | `DefineLocaleMessage` 类型：从默认 locale JSON 生成或用户 module augmentation 文档 | `codegen` | `t('missing')` 在 typed 模式下报错（至少文档 + 一种生成路径） | ✅ |

### 波次 F — 清理、测试、文档

| ID | 任务 | 包 | 验收 | 状态 |
| --- | --- | --- | --- | --- |
| I18N-15 | 删除旧导出与 CLI 模板；codegen 自动导入表 | `ubean`、`codegen`、`cli` | `tsc` 无旧符号；unify 项目无 i18n middleware 样板 | ✅ |
| I18N-16 | `@ubean/i18n` 包内单测补齐（今日为零）；middleware 302/cookie/header；并发 SSR | `i18n`、`client`、`routes` | 包内测覆盖检测矩阵；不再只测「返回 function」 | ✅ |
| I18N-17 | `examples/ubean-test`：删 `02.i18n.ts`；e2e 加 SPA `/zh/about` 与切换后 URL | `examples`、`test/browser` | spec 04 按新语义改写 | ✅ |
| I18N-18 | 用户文档：`apps/docs` guide/reference/zh+en；framework-comparison 去掉「零依赖」；**同步 AGENTS.md §3.4 / §4 i18n 表 / 陷阱「不引入 vue-i18n」** | `apps/docs`、`AGENTS.md`、`skills` | AGENTS 与源码一致；站点不再教 `defineLocale` | ✅ |

---

## 7. 建议实施顺序与风险

**顺序**：A → B 与 C 可部分并行（C 的删除旧 `localizePath` 前 B 必须先切到 `compileLocalePaths`）→ D → E → F。不要先换引擎却仍用 vue-router 无前缀表，否则 `<Link>` 会暂时更坏。

**最大风险**：

1. 约束前缀 vs 动态 `[id]` 抢首段——用 code 白名单，文档写清保留段。
2. vue-router 可选前缀与 catch-all 404 的匹配顺序——locale 前缀记录必须登记在 catch-all 之前（现有 Hono 已如此，vue 侧要对齐）。
3. ALS 在 Cloudflare Workers：优先 `AsyncLocalStorage` polyfill / 请求对象存储；`t()` 无 ALS 时抛明确错误，禁止回落全局 locale。
4. pnpm 双份 vue-i18n——I18N-08 必须先于示例 e2e。

**非风险（刻意不做）**：custom path、多域名、消息 CDN。有产品需求再开新 ADR。

---

## 8. 验收总闸（全部任务完成后）

- 并发两个 locale 的 SSR HTML 文案互不污染。
- 客户端打开 `/zh/about` 水合后仍是中文；`router.push('/about')` 在 zh 下经 `Link` 走到 `/zh/about` 且页面匹配成功。
- `setLocale('en')` 回到无前缀 URL（`prefix_except_default`）。
- 无用户 i18n middleware 文件时，config 仍生效。
- 主入口 `import { useI18n } from 'ubean'` 不存在（避免浏览器预构建服务端依赖）；客户端走 `ubean/runtime/vue`。
- `pnpm typecheck` / `pnpm test` / spec 04 e2e 通过。
- AGENTS.md 不再写「零依赖 / 不引入 vue-i18n」。
