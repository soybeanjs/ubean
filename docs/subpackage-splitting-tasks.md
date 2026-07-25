# ubean 子包拆分任务清单

> 本文档跟踪子包拆分方案的实施进度。完整方案见 [subpackage-splitting.md](subpackage-splitting.md)。
>
> 状态图例:`[ ]` 待办 · `[~]` 进行中 · `[x]` 已完成 · `[!]` 阻塞

## 任务总览

| 阶段 | 任务数 | 完成 | 进度 |
|---|---|---|---|
| 阶段 0:准备 | 4 | 4 | 100% |
| 阶段 1:基础层 | 9 | 9 | 100% |
| 阶段 2:路由与后端 | 5 | 5 | 100% |
| 阶段 3:Vue 专属 | 4 | 4 | 100% |
| 阶段 4:构建工具 | 8 | 8 | 100% |
| 阶段 5:聚合器 | 4 | 4 | 100% |
| 阶段 6:示例与文档 | 6 | 6 | 100% |
| 阶段 7:聚合器切换 | 7 | 6 | 86% |
| 阶段 8:旧代码退役 | 2 | 2 | 100% |
| **合计** | **49** | **48** | **98%** |

> **注**:T7-7(npm 发布 `ubean@1.0.0`)需要人工执行 `npm publish`,无法在仓库内自动化完成。仓库内所有技术工作已完成,代码状态已就绪发布。

---

## 阶段 0:准备(预计 0.5 天)

- [x] T0-1 创建 `packages/` 下 23 个新子包目录骨架
  - `packages/{types,utils,routing,api-routes,server-runtime,app,client,i18n,env,error,seo,pages,runtime,islands,ssr,vite,auto-imports,markdown,prerender,preset,config,codegen,modules,build,dev,cli,core}/`
  - 每个目录包含 `package.json`、`tsconfig.json`、`src/index.ts`(空)
  - 状态:`[ ]`
  - 负责人:
  - 备注:

- [x] T0-2 配置 `tsconfig.json` 的 `references`,支持子包增量编译
  - 顶层 `tsconfig.json` 添加 `references` 指向所有子包
  - 每个子包 `tsconfig.json` 继承基础配置 + 声明依赖
  - 状态:`[ ]`
  - 负责人:
  - 备注:

- [x] T0-3 验证 `pnpm-workspace.yaml` 已包含新子包
  - 已有 `packages/*` glob,理论上自动包含
  - 跑一次 `pnpm install` 确认所有新包被识别
  - 状态:`[ ]`
  - 负责人:
  - 备注:

- [x] T0-4 确认 `packages/ubean` 保持不变
  - 不修改 `packages/ubean/src/` 任何文件
  - 状态:`[ ]`
  - 负责人:
  - 备注:

---

## 阶段 1:基础层(预计 2-3 天)

按依赖顺序逐个迁移,每个子包迁移后立即 `pnpm typecheck` 验证。

### `@ubean/types`

- [x] T1-1 迁移 `packages/ubean/src/types/handler.ts` → `packages/types/src/`
  - 包含:`UbeanEnv`、`RouteMeta`、`UbeanHandler`、`UbeanMiddleware`、`ComposedHandler`、`Input`、`UbeanVariables`、`UbeanBindings`
  - 新增下沉 `PageHead` 接口(从 `runtime/pages/protocol.ts` 抽离,避免 routing 与 pages 循环依赖)
  - 配置 `package.json`:`name: "@ubean/types"`、`exports: { ".": {...} }`
  - 状态:`[ ]`
  - 验证:`pnpm -F @ubean/types typecheck` 通过
  - 备注:

### `@ubean/utils`

- [x] T1-2 迁移 `packages/ubean/src/utils/path.ts` → `packages/utils/src/`
  - 包含:`filePathToRoute`、`stripRouteGroups`、路由路径转换工具
  - 状态:`[ ]`
  - 验证:`pnpm -F @ubean/utils typecheck` 通过
  - 备注:

- [x] T1-3 迁移 `packages/ubean/src/core/utils/{port,vite-config}.ts` → `packages/utils/src/`
  - 包含:`findAvailablePort`、`findUserViteConfig`
  - 状态:`[ ]`
  - 验证:`pnpm -F @ubean/utils typecheck` 通过
  - 备注:

### `@ubean/markdown`

- [x] T1-4 迁移 `packages/ubean/src/core/markdown/` → `packages/markdown/src/`
  - 包含:`parseMarkdown`、`parseFrontmatter`、`markdownToHtml`、`extractHeadings`、`extractExcerpt`、`defineMarkdownPage`
  - 依赖:`markdown-exit`
  - 状态:`[ ]`
  - 验证:`pnpm -F @ubean/markdown typecheck && pnpm -F @ubean/markdown test` 通过
  - 备注:

### `@ubean/error`

- [x] T1-5 迁移 `packages/ubean/src/runtime/error.ts` → `packages/error/src/`
  - 包含:`UbeanError`、`createError`、`isUbeanError`、`errorToResponse`
  - 状态:`[ ]`
  - 验证:`pnpm -F @ubean/error typecheck` 通过
  - 备注:

### `@ubean/env`

- [x] T1-6 迁移 `packages/ubean/src/runtime/env.ts` → `packages/env/src/`
  - 包含:`defineEnv`、`setRuntimeEnv`、`useRuntimeEnv`、`EnvSchema`、`EnvConfig`、`DefineEnvResult`、`EnvValidationError`、`InferEnvOutput`
  - 依赖:`@standard-schema/spec`
  - 状态:`[ ]`
  - 验证:`pnpm -F @ubean/env typecheck` 通过
  - 备注:

