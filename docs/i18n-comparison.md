# i18n 方案对比与重构方向

> 对比 nuxt-i18n-micro、@nuxtjs/i18n、vue-i18n、i18next 四大方案，结合 ubean 现状，确定 i18n 重构方向。

## 一、四方架构总览

### 1. nuxt-i18n-micro (s00d/nuxt-i18n-micro)

**定位**: Nuxt 专用的高性能 i18n 模块，针对 @nuxtjs/i18n v9/v10 的性能问题重新设计，**完全弃用 vue-i18n**，自研轻量运行时。

**架构分层**:

```
@i18n-micro/types            类型定义
@i18n-micro/core             核心逻辑 (plural, strategy 判断)
@i18n-micro/route-strategy   构建时路由生成 (RouteGenerator)
@i18n-micro/path-strategy    运行时路由策略 (Strategy 类)
@i18n-micro/hmr              HMR 插件生成
@i18n-micro/utils            构建工具 (preMerge, payload)
nuxt-i18n-micro              Nuxt 模块 + 运行时插件
```

**翻译加载流程**:

1. 构建时: `preMergeLocales()` 将所有 layer 的翻译合并到 `buildDir/i18n-merged/`
2. 服务端: 通过 `/_locales/:locale/:route` API 按需加载翻译
3. 客户端: SSR chunks 注入初始翻译 → 路由切换时异步加载新翻译
4. 缓存: LRU (cacheMaxSize) + TTL (cacheTtl) 双重缓存

**核心 API**:

- `$t(key, params?, defaultValue?)` — 返回 `CleanTranslation` (string | object)
- `$ts(key, params?, defaultValue?)` — 返回纯 string
- `$_t(route)(key, params?)` — 路由作用域翻译
- `$tn(value, options?)` — 数字格式化
- `$td(value, options?)` — 日期格式化
- `$tdr(value, options?)` — 相对时间
- `$has(key)` — key 是否存在
- `$switchLocale(locale)` / `$switchLocalePath(locale)` / `$switchLocaleRoute(locale)`
- `$localePath(to, locale?)` / `$localeRoute(to, locale?)`
- `$mergeTranslations(translations)` — 运行时合并
- `$setI18nRouteParams(params)` — 动态路由参数按 locale 设置
- `$setMissingHandler(handler)` — 自定义缺失 key 处理
- `defineI18nRoute()` — 路由级 i18n 配置宏

### 2. @nuxtjs/i18n (nuxt-modules/i18n) v10

**定位**: Nuxt 官方 i18n 模块，**基于 vue-i18n v11 封装**，功能最全面但性能较差。是 nuxt-i18n-micro 的对标对象。

**架构分层**:

```
vue-i18n v11                底层 i18n 库 (Composition API + 预编译)
  └─ @intlify/message-compiler   消息预编译器 (JSON → AST 函数)
  └─ @intlify/core-base          框架无关核心
@nuxtjs/i18n v10            Nuxt 模块层
  ├─ runtime/plugins         运行时插件 (路由/SEO/状态)
  ├─ runtime/composables     useI18n/useLocaleHead/localePath...
  ├─ runtime/components      <NuxtLinkLocale>, <i18n-t>
  └─ runtime/transformers    defineI18nRoute 宏转换
```

**翻译加载流程**:

1. 构建时: `@intlify/message-compiler` 将消息预编译为 AST 函数
2. 配置 `file`/`files` 时启用懒加载: 动态 import + `mergeLocaleMessage`
3. `defineI18nLocale(locale)` 支持从 API/后端异步加载
4. v10 起 `lazy` 选项移除，**所有 locale 文件默认懒加载**
5. 服务端静态消息缓存 (`httpCacheDuration`)

**核心特性**:

- 4 种路由策略: `no_prefix` / `prefix_except_default` / `prefix` / `prefix_and_default`
- 浏览器语言检测: cookie + `redirectOn` (root/all/no prefix)
- 多域名支持: `differentDomains` + `multiDomainLocales`
- SEO 标签本地化: hreflang / canonical / og:locale (via `useLocaleHead`)
- 自定义路径: `defineI18nRoute()` 宏 / `definePageMeta` / config `pages`
- 类型安全: `typedPages` (路由类型) + `typedOptionsAndMessages` (消息类型)
- 服务端 locale 检测器: `defineI18nLocaleDetector()`
- Bundle 优化: `compositionOnly` / `runtimeOnly` / `dropMessageCompiler`
- SFC `<i18n>` 块支持 (via `@intlify/unplugin-vue-i18n`)
- `<i18n-t>` / `<i18n-d>` / `<i18n-n>` 组件 + `v-t` 指令
- Layer 支持 (Nuxt layers 配置合并)
- HMR (v10 默认启用)
- 页面过渡: `skipSettingLocaleOnNavigate` + `finalizePendingLocaleChange`