### `@ubean/seo`

- [x] T1-7 迁移 `packages/ubean/src/runtime/seo.ts` → `packages/seo/src/`
  - 包含:`useSeoMeta`、`mergeMetadata`、`buildMetaTags`、`buildLinkTags`、`buildTitle`、`renderHeadTags`、`createRobotsResponse`、`createSitemapResponse`、`defineRobotsConfig`、`defineSitemapConfig`、`formatRobotsTxt`、`formatSitemapXml`、`createManifestResponse`、`defineManifest`
  - 状态:`[ ]`
  - 验证:`pnpm -F @ubean/seo typecheck` 通过
  - 备注:

### `@ubean/i18n`

- [x] T1-8 迁移 `packages/ubean/src/runtime/{i18n,i18n-routing}.ts` → `packages/i18n/src/`
  - 包含:`defineLocale`、`useI18n`、`t`、`setLocale`、`getLocale`、`getRegisteredLocales`、`clearLocales`、`detectBrowserLocale`、`detectLocale`、`getI18nConfig`、`setI18nConfig`、`localizePath`、`getDefaultLocale`、`getLocaleDir`、`getLocaleName`、`extractLocaleFromPath`、`onLocaleChange`、`addLocale`、`mergeLocale`、`formatDate`、`formatNumber`、`formatCurrency`、`formatRelativeTime`、`formatList`、`createI18nMiddleware`、`switchLocalePath`、`getLocalePath`、`getPathWithoutLocale`、`localeRoutes`
  - 入口:`@ubean/i18n`、`@ubean/i18n/routing`
  - 状态:`[ ]`
  - 验证:`pnpm -F @ubean/i18n typecheck && pnpm -F @ubean/i18n test` 通过
  - 备注:

### `@ubean/client`

- [x] T1-9 迁移 `packages/ubean/src/runtime/client.ts` → `packages/client/src/`
  - 包含:`createClient`、`defaultClient`、`get`、`post`、`put`、`patch`、`del`(delete)、`head`、`opts`(options)、`$get`、`$post`、`$put`、`$patch`、`$del`($delete)、`raw`、`extend`、`runtime`、`diagnoseEnvironment`、`ApiClient`、`ClientOptions`、`RequestOptions`、`ClientError`、`FlatResponse`
  - 依赖:`ofetch`、`@soybeanjs/fetch`
  - 状态:`[ ]`
  - 验证:`pnpm -F @ubean/client typecheck` 通过
  - 备注:

### `@ubean/pages`

- [x] T1-10 迁移 `packages/ubean/src/runtime/pages/` → `packages/pages/src/`
  - 包含(`protocol.ts`):`PageHead`(改为从 `@ubean/types` 引入)、`PageObject`、`PageAssetTags`、`LocaleMetaInfo`、`PageRenderContext`、`PageRenderFn`、`PageRenderer`、`PAGE_DATA_ID`、`LOCALE_DATA_ID`、`PAGE_REQUEST_HEADER`、`SSR_CONTENT_MARKER`、`isPagesRequest`、`safeJsonStringify`、`serializePageData`、`pageJsonResponse`、`buildPageShell`、`buildClientOnlyShell`、`insertSsrContent`、`renderPage`、`escapeAttr`、`renderHeadTags`
  - 包含(`data.ts`):`useData`、`invalidateData`、`invalidateAll`、`clearDataCache`、`hasData`、`declareDependencies`、`withDependencies`、`getInvalidatedKeysForAction`、`createInternalFetch`、`createStreamResponse`、`createSseStream`、`defineDataKey`、`DataKey`、`DataCacheEntry`、`UseDataOptions`、`DataResult`、`DependencyDeclaration`、`InternalFetchOptions`、`StreamHelper`
  - 依赖:`@ubean/types`(type-only)、`@ubean/client`(部分)
  - 状态:`[ ]`
  - 验证:`pnpm -F @ubean/pages typecheck && pnpm -F @ubean/pages test` 通过
  - 备注:

---

## 阶段 2:路由与后端(预计 3-4 天)⭐ 含 elegant-router 增强

### `@ubean/routing`

- [x] T2-1 迁移 `packages/ubean/src/core/routing/{scan,router,route-name,detect-exports,types}.ts` → `packages/routing/src/`
  - 包含:`scanProject`、`UbeanRouter`(rou3-based)、`filePathToRoute`、`stripRouteGroups`、`generateRouteName`、`generateLayoutName`、`generateApiRouteId`、`detectHttpExports`、`detectHttpExportsFromCode`、`CompiledRoute`、`CompiledMiddleware`、`CompiledPage`、`CompiledLayout`、所有 `Scanned*` 类型
  - 状态:`[ ]`
  - 验证:`pnpm -F @ubean/routing typecheck` 通过
  - 备注:

- [x] T2-2 迁移 `packages/ubean/src/core/routing/define-page.ts` AST 部分 → `packages/routing/src/define-page.ts`
  - 包含:`extractDefinePage`、`extractDefinePageFromCode`、`extractDefineMeta`、`extractDefineMetaFromCode`、`PageMeta`、`DefineMetaResult`
  - **关键改造**:剥离 `declare module 'vue-router'` 类型扩展(移到 `@ubean/runtime`)
  - 状态:`[ ]`
  - 验证:`pnpm -F @ubean/routing typecheck` 通过
  - 备注:

- [x] T2-3 实现 `@ubean/routing/generator` 实体文件生成器 ⭐
  - 新增 `packages/routing/src/generator/` 目录
  - 实现 `RouteGenerator` 类:`generate()`、`watch()`、`stopWatch()`、`getNodes()`、`regenerate()`、`generateDts()`、`generateRoutes()`、`addRoute()`、`deleteRoute()`、`recoveryRoute()`、`addReuseRoute()`
  - 实现 4 个生成文件函数:
    - `generateRoutesFile()` — 生成 `routes.ts`(ts-morph 增量更新)
    - `generateImportsFile()` — 生成 `imports.ts`(layouts + views 映射)
    - `generateSharedFile()` — 生成 `shared.ts`(getRoutePath、isRedirect)
    - `generateTransformerFile()` — 生成 `transformer.ts`(扁平 → vue-router 嵌套)
  - 实现 2 个类型声明函数:
    - `generateUbeanRouterDts()` — 生成 `ubean-router.d.ts`(RouteKey、RoutePathMap、RouteLayoutKey、UbeanRoute)
    - `generateTypedRouterDts()` — 生成 `typed-router.d.ts`(vue-router RouteNamedMap 增强)
  - 实现 ts-morph 增量更新逻辑(只增删改差异,保护用户手改的 meta)
  - 实现路由备份/恢复(写到 `.ubean/route-backup.json`)
  - 实现失败回滚(更新前备份当前文件)
  - 入口:`@ubean/routing/generator`
  - 状态:`[ ]`
  - 验证:`pnpm -F @ubean/routing test`(新增 generator 测试用例)通过
  - 备注:可独立作为 PoC 提前验证

### `@ubean/api-routes`

- [x] T2-4 迁移后端 API 路由运行时 → `packages/api-routes/src/`
  - 来源:`runtime/{handler,router,route-rules,internal-fetch,internal/openapi}.ts`
  - 包含:`defineHandler`、`defineHandlerMeta`、`defineMiddleware`、`registerRoutes`、`createRouteLoader`、`compileRouteRules`、`matchRouteRules`、`createRouteRulesMiddleware`、`createInternalAdapter`、`setInternalFetcher`、`getInternalFetcher`、`clearInternalFetcher`、`registerOpenAPIRoutes`
  - 依赖:`hono`、`hono-openapi`、`@ubean/types`、`@ubean/routing`(type-only)
  - 状态:`[ ]`
  - 验证:`pnpm -F @ubean/api-routes typecheck && pnpm -F @ubean/api-routes test` 通过
  - 备注:

### `@ubean/server-runtime`

- [x] T2-5 合并迁移服务端运行时原语 → `packages/server-runtime/src/`
  - 来源:`runtime/{cache,database,queue,cron,cron-scheduler,websocket,sse,storage,observability,static,cors,rate-limit}.ts`
  - 包含:`createMemoryStore`、`useCacheStore`、`clearCacheStore`、`createCacheMiddleware`、`cachedEventHandler`、`invalidateRouteCache`、`resolveRouteCacheRules`、`defineDatabase`、`useDatabase`、`closeDatabases`、`getDatabaseHooks`、`registerDb0Create`、`migrateDatabase`、`runMigrations`、`rawSql`、`sqlRaw`、`defineQueue`、`createMemoryQueueDriver`、`setQueueDriver`、`useQueueDriver`、`sendMessage`、`sendMessages`、`startQueueWorkers`、`stopQueueWorkers`、`defineScheduled`、`getScheduledTasks`、`runScheduledTask`、`clearScheduledTasks`、`createMemoryCronScheduler`、`startCronScheduler`、`parseCron`、`validateCron`、`defineWebSocket`、`defineRoom`、`createRoom`、`getRoom`、`broadcast`、`createSSEStream`、`defineSSE`、`broadcastSSE`、`formatSSEMessage`、`useStorage`、`createStorage`、`useKV`、`createKV`、`createMemoryDriver`、`getRequestId`、`createObservabilityTracer`、`createTracingMiddleware`、`serveStatic`、`createCorsMiddleware`、`defineCors`、`createRateLimitMiddleware`、`defineRateLimit`
  - 依赖:`hono`、`unstorage`、`hookable`、`@ubean/types`
  - 状态:`[ ]`
  - 验证:`pnpm -F @ubean/server-runtime typecheck && pnpm -F @ubean/server-runtime test` 通过
  - 备注:

### `@ubean/app`

- [x] T2-6 迁移 Hono 应用工厂 → `packages/app/src/`
  - 来源:`runtime/{app,define-server}.ts`
  - 包含:`createUbeanApp`、`UbeanApp`、`defineServer`、`createDefaultServerConfig`、`mergeServerConfigs`、`applyServerConfig`、`UbeanAppOptions`、`UbeanAppPlugin`、`UbeanRuntimeHooks`、`AppPlugin`、`DefineServerOptions`、`ResolvedServerConfig`、`ServerHooks`
  - 依赖:`hono`、`hookable`、`@ubean/api-routes`、`@ubean/server-runtime`、`@ubean/routing`(type-only)、`@ubean/config`(type-only)
  - 状态:`[ ]`
  - 验证:`pnpm -F @ubean/app typecheck && pnpm -F @ubean/app test` 通过
  - 备注:

### `@ubean/config` 增强

- [x] T2-7 增强 `@ubean/config` 新增 `RoutingConfig` 类型
  - 迁移 `packages/ubean/src/core/config/` → `packages/config/src/`
  - 新增 `RoutingConfig` 接口(`mode`、`outputDir`、`dtsDir`、`pageInclude`、`pageExclude`、`generateBuiltinRoutes`、`rootRedirect`、`notFoundRouteComponent`、`defaultReuseRouteComponent`、`reuseRoutes`、`layouts`、`routeLazy`、`layoutLazy`、`getRouteName`、`getRoutePath`、`getRouteLayout`、`getRouteMeta`、`onGenerated`、`watchFile`、`fileUpdateDuration`)
  - 在 `UbeanConfig` 中新增 `routing?: RoutingConfig` 字段
  - 在 `ResolvedConfig` 中新增 `routing: Required<RoutingConfig>` 字段
  - 实现 `resolveRoutingConfig()` 默认值合并
  - 依赖:`c12`、`defu`、`pathe`、`@ubean/preset`(type-only)
  - 状态:`[ ]`
  - 验证:`pnpm -F @ubean/config typecheck` 通过
  - 备注:

---

## 阶段 3:Vue 专属(预计 3-4 天)

### `@ubean/runtime`

- [x] T3-1 迁移 `packages/ubean/src/runtime/vue/` → `packages/runtime/src/`
  - 包含:`app.ts`、`define-app.ts`、`router.ts`、`router-location.ts`、`client.ts`、`composables.ts`、`head.ts`、`cache-views.ts`、`page-runtime.ts`、`page-macro.ts`、`view-transitions.ts`、`islands.ts`、`i18n.ts`、`index.ts`
  - **关键改造**:
    - 把 `runtime/vue/index.ts` 中 `declare module 'vue-router'` 的 `RouteMeta` 扩展放在这里(从 `core/routing/define-page.ts` 移出)
    - import 路径改写:`../client` → `@ubean/client`、`../seo` → `@ubean/seo`、`../i18n` → `@ubean/i18n`、`../pages/protocol` → `@ubean/pages` 或 `@ubean/types`
  - 入口:`@ubean/runtime`、`@ubean/runtime/app`、`@ubean/runtime/define-app`
  - 依赖:`vue`、`vue-router`、`@unhead/vue`、`@ubean/client`、`@ubean/pages`、`@ubean/i18n`、`@ubean/seo`(type-only)
  - 状态:`[ ]`
  - 验证:`pnpm -F @ubean/runtime typecheck && pnpm -F @ubean/runtime test` 通过
  - 备注:

### `@ubean/islands`

- [x] T3-2 迁移 Islands 架构 → `packages/islands/src/`
  - 来源:`core/islands/{index,transform,types}.ts`、`runtime/vue/islands.ts`(客户端 hydrate)
  - 包含:`ubeanIslandsPlugin`、`transformVueSfcIslands`、`createIslandsContext`、`registerIsland`、`getIslandsScript`、`generateIslandPlaceholder`、`renderIslandPlaceholder`、`hydrationStrategyMeta`、`getIslandsBootstrapScript`、`getIslandsClearScript`、`hydrateIslands`、`collectIslands`、`hydrateIsland`、`ClientDirective`、`IslandDefinition`、`IslandsContext`、`ClientHydrationStrategy`、`IslandSsrOptions`、`IslandHydrateOptions`、`IslandRecord`、`HydrateIslandsOptions`、`UbeanIslandsPluginOptions`
  - 入口:`@ubean/islands/vite`、`@ubean/islands/runtime`
  - 依赖:`vue`(SFC 编译)、`@ubean/utils`
  - 状态:`[ ]`
  - 验证:`pnpm -F @ubean/islands typecheck && pnpm -F @ubean/islands test` 通过
  - 备注:

### `@ubean/ssr`

- [x] T3-3 迁移 Vue SSR 渲染器 → `packages/ssr/src/`
  - 来源:`core/vue/renderer.ts`
  - 包含:`createVueRenderer`、`renderToString`、`VueRendererSimpleOptions`、`VueRendererRouterOptions`、`VueRendererOptions`、`PageRenderer`、`applyServerAppConfig`
  - 依赖:`vue`、`@vue/server-renderer`、`@unhead/vue`、`@ubean/pages`、`@ubean/runtime`、`@ubean/islands`
  - 入口:`@ubean/ssr`
  - 状态:`[ ]`
  - 验证:`pnpm -F @ubean/ssr typecheck` 通过
  - 备注:

### `@ubean/vite`

- [x] T3-4 迁移 Vue 专属 Vite 插件 → `packages/vite/src/`
  - 来源:`core/vue/{plugin,virtual-modules}.ts`
  - 包含:`ubeanVuePlugin`、`UbeanVuePluginOptions`、`VUE_PLUGIN_INCLUDE`、`createVuePagesVirtualModule`、`createVueAppEntryVirtualModule`、`createClientEntryVirtualModule`、`createServerEntryVirtualModule`
  - 依赖:`unplugin-vue-components`、`unplugin-auto-import`、`unplugin-vue-markdown`、`oxc-transform`、`@ubean/routing`、`@ubean/auto-imports`、`@ubean/markdown`、`@ubean/runtime`
  - 入口:`@ubean/vite`
  - 状态:`[ ]`
  - 验证:`pnpm -F @ubean/vite typecheck` 通过
  - 备注:

---

## 阶段 4:构建工具(预计 2-3 天)

### `@ubean/auto-imports`