**核心 API**:

- `useI18n()` — vue-i18n Composition API (t/te/tm/d/n/rt...)
- `useLocaleHead()` — SEO head 标签
- `useLocalePath()` / `useLocaleRoute()` — 本地化路由
- `useSwitchLocalePath()` — 切换 locale 路径
- `setLocale(locale)` / `loadLocaleMessages(locale)`
- `<NuxtLinkLocale>` — 本地化链接组件
- `defineI18nRoute()` — 路由级 i18n 配置宏
- `defineI18nLocale()` — 懒加载 locale 定义
- `defineI18nConfig()` — vue-i18n 配置

### 3. vue-i18n (intlify/vue-i18n) v11

**定位**: Vue.js 官方 i18n 插件，功能全面但性能较重。是 @nuxtjs/i18n 的底层依赖。

**架构分层**:

```
@intlify/shared              共享工具
@intlify/message-compiler    消息编译器 (预编译为 AST)
@intlify/core-base           框架无关核心
@intlify/core                Vue 核心层
vue-i18n                     Vue 插件 (Composition + Legacy API)
petite-vue-i18n              轻量版 (仅 Composition API)
```

**翻译加载流程**:

1. 消息在构建时被 `@intlify/message-compiler` 预编译为 AST 函数
2. 运行时直接执行 AST 函数，无需解析消息字符串
3. 支持手动 lazy loading (动态 import + `mergeLocaleMessage`)

**核心特性**:

- 消息格式: `{name}` 命名插值, `{0}` 列表插值, `{'literal'}` 字面量
- 链接消息: `@:key` + 修饰器 (`@.lower:`, `@.upper:`, `@.capitalize:`, 自定义)
- 复数: `{count} {plural}` 格式
- 转义序列: `\{`, `\}`, `\@`, `\|`, `\\`
- 作用域: global scope vs local scope (组件级)
- 消息函数: 可编程的消息 (返回函数而非字符串)
- SFC 自定义块: `<i18n>` 标签在 .vue 文件中
- 组件: `<i18n-t>` 组件插值
- 指令: `v-t`
- 预定义格式: datetimeFormats, numberFormats

### 4. i18next (i18next/i18next)

**定位**: 框架无关的通用 i18n 核心，插件生态最丰富，不绑定任何框架。

**架构分层**:

```
i18next core                 核心库 (事件驱动, 插件系统)
  ├─ Backend plugins         i18next-http-backend, i18next-node-fs-backend...
  ├─ LanguageDetector        i18next-browser-languagedetector
  ├─ Cache plugins           i18next-localstorage-backend, i18next-chained-backend
  ├─ PostProcessor           i18next-sprintf-postprocessor...
  └─ Framework bindings      react-i18next, vue-i18next, angular-i18next...
```

**翻译加载流程**:

1. `init()` 时通过 backend plugin 异步加载翻译
2. 支持 namespace 级别懒加载: `loadNamespaces(['common', 'page'])`
3. `changeLanguage()` 时自动加载新语言的翻译
4. 缓存层: localStorage / chained backend

**核心特性**:

- Namespace: `ns:key` 语法, 多命名空间, 默认命名空间
- `getFixedT(lng, ns, keyPrefix)` — 绑定 t 函数到特定语言/命名空间
- `exists(key)` — key 是否存在
- Context: `key_context` 上下文相关翻译
- 嵌套: `$t(key)` 消息内嵌套
- 插值: `{{name}}` (可配置前后缀)
- Fallback 链: `en-US → en → fallbackLng`
- `cloneInstance()` — 独立实例
- TypeScript selector: `t($ => $.key)` 类型安全
- 插件 `use()` 注册: backend, detector, cache, postProcessor

---

## 二、功能对比矩阵