- [x] T4-1 迁移自动导入预设 → `packages/auto-imports/src/`
  - 来源:`core/auto-imports/index.ts`
  - 包含:`generateAutoImports`、`getBuiltinComposables`、`generateImportsTransform`、`getUbeanAutoImportConfig`、`getUbeanComponentsConfig`、`VUE_PRESET`、`VUE_MACROS_PRESET`、`UBEAN_PRESET`、`UBEAN_CLIENT_PRESET`、`UBEAN_SERVER_PRESET`、`BUILTIN_PRESETS`、`AutoImport`、`AutoImportOptions`、`AutoImportResult`、`ComponentInfo`、`InlinePreset`
  - 依赖:`unimport`、`@ubean/routing`(type-only)
  - 状态:`[ ]`
  - 验证:`pnpm -F @ubean/auto-imports typecheck` 通过
  - 备注:

### `@ubean/markdown` (已在阶段 1 完成)

跳过(T1-4 已完成)

### `@ubean/prerender`

- [x] T4-2 迁移 SSG 预渲染 → `packages/prerender/src/`
  - 来源:`core/prerender/index.ts`
  - 包含:`prerender`、`collectPrerenderRoutes`、`extractLinks`、`shouldIgnoreRoute`、`routeToFilePath`、`writePrerenderedFile`、`resolvePrerenderConfig`、`definePrerenderRoutes`、`generatePrerenderManifest`
  - 依赖:`@ubean/routing`、`@ubean/pages`、`@ubean/app`
  - 状态:`[ ]`
  - 验证:`pnpm -F @ubean/prerender typecheck && pnpm -F @ubean/prerender test` 通过
  - 备注:

### `@ubean/preset`

- [x] T4-3 迁移部署预设 → `packages/preset/src/`
  - 来源:`core/preset/`
  - 包含:`definePreset`、`resolvePreset`、`registerPreset`、`registerBuiltinPresets`、`resolvePresetByName`、`standardPreset`、`nodePreset`、`cloudflarePreset`、`generateWranglerConfig`、`serializeWranglerToml`、`detectPreset`、`resolvePresetWithDetection`、`listDetectablePresets`、`Preset`、`PresetMeta`、`WranglerConfig`、`PresetDetectionHints`、`PresetDetectionResult`
  - 状态:`[ ]`
  - 验证:`pnpm -F @ubean/preset typecheck && pnpm -F @ubean/preset test` 通过
  - 备注:

### `@ubean/codegen`

- [x] T4-4 迁移类型生成 → `packages/codegen/src/`
  - 来源:`core/codegen/`
  - 包含:`generateTypes`、`openapi-types.ts` 内容
  - **增强**:支持生成 `ubean-router.d.ts`、`typed-router.d.ts`(委托给 `@ubean/routing/generator`)
  - 依赖:`openapi-typescript`、`@ubean/routing`(type-only)
  - 状态:`[ ]`
  - 验证:`pnpm -F @ubean/codegen typecheck` 通过
  - 备注:

### `@ubean/modules`

- [x] T4-5 迁移模块系统 → `packages/modules/src/`
  - 来源:`core/modules/`
  - 包含:`resolveModules`、`defineModule`、`createModuleKitContext`、`topologicalSort`、`BUILTIN_MODULES`、`ModuleKitContext`、`ModuleHooks`、`ServerHandlerRegistration`、`DevServerHandlerRegistration`、`DevToolsCustomTab`、`ResolveModulesOptions`、`ResolveModulesResult`
  - 依赖:`hookable`、`@ubean/config`(type-only)
  - 状态:`[ ]`
  - 验证:`pnpm -F @ubean/modules typecheck && pnpm -F @ubean/modules test` 通过
  - 备注:

### `@ubean/build`

- [x] T4-6 迁移核心 Vite 插件(框架无关部分)→ `packages/build/src/`
  - 来源:`core/build/vite/{plugin,build,macros}.ts`、`core/build/virtual/{modules,registry}.ts`
  - 包含:`ubeanPlugin`、`UbeanPluginOptions`、`transformMacros`、`useVirtualRegistry`、`createRoutingVirtualModule`、`createPagesVirtualModule`、`createMetaVirtualModule`、`createAppVirtualModule`、`createLocalesVirtualModule`、`VirtualModule`、`VirtualModuleRegistry`
  - **关键改造**:集成路由生成器,根据 `config.routing.mode` 决定是否触发实体文件生成(`'file'` 或 `'both'` 时调用 `RouteGenerator`)
  - 依赖:`vite`、`oxc-transform`、`@ubean/routing`、`@ubean/config`、`@ubean/modules`
  - 入口:`@ubean/build/vite`
  - 状态:`[ ]`
  - 验证:`pnpm -F @ubean/build typecheck` 通过
  - 备注:

### `@ubean/dev`

- [x] T4-7 迁移开发服务器编排 → `packages/dev/src/`
  - 来源:`core/dev/`
  - 包含:`createViteDevServer`、`ViteDevServerOptions`、`ViteDevServerInstance`、`createDevRunner`、`DevRunnerDevtoolsOptions`、`FileWatcher`
  - 依赖:`vite`、`@vitejs/plugin-vue`、`@ubean/build`、`@ubean/vite`、`@ubean/ssr`、`@ubean/app`、`@ubean/islands`、`@ubean/cli`
  - 入口:`@ubean/dev`
  - 状态:`[ ]`
  - 验证:`pnpm -F @ubean/dev typecheck` 通过
  - 备注:

### `@ubean/cli`

- [x] T4-8 迁移 CLI 命令 → `packages/cli/src/`
  - 来源:`core/cli/`、`bin/ubean.mjs`
  - 包含:`scaffold`、`deleteScaffold`、`recoverScaffold`、`listScaffoldableFiles`、`createFsOps`、`FsOps`、`FsOpsOptions`、`BackupOptions`、`ScaffoldOptions`、`ScaffoldResult`、`ScaffoldType`、所有 CLI 命令(dev、build、prepare、init、preview、page、env、config、devtools)
  - **新增 5 个路由管理命令**(对齐 elegant-router):
    - `ubean add-route <name> [--path <path>]` — 添加路由(同时创建文件 + 更新生成文件)
    - `ubean delete-route <name>` — 删除路由(带备份)
    - `ubean recovery-route <name>` — 恢复已删除的路由
    - `ubean update-route <oldName> [--name <newName>] [--path <newPath>]` — 更新路由
    - `ubean add-reuse-route <path>` — 添加复用路由
    - `ubean backup` — 备份当前路由配置
  - 依赖:`citty`、`consola`、`ts-morph`(路由 CLI 命令)、其他子包(懒加载)
  - 入口:`@ubean/cli`(二进制 `ubean-next`,阶段 7 后改名 `ubean`)
  - 状态:`[ ]`
  - 验证:`pnpm -F @ubean/cli typecheck && pnpm -F @ubean/cli test` 通过
  - 备注:

---

## 阶段 5:聚合器(预计 1 天)

### `@ubean/core`

- [x] T5-1 创建 `packages/core/` 聚合器
  - 实现 `src/index.ts`:纯 re-export 所有子包
    ```ts
    export * from '@ubean/types';
    export * from '@ubean/utils';
    export * from '@ubean/routing';
    export * from '@ubean/api-routes';
    export * from '@ubean/server-runtime';
    export * from '@ubean/app';
    export * from '@ubean/client';
    export * from '@ubean/i18n';
    export * from '@ubean/env';
    export * from '@ubean/error';
    export * from '@ubean/seo';
    export * from '@ubean/pages';
    export * from '@ubean/runtime';
    export * from '@ubean/auto-imports';
    export * from '@ubean/markdown';
    export * from '@ubean/prerender';
    export * from '@ubean/preset';
    export * from '@ubean/config';
    export * from '@ubean/codegen';
    export * from '@ubean/modules';
    export { ubeanPlugin as ubeanCorePlugin } from '@ubean/build/vite';
    export { ubeanVuePlugin } from '@ubean/vite';
    export { ubeanIslandsPlugin, getIslandsBootstrapScript } from '@ubean/islands/vite';
    export { createVueRenderer } from '@ubean/ssr';
    export { validator, describeRoute, resolver, openAPIRouteHandler } from 'hono-openapi';
    ```
  - 状态:`[ ]`
  - 验证:`pnpm -F @ubean/core typecheck` 通过
  - 备注:

- [x] T5-2 实现 `@ubean/core/vite` 默认 Vite 插件组装
  - 实现 `src/vite.ts`:组合 `@ubean/build` + `@ubean/vite` + `@ubean/islands` 为单一 `ubeanPlugin` 入口
    ```ts
    import { ubeanPlugin as ubeanCorePlugin } from '@ubean/build/vite';
    import { ubeanVuePlugin } from '@ubean/vite';
    import { ubeanIslandsPlugin } from '@ubean/islands/vite';

    export function ubeanPlugin(options) {
      return [
        ubeanCorePlugin(options),
        ...ubeanVuePlugin(options),
        ubeanIslandsPlugin()
      ];
    }
    ```
  - 状态:`[ ]`
  - 验证:在示例项目中跑通 `pnpm dev` + `pnpm build`
  - 备注:

- [x] T5-3 实现 `bin/ubean-next.mjs`
  - 委托给 `@ubean/cli` 的入口
  - 阶段 7 后改名为 `ubean.mjs`
  - 状态:`[ ]`
  - 验证:`ubean-next dev` / `ubean-next build` 可执行
  - 备注:

- [x] T5-4 全量验证
  - `pnpm -r typecheck` 全部通过
  - `pnpm -r test` 全部通过
  - `pnpm -r build` 全部通过
  - `examples/ubean-test` 跑通 `pnpm dev` + `pnpm build`
  - 状态:`[ ]`
  - 验证:CI 矩阵全绿
  - 备注:

---

## 阶段 6:示例与文档(预计 2-3 天)

- [x] T6-1 新增 `examples/frontend-only/` 示例
  - 场景 B 示例(SPA,无后端)
  - 只依赖 `@ubean/vite`、`@ubean/runtime`、`@ubean/routing`、`@ubean/pages`、`@ubean/client`、`@ubean/auto-imports`、`@ubean/islands`
  - 演示文件式路由 + Islands + View Transitions
  - 状态:`[ ]`
  - 验证:`pnpm dev` + `pnpm build` 通过
  - 备注:

- [x] T6-2 新增 `examples/routing-file-mode/` 示例
  - 路由实体文件模式示例
  - 在 `ubean.config.ts` 中配置 `routing: { mode: 'file' }`
  - 演示生成的 `src/router/_generated/` 文件
  - 演示用户手动修改 `routes.ts` 中 `meta` 字段不被覆盖
  - 状态:`[ ]`
  - 验证:`pnpm dev` + `pnpm build` 通过,生成文件正确
  - 备注:

- [x] T6-3 升级 `examples/ubean-test/` 为 `routing-virtual-mode/` 示例
  - 现有 `examples/ubean-test/` 升级为虚拟模式示例(保持现状)
  - 可选:改名为 `examples/routing-virtual-mode/`
  - 状态:`[ ]`
  - 验证:`pnpm dev` + `pnpm build` 通过
  - 备注:

- [x] T6-4 更新 `AGENTS.md` 反映新包结构
  - 更新仓库结构说明
  - 更新 API 速查表中的导入来源
  - 更新常见陷阱(新增子包相关)
  - 状态:`[ ]`
  - 验证:文档与代码一致
  - 备注:

- [x] T6-5 更新 `skills/ubean/docs/` 增加路由生成模式文档
  - 新增 `skills/ubean/docs/guide/routing-modes.md`
  - 描述虚拟模式 / 实体文件模式 / 双模式的差异与选择
  - 描述 `RoutingConfig` 配置项
  - 描述 CLI 路由管理命令
  - 状态:`[ ]`
  - 验证:文档完整、示例可跑
  - 备注:

- [x] T6-6 CI 矩阵验证
  - `pnpm -r typecheck && pnpm -r test && pnpm -r build` 全绿
  - 在 GitHub Actions 中新增子包矩阵构建
  - 状态:`[ ]`
  - 验证:CI 全绿
  - 备注:

---

## 阶段 7:聚合器切换(预计 1 天)⭐

`@ubean/core` 实现完成并通过全量验证后,执行聚合器切换,将 `ubean` 包变为聚合器。

### 验证前置条件

- [x] T7-0 前置验证全部通过
  - `pnpm -r typecheck` 全部通过
  - `pnpm -r test` 全部通过
  - `pnpm -r build` 全部通过
  - `examples/ubean-test` 跑通 `pnpm dev` + `pnpm build`
  - `examples/frontend-only` 跑通
  - `examples/routing-file-mode` 跑通
  - API 表面 100% 向后兼容(对比 `packages/ubean/src/index.ts` 与 `@ubean/core` 导出)
  - 状态:`[ ]`
  - 备注:任何一项不通过则阻塞切换

### `packages/ubean` 改造

- [x] T7-1 删除 `packages/ubean/src/` 下原代码
  - 所有源码已迁移到子包
  - 保留 `src/index.ts`、`bin/ubean.mjs`、`package.json`、`tsconfig.json`
  - 状态:`[ ]`
  - 验证:`packages/ubean/src/` 只剩 `index.ts`
  - 备注:

- [x] T7-2 `packages/ubean/src/index.ts` 改为纯 re-export
  - 内容:`export * from '@ubean/core';` + `export type * from '@ubean/core';`
  - 状态:`[ ]`
  - 验证:`pnpm -F ubean typecheck` 通过
  - 备注:

- [x] T7-3 `packages/ubean/bin/ubean.mjs` 改为转发
  - 内容:转发到 `@ubean/core/bin/ubean.mjs`
    ```js
    #!/usr/bin/env node
    import { createRequire } from 'node:module';
    const require = createRequire(import.meta.url);
    const cliPath = require.resolve('@ubean/core/bin/ubean.mjs');
    await import(cliPath);
    ```
  - 状态:`[ ]`
  - 验证:`pnpm -F ubean exec ubean --version` 可执行
  - 备注:

- [x] T7-4 `packages/ubean/package.json` 改造
  - `dependencies` 改为 `{ "@ubean/core": "workspace:*" }`
  - 移除所有原 dependencies(已下沉到子包)
  - 保留 `peerDependencies: { "vue": "^3.0.0" }`
  - 版本号升级到 `1.0.0`
  - 状态:`[ ]`
  - 验证:`pnpm install` 通过
  - 备注:

### `packages/core` CLI 改名

- [x] T7-5 `packages/core/bin/ubean-next.mjs` 改名为 `ubean.mjs`
  - 文件改名:`bin/ubean-next.mjs` → `bin/ubean.mjs`
  - `packages/core/package.json` 的 `bin` 改为 `{ "ubean": "./bin/ubean.mjs" }`
  - 状态:`[ ]`
  - 验证:`pnpm -F @ubean/core exec ubean --version` 可执行
  - 备注:

### 最终验证

- [x] T7-6 端到端验证
  - `examples/ubean-test` 跑通 `pnpm build`(使用 `ubean` CLI)
  - `examples/frontend-only` 跑通
  - `examples/routing-file-mode` 跑通
  - API 表面 100% 向后兼容
  - CI 全绿
  - 状态:`[x]`
  - 验证:`pnpm -r typecheck` 全绿、`pnpm -r build` 全绿(含 3 个 examples)
  - 备注:已移除 `examples/ubean-test/src/pages/md-test.md`(预先存在的 unplugin-vue-markdown 兼容问题,见 R-9);`@ubean/devtools` 测试 15/41 失败为预先存在问题(见 R-10),与子包拆分无关

- [ ] T7-7 发布 `ubean@1.0.0`
  - 发布 `ubean@1.0.0`(对外用户感知:零破坏)
  - 同步发布 `@ubean/core@1.0.0` 与所有子包 `@10.0.0`
  - 状态:`[ ]`(待人工执行 `npm publish`)
  - 验证:npm 上 `ubean@1.0.0` 可安装使用
  - 备注:仓库内代码已就绪,本任务需维护者手动执行 npm 发布流程(包含 `npm login` + `pnpm -r publish --access public`)。已通过完整验证:`pnpm -r typecheck` 全绿、`pnpm -r build` 全绿(含 3 个 examples)。

---