| 功能                  |     nuxt-i18n-micro      |         @nuxtjs/i18n          |    vue-i18n     |       i18next       |   ubean 现状   |
| --------------------- | :----------------------: | :---------------------------: | :-------------: | :-----------------: | :------------: |
| **翻译核心**          |                          |                               |                 |                     |                |
| 命名插值 `{name}`     |            ✅            |              ✅               |       ✅        |    ✅ `{{name}}`    |       ✅       |
| 列表插值 `{0}`        |            ❌            |              ✅               |       ✅        |         ✅          |       ❌       |
| 链接消息 `@:key`      |            ❌            |              ✅               |   ✅ +修饰器    |      ✅ `$t()`      |  ✅ 无修饰器   |
| 嵌套翻译              |            ❌            |              ✅               |       ✅        |         ✅          |       ❌       |
| Context 翻译          |            ❌            |              ❌               |       ❌        |         ✅          |       ❌       |
| 消息预编译            |            ❌            |            ✅ AST             |     ✅ AST      |         ❌          |       ❌       |
| 消息函数              |            ❌            |              ✅               |       ✅        |         ❌          |       ❌       |
| 转义序列              |            ❌            |              ✅               |       ✅        |         N/A         |       ❌       |
| **复数**              |                          |                               |                 |                     |                |
| `\|` 分隔符           |            ✅            |              ✅               |       ✅        |         ✅          |       ✅       |
| `=0`/`=1` 显式        |            ✅            |              ✅               |       ✅        |         ✅          |       ✅       |
| ICU plural rules      |         ✅ Intl          |            ✅ Intl            |     ✅ Intl     |      ✅ 自定义      |    ✅ Intl     |
| 自定义 plural 函数    |   ✅ `options.plural`    |              ❌               |       ❌        |         ✅          |       ❌       |
| **格式化**            |                          |                               |                 |                     |                |
| 日期 `$d`/`$td`       |            ✅            |              ✅               |       ✅        |      ❌ 需插件      |       ✅       |
| 数字 `$n`/`$tn`       |            ✅            |              ✅               |       ✅        |      ❌ 需插件      |       ✅       |
| 货币                  |       ✅ via `$tn`       |          ✅ via `$n`          |   ✅ via `$n`   |         ❌          |    ✅ `c()`    |
| 相对时间              |        ✅ `$tdr`         |              ❌               |       ❌        |         ❌          |       ✅       |
| 列表格式              |            ❌            |              ❌               |       ❌        |         ❌          |  ✅ `list()`   |
| **加载机制**          |                          |                               |                 |                     |                |
| 全量加载              |            ✅            |              ✅               |       ✅        |         ✅          |       ✅       |
| 按需懒加载            |          ✅ API          |       ✅ `file`/`files`       |     ✅ 手动     |     ✅ backend      |       ❌       |
| 页面级翻译            |         ✅ 自动          |              ❌               |       ❌        |    ✅ namespace     |       ❌       |
| Namespace             |            ❌            |              ❌               |       ❌        |         ✅          |       ❌       |
| 翻译缓存              |        ✅ LRU+TTL        |          ✅ HTTP缓存          |       ❌        |   ✅ localStorage   |       ❌       |
| SSR chunks            |            ✅            |              ❌               |       ❌        |         ❌          |       ❌       |
| HMR                   |            ✅            |          ✅ v10默认           |       ❌        |         ❌          |       ❌       |
| Pre-merge layers      |            ✅            |        ✅ Nuxt layers         |       ❌        |         ❌          |       ❌       |
| 多文件合并            |            ❌            |        ✅ `files` 数组        |       ❌        |         ❌          |       ❌       |
| **路由**              |                          |                               |                 |                     |                |
| no_prefix             |            ✅            |              ✅               |       ❌        |         ❌          |       ✅       |
| prefix                |            ✅            |              ✅               |       ❌        |         ❌          |       ✅       |
| prefix_except_default |            ✅            |              ✅               |       ❌        |         ❌          |       ✅       |
| prefix_and_default    |            ✅            |              ✅               |       ❌        |         ❌          |       ❌       |
| 路由级 i18n 配置      |   ✅ `defineI18nRoute`   |     ✅ `defineI18nRoute`      |       ❌        |         ❌          |       ❌       |
| 动态路由参数          | ✅ `$setI18nRouteParams` |         ✅ 自定义路径         |       ❌        |         ❌          |       ❌       |
| `switchLocalePath`    |            ✅            |              ✅               |       ❌        |         ❌          |       ✅       |
| `localePath`          |            ✅            |              ✅               |       ❌        |         ❌          |       ✅       |
| 多域名路由            |            ❌            |     ✅ `differentDomains`     |       ❌        |         ❌          |       ❌       |
| **Vue 集成**          |                          |                               |                 |                     |                |
| Composition API       |      ✅ `useI18n()`      |        ✅ `useI18n()`         | ✅ `useI18n()`  |    ❌ 需wrapper     | ✅ `useI18n()` |
| Legacy API            |            ❌            |         ✅ (v11弃用)          |       ✅        |         ❌          |       ❌       |
| SFC `<i18n>` 块       |            ❌            |              ✅               |       ✅        |         ❌          |       ❌       |
| `<i18n-t>` 组件       |            ✅            |              ✅               |       ✅        |         ❌          |       ❌       |
| `v-t` 指令            |            ❌            |         ✅ (v11弃用)          |       ✅        |         ❌          |       ❌       |
| 响应式 locale         |            ✅            |              ✅               |       ✅        |    ❌ 需wrapper     |       ✅       |
| **SEO**               |                          |                               |                 |                     |                |
| hreflang 标签         |      ✅ `meta:true`      |      ✅ `useLocaleHead`       |       ❌        |         ❌          |       ❌       |
| canonical URL         |            ✅            |              ✅               |       ❌        |         ❌          |       ❌       |
| og:locale             |            ✅            |              ✅               |       ❌        |         ❌          |       ❌       |
| **其他**              |                          |                               |                 |                     |                |
| Fallback 链           |         ✅ 单级          |            ✅ 多级            |     ✅ 多级     |       ✅ 多级       |    ✅ 单级     |
| `exists()`            |        ✅ `$has`         |              ❌               |       ❌        |         ✅          |       ❌       |
| `getFixedT()`         |            ❌            |              ❌               |       ❌        |         ✅          |       ❌       |
| Missing handler       |            ✅            |              ✅               |       ✅        |         ✅          |       ✅       |
| RTL 支持              |            ✅            |              ✅               |       ✅        |         ❌          |       ✅       |
| 浏览器语言检测        | ✅ `autoDetectLanguage`  |  ✅ `detectBrowserLanguage`   |       ❌        |       ✅ 插件       |       ✅       |
| 插件系统              |            ❌            |              ❌               |       ❌        |         ✅          |       ❌       |
| TypeScript key 推断   |            ❌            | ✅ `typedOptionsAndMessages`  |       ✅        |     ✅ selector     |       ❌       |
| TypeScript 路由类型   |            ❌            |        ✅ `typedPages`        |       ❌        |         ❌          |       ❌       |
| 服务端 locale 检测器  |            ❌            | ✅ `defineI18nLocaleDetector` |       ❌        |         ❌          |       ❌       |
| 独立实例              |            ❌            |              ❌               | ✅ `createI18n` | ✅ `createInstance` |       ❌       |