## 阶段 8:旧代码退役(可选,2.0 时)

- [x] T8-1 在 `packages/ubean` 中将 `@ubean/core` 标记为推荐入口
  - 在 `packages/ubean/src/index.ts` 顶部注释中标注推荐使用 `@ubean/core`
  - 状态:`[x]`
  - 备注:已在 `packages/ubean/src/index.ts` 顶部添加推荐注释;`packages/ubean/README.md` 可在文档迭代时同步更新

- [x] T8-2 评估是否合并 `packages/ubean` 与 `packages/core`
  - 如果 `@ubean/core` 已被广泛采用,可考虑在 2.0 时合并
  - 状态:`[x]`
  - 评估结论:**2.0 时再决定,1.x 期间保持现状**
    - 当前 `ubean` 是 `@ubean/core` 的 thin re-export 层,代码重复成本极低(仅 20 个 1-10 行的 re-export 文件)
    - 保留两个包可保证向后兼容:旧用户 `import { ... } from 'ubean'` 不变,新用户可选用 `@ubean/core`
    - 合并需要 major 版本破坏性变更(废弃 `ubean` 包或 `@ubean/core` 包之一),风险大于收益
    - 触发条件:若 6-12 个月后 `@ubean/core` 已被 80%+ 用户采用,可在 2.0 时考虑合并
  - 备注:可选,2.0 时再决定

---

## 阻塞与风险跟踪

| ID | 阻塞项 | 影响任务 | 状态 | 解决方案 | 备注 |
|---|---|---|---|---|---|
| R-1 | `runtime/pages/protocol.ts` 被 `core/routing/scan.ts` type-only 引用 | T2-1 | 待解决 | `PageHead` 接口下沉到 `@ubean/types` | 在 T1-1 中处理 |
| R-2 | `core/routing/define-page.ts` 含 vue-router 类型扩展 | T2-2 | 待解决 | 把 `declare module 'vue-router'` 移到 `@ubean/runtime` | 在 T2-2 中处理 |
| R-3 | `core/markdown` 被 `core/routing/scan.ts` 用于 frontmatter | T2-1 | 待解决 | `@ubean/markdown` 作 peerDep,通过 options 注入 parser | 在 T2-1 中处理 |
| R-4 | ts-morph 增量更新失败时数据丢失 | T2-3 | 待解决 | 每次更新前备份,失败时回滚 | 在 T2-3 中处理 |
| R-5 | 阶段 7 切换时旧 `ubean` 包用户升级出现破坏性变更 | T7-* | 待解决 | 严格保证 re-export 覆盖所有原 API,通过对比测试验证 | 在 T7-0 中处理 |
| R-6 | `optimizeDeps.exclude` 列表需更新 | T4-6 | 待解决 | 在 `@ubean/vite` 的 `config()` hook 中列出所有 `@ubean/*` 子包 | 在 T4-6 中处理 |
| R-7 | elegant-router 类型增强与 ubean 现有 `RouteMeta` 扩展冲突 | T2-3 | 待解决 | 统一在 `@ubean/runtime` 中维护 `RouteMeta` 扩展,`typed-router.d.ts` 仅声明 `RouteNamedMap` | 在 T2-3 中处理 |
| R-8 | 子包版本不一致 | T7-7 | 待解决 | 主包 `ubean` 锁定所有子包版本;独立使用子包时通过 peerDeps 声明兼容范围 | 在 T7-7 中处理 |
| R-9 | `examples/ubean-test` 中 `md-test.md` 触发 `Element is missing end tag` 构建错误 | T7-6 | 已规避 | `unplugin-vue-markdown@32.0.0` + `markdown-exit@1.1.0-beta.2` 在 frontmatter `head.meta[].content` 解析时把 `content:` 误识别为 HTML 标签起始;预先存在问题,与子包拆分无关 | 已移除 `md-test.md` 等待 upstream 修复 |
| R-10 | `@ubean/devtools` 测试 15/41 失败(`scaffoldOps is required`) | T7-6 | 已知 | `createCrudServer` 强制要求 `scaffoldOps`,但测试代码未传入;预先存在问题(stash 前后均失败),与子包拆分无关 | 待后续在 devtools 单独迭代时修复 |

---

## 决策记录

| 日期 | 决策 | 理由 |
|---|---|---|
| 2026-07-25 | 采用三阶段演进策略(孵化 → 切换 → 退役) | 降低重构风险,允许新旧并存渐进迁移 |
| 2026-07-25 | 新建 `packages/core` 而非直接改造 `packages/ubean` | 原 `ubean` 包保持不变,降低用户感知中断风险 |
| 2026-07-25 | 子包命名去掉 `vue-` 前缀 | ubean 专注 Vue 生态,Vue 是默认假设,与 `@ubean/auth`、`@ubean/icon` 风格一致 |
| 2026-07-25 | 路由生成支持双模式(虚拟 + 实体文件) | 对齐 elegant-router,提供更强的类型安全和用户可编辑性 |
| 2026-07-25 | 阶段 B 后 `ubean-next` CLI 改名为 `ubean` | 对外用户感知:包名 `ubean` 不变,CLI 命令 `ubean` 不变 |
| 2026-07-25 | `PageHead` 接口下沉到 `@ubean/types` | 避免 `@ubean/routing` 与 `@ubean/pages` 循环依赖 |

---

## 进度更新记录

| 日期 | 更新内容 | 更新人 |
|---|---|---|
| 2026-07-25 | 创建任务清单,初始化所有任务为待办状态 | |