---

## 三、性能对比

> 基于 nuxt-i18n-micro 官方基准测试 (10MB 翻译文件，相同硬件)

| 指标               | nuxt-i18n-micro | @nuxtjs/i18n v10 |     vue-i18n v11 |    i18next |       ubean 现状 |
| ------------------ | --------------: | ---------------: | ---------------: | ---------: | ---------------: |
| 构建时间           |          14.95s |           82.26s |      (同@nuxtjs) |        N/A |   ~5s (无预编译) |
| 代码包体积         |         1.48 MB |         19.24 MB | ~19MB (含编译器) | ~50KB core |            ~30KB |
| 构建内存           |        1,175 MB |         9,117 MB |      (同@nuxtjs) |        N/A |               低 |
| 运行时内存         |          275 MB |         1,095 MB |               低 |         低 |               低 |
| 平均响应时间       |          437 ms |         1,177 ms |              N/A |        N/A | ~50ms (无懒加载) |
| RPS                |             278 |               51 |              N/A |        N/A |      高 (全内存) |
| vs plain-nuxt 基线 |   +8.45s/+131KB | +75.76s/+17.89MB |              N/A |        N/A |              N/A |

**关键发现**:

- @nuxtjs/i18n v10 比 nuxt-i18n-micro 慢 5.5x 构建、3.9x 响应、5.4x 内存
- @nuxtjs/i18n 的性能瓶颈源于 vue-i18n 的消息预编译 + 全量路由生成
- ubean 现状性能尚可（全内存翻译），但缺乏懒加载导致首屏 payload 大

---

## 四、优缺点总结

### nuxt-i18n-micro

**优点**:

- 性能极佳 (构建/运行时/包体积全面领先 @nuxtjs/i18n)
- 页面级翻译按需加载，首屏最小化
- SSR chunks 机制优雅解决 hydration 问题
- 翻译缓存 LRU+TTL，适合高流量场景
- 路由策略完善 (4种 + 路由级配置)
- HMR 支持，开发体验好
- Pre-merge layers，多项目翻译合并
- 完全弃用 vue-i18n，无预编译开销

**缺点**:

- 与 Nuxt 深度耦合 (依赖 `#app`, `#imports`, `#build`)
- JSON only，不支持 JS/TS/函数消息
- 无消息预编译，运行时解析
- 无 namespace
- 无 SFC 集成
- 无 TypeScript key 推断
- 无多域名路由支持
- 内部包拆分过细 (7个 @i18n-micro/\* 包)
- 第三方维护 (非官方)，生态较小

### @nuxtjs/i18n v10

**优点**:

- **Nuxt 官方模块**，维护活跃 (v10.4.0, 2026-05)
- 功能最全面 (路由/SEO/多域名/类型/检测器)
- 基于 vue-i18n，消息预编译性能好 (运行时)
- 4 种路由策略 + `prefix_and_default`
- 完善的 SEO 集成 (hreflang/canonical/og:locale)
- 多域名支持 (`differentDomains`/`multiDomainLocales`)
- TypeScript 类型安全 (路由类型 + 消息类型)
- 服务端 locale 检测器 (`defineI18nLocaleDetector`)
- SFC `<i18n>` 块 + `<i18n-t>` 组件 + `v-t` 指令
- Layer 支持 (Nuxt layers 配置合并)
- 多文件懒加载 (`files` 数组，支持方言合并)
- 浏览器语言检测完善 (cookie/redirectOn/crossOrigin)
- 页面过渡支持 (`skipSettingLocaleOnNavigate`)

**缺点**:

- **性能差** (构建慢 5.5x、包大 13x、内存高 8x vs micro)
- 强依赖 vue-i18n (版本耦合，v11 弃用 Legacy API)
- API 表面复杂 (vue-i18n 双轨 + Nuxt 封装层)
- 全量路由生成，大型项目路由膨胀
- 无 namespace
- 无 SSR chunks (hydration 需手动处理)
- 无翻译缓存 (仅 HTTP 缓存)
- 无页面级翻译 (全 locale 文件粒度)
- 与 Nuxt 深度耦合

### vue-i18n v11

**优点**:

- Vue 官方 i18n 插件，深度集成 (Composition/Legacy/SFC/组件/指令)
- 消息预编译 (AST)，运行时性能好
- 消息格式最丰富 (链接+修饰器+转义+函数)
- TypeScript key 推断
- 生态完善 (ESLint, CLI, unplugin)
- 成熟稳定 (220k 依赖者)
- 独立实例 (`createI18n`)，无全局状态

**缺点**:

- 性能差 (构建慢、包大、内存高)
- 无内置路由策略
- 无内置懒加载 API
- 无 namespace
- API 表面复杂 (Legacy + Composition 双轨，v11 弃用 Legacy)
- 无 SSR chunks
- 无 SEO 集成
- 预编译器增加构建开销

### i18next

**优点**:

- 框架无关，通用性最强
- 插件生态最丰富 (backend/detector/cache/formatter)
- Namespace 系统，适合大型项目
- 异步加载成熟 (backend + cache)
- `getFixedT()` 灵活绑定
- Context 翻译
- 成熟稳定 (481k 依赖者)
- TypeScript selector API
- 独立实例 (`createInstance`)
- 多级 fallback 链

**缺点**:

- 非 Vue 原生 (需 wrapper)
- 无 SSR 优化
- 无路由策略
- 无 SFC 集成
- 插件系统增加复杂度
- JavaScript 为主 (76% JS)
- 无页面级翻译 (仅 namespace 粒度)

### ubean 现状

**优点**:

- 零依赖，轻量 (~30KB)
- SSR hydration 基本可用
- 3种路由策略
- Intl 格式化全面 (d/n/c/relativeTime/list)
- globalThis 状态隔离 (解决模块实例问题)
- 运行时性能好 (全内存翻译)

**缺点**:

- **无懒加载**: 所有翻译必须 `defineLocale()` 一次性注册
- **无 namespace**: 无法分模块管理翻译
- **无页面级翻译**: 全量加载，首屏 payload 大
- **无翻译缓存**: 无 LRU/TTL
- **无 SSR chunks**: 手动在 app.ts 注册 locale (导致 hydration bug)
- **无 HMR**: 改 JSON 需重启
- **无消息预编译**: 运行时 flatten+resolve
- **无 SFC 集成**: 无 `<i18n>` 块
- **无组件**: 无 `<i18n-t>`
- **无 `exists()`/`getFixedT()`**
- **链接消息无修饰器**
- **无 fallback 链** (仅单级)
- **无 `prefix_and_default` 策略**
- **无路由级 i18n 配置**
- **无 SEO 集成** (hreflang/canonical/og:locale)
- **无 TypeScript key 推断**
- **无多域名路由**
- **无浏览器语言检测完善** (仅 Accept-Language)
- **无独立实例** (全局状态)

---

## 五、重构方向建议

### 推荐: 以 nuxt-i18n-micro 为蓝本，融合 @nuxtjs/i18n 的 SEO/类型特性 + i18next 的 namespace

**理由**:

1. **nuxt-i18n-micro 的架构最契合 ubean**:
   - 都是 SSR 框架内置 i18n (非独立库)
   - 路由策略 + 中间件模式一致
   - SSR chunks 解决 hydration 的思路可直接借鉴
   - 页面级翻译按需加载适合 ubean 的文件路由
   - 性能优秀，符合 ubean 轻量定位

2. **@nuxtjs/i18n 的功能特性值得参考**:
   - SEO 集成 (hreflang/canonical/og:locale) — 生产必备
   - TypeScript 类型安全 (typedPages/typedOptionsAndMessages)
   - 多文件懒加载 (`files` 数组，方言合并)
   - `prefix_and_default` 策略
   - 浏览器语言检测完善 (cookie/crossOrigin)
   - 但**不引入 vue-i18n 依赖** (性能开销 + 耦合)

3. **i18next 的 namespace 值得引入**:
   - 大型项目需要分模块管理翻译
   - `ns:key` 语法简单且成熟
   - 按需加载 namespace 替代全量加载
   - `getFixedT()` 绑定特定 namespace

4. **vue-i18n 的消息格式可选择性吸收**:
   - 链接消息修饰器 (`@.lower:key`)
   - 但**不引入消息预编译** (复杂度高，ubean 的 JSON 翻译量不大)
   - 但**不引入 SFC `<i18n>` 块** (文件路由体系下不必要)

### 核心重构目标

| 优先级 | 目标                                    | 参考来源                       | 说明                                    |
| ------ | --------------------------------------- | ------------------------------ | --------------------------------------- |
| **P0** | 翻译懒加载 (API + SSR chunks)           | nuxt-i18n-micro                | 按页面/namespace 加载，SSR 注入初始翻译 |
| **P0** | 自动 hydration (无需手动 defineLocale)  | nuxt-i18n-micro SSR chunks     | SSR 渲染时注入翻译，客户端自动同步      |
| **P0** | `prefix_and_default` 策略               | @nuxtjs/i18n                   | 第4种路由策略                           |
| **P1** | Namespace 系统                          | i18next                        | `ns:key` 语法，分模块管理               |
| **P1** | 页面级翻译文件                          | nuxt-i18n-micro                | `pages/about/en.json` 按页面组织        |
| **P1** | 翻译缓存 (LRU + TTL)                    | nuxt-i18n-micro                | 服务端缓存已加载翻译                    |
| **P1** | HMR 翻译热更新                          | nuxt-i18n-micro / @nuxtjs/i18n | 改 JSON 无需重启                        |
| **P1** | `exists()` / `getFixedT()`              | i18next                        | key 检查 + 绑定 t 函数                  |
| **P1** | SEO 集成 (hreflang/canonical/og:locale) | @nuxtjs/i18n                   | `useI18nHead()` composable              |
| **P2** | 路由级 i18n 配置 (`defineI18nRoute`)    | @nuxtjs/i18n / nuxt-i18n-micro | 页面级自定义路径                        |
| **P2** | 链接消息修饰器                          | vue-i18n                       | `@.lower:key` 等                        |
| **P2** | Fallback 链 (多级)                      | i18next                        | `en-US → en → fallbackLng`              |
| **P2** | 浏览器语言检测完善                      | @nuxtjs/i18n                   | cookie + redirectOn + crossOrigin       |
| **P2** | 多文件懒加载 (`files` 数组)             | @nuxtjs/i18n                   | 方言合并 (es.json + es-AR.json)         |
| **P3** | `<i18n-t>` 组件                         | vue-i18n / @nuxtjs/i18n        | 组件插值                                |
| **P3** | TypeScript key 推断                     | @nuxtjs/i18n / vue-i18n        | 类型安全的 t()                          |
| **P3** | TypeScript 路由类型                     | @nuxtjs/i18n                   | `localePath` 类型安全                   |
| **P3** | 动态路由参数 (`$setI18nRouteParams`)    | nuxt-i18n-micro                | 按 locale 设置动态路由参数              |
| **P3** | 服务端 locale 检测器                    | @nuxtjs/i18n                   | `defineI18nLocaleDetector()`            |
| **P3** | 多域名路由                              | @nuxtjs/i18n                   | `differentDomains`                      |

### 不引入的特性

| 特性             | 原因                                                   |
| ---------------- | ------------------------------------------------------ |
| vue-i18n 依赖    | 性能开销大 (预编译/包体积/内存)，与 ubean 轻量定位冲突 |
| 消息预编译 (AST) | 复杂度高，ubean 翻译量不大，收益低                     |
| Legacy API       | ubean 只支持 Composition API，vue-i18n v11 也弃用      |
| SFC `<i18n>` 块  | 文件路由体系下不必要，增加构建复杂度                   |
| `v-t` 指令       | 使用率低，`{{ t() }}` 足够，vue-i18n v11 也弃用        |
| 消息函数         | 过于灵活，增加心智负担                                 |
| 插件系统         | ubean 框架自身就是模块系统，无需额外插件层             |
| 多域名路由 (P3)  | 优先级低，可后续按需实现                               |

### 架构设计要点

1. **保持自研运行时**: 不引入 vue-i18n，继续基于 `globalThis.__ubean_i18n_state__` 但扩展为支持 namespace + 懒加载
2. **翻译加载流程**:
   - SSR: 中间件根据路由解析所需翻译 → API 按需加载 → 注入 SSR chunks
   - 客户端: 读取 SSR chunks 初始化 → 路由切换时异步加载新翻译
3. **文件组织**:
   ```
   src/locales/
   ├── en/
   │   ├── common.json      # 全局翻译 (namespace: common)
   │   ├── home.json         # 页面级 (namespace: home)
   │   └── about.json        # 页面级 (namespace: about)
   └── zh/
       ├── common.json
       ├── home.json
       └── about.json
   ```
4. **API 设计**: 保持现有 `useI18n()` 接口兼容，新增 `useI18nHead()`、`exists()`、`getFixedT()` 等
5. **路由策略**: 新增 `prefix_and_default`，保持现有3种策略不变

---

## 六、总结

| 方案            |    性能    |    功能    |  Vue集成   |   独立性   |   适合ubean    |
| --------------- | :--------: | :--------: | :--------: | :--------: | :------------: |
| nuxt-i18n-micro | ⭐⭐⭐⭐⭐ |  ⭐⭐⭐⭐  |   ⭐⭐⭐   |    ⭐⭐    |    蓝本 ✅     |
| @nuxtjs/i18n    |    ⭐⭐    | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |    ⭐⭐    | 参考 SEO/类型  |
| vue-i18n        |    ⭐⭐    |  ⭐⭐⭐⭐  | ⭐⭐⭐⭐⭐ |  ⭐⭐⭐⭐  |   不引入 ❌    |
| i18next         |  ⭐⭐⭐⭐  |  ⭐⭐⭐⭐  |    ⭐⭐    | ⭐⭐⭐⭐⭐ | 参考 namespace |
| ubean 现状      |  ⭐⭐⭐⭐  |    ⭐⭐    |   ⭐⭐⭐   | ⭐⭐⭐⭐⭐ |    重构目标    |

**最终结论**: 以 nuxt-i18n-micro 为蓝本 (性能+懒加载+SSR chunks)，融合 @nuxtjs/i18n 的 SEO/类型特性，借鉴 i18next 的 namespace 系统，选择性吸收 vue-i18n 的消息格式特性。**不引入 vue-i18n 依赖**，保持 ubean 自研轻量运行时。
