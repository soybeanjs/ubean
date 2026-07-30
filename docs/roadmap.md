# 路线图与决策

## 9.1 纵向交付里程碑

阶段按模块组织，但发布决策以纵向里程碑为准；后续能力不得跳过前一里程碑的验收门槛。

| 里程碑            | 可交付能力                                                                | 必须通过的验收                                          |
| ----------------- | ------------------------------------------------------------------------- | ------------------------------------------------------- |
| M0：路由契约      | 配置加载、路由 IR、文件扫描、错误模型与 Node fixture                      | 路径规范化、冲突检测、`404/405/OPTIONS` 单元与集成测试  |
| M1：API beta      | Hono、命名导出 API、验证、OpenAPI、Fetch client、Node `dev/build/preview` | 真实 Node fixture、类型测试、`pnpm pack` 安装测试       |
| M2：Vue SSR beta  | Pages、单层 layout、loader/action 数据协议、hydrate、页面错误边界         | SSR hydration、导航复用、失效与流式 fallback 浏览器测试 |
| M3：Node v0.1     | 静态资源、基础 route rules、可观测性、SEO metadata 与发布文档             | CI 全绿、Node 部署 smoke test、公开 API 审核            |
| M4：第二个 preset | 一个实验性 preset 升级为正式支持                                          | 能力矩阵、目标平台 smoke test 与降级诊断                |
| M5：生态扩展      | DevTools、数据库、队列、WebSocket、i18n 等可选能力                        | 各能力独立 fixture、权限审计与稳定性评估                |
| M6：元框架对齐    | 流式 SSR、Server Actions、ISR/per-route 规则、PPR、文件约定 SEO、平台预设补全 | 渲染流式 TTFB 基准、Actions 端到端、ISR 失效、SEO 约定文件 smoke test |

> M6 对应 Phase 9，依据见 [元框架对比与差距分析](framework-comparison.md)。

---

## 10. 与参考项目的差异点

### 10.1 相对 void 的变化

1. **移除 Void Cloud 依赖**: 无登录、无部署平台绑定、无自有云服务
2. **Vue 专属**: 移除 React/Svelte/Solid 适配器，深度优化 Vue
3. **多平台支持**: 从仅 Cloudflare 扩展到 nitro 级别的多平台（Node/Bun/Deno/Cloudflare/Vercel/Netlify 等）
4. **通用部署**: 移除 void deploy 命令，改为各平台标准部署方式
5. **移除内置 Auth**: 不内置 Better Auth，用户可自由选择鉴权方案，通过 middleware + `meta.public` 实现
6. **Cron Jobs 保留并增强**: void 的 defineScheduled/crons 目录保留，参考 nitro 的 scheduledTasks 增加配置式映射
7. **命名导出路由约定**: 采用 void 的 `export const GET`/`POST` 单文件多方法模式（替代 nitro 的文件名后缀）
8. **Hooks 系统增强**: 采用 nitro 的 hookable 完整生命周期
9. **Preset 系统**: 完整的平台预设机制
10. **运行时插件**: 新增 nitro 风格的运行时插件系统
11. **构建工具**: 保留 vite-plus，同时支持 rolldown 构建
12. **defineHandler 增强**: 复用 void 的中间件链式组合，扩展 meta 支持自定义字段（public/rateLimit/cache）
13. **类型安全客户端**: 基于 ofetch 的强类型客户端，消费自动生成的 OpenAPI paths 类型；浏览器上传进度通过 XHR 适配器提供

### 10.2 void 平台特性集成评估

| 特性                 | void 实现                                                 | 集成决策                   | 理由                                                                                           |
| -------------------- | --------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------- |
| **Cron Jobs**        | `crons/` 目录 + `defineScheduled()` + `export const cron` | ✅ **核心集成**            | 通用需求，nitro 也有 scheduledTasks，跨平台可通过平台 cron trigger 或内置调度器实现            |
| **Queues**           | `queues/` 目录 + `defineQueue()` + Cloudflare Queues 绑定 | ⚠️ **Preset 可选**         | 强依赖 Cloudflare Queues/队列基础设施，作为 Cloudflare/Vercel 等平台的 preset 扩展，不纳入核心 |
| **AI (Workers AI)**  | `env.AI` 绑定 + `ai.run()`/`ai.stream()` + AI Gateway     | ❌ **不集成核心**          | Cloudflare 特有能力，用户可通过 plugin 自行注入 binding；不是通用元框架功能                    |
| **Sandboxes**        | `@cloudflare/sandbox` Durable Object + `env.SANDBOX`      | ❌ **不集成**              | Cloudflare Labs 实验性功能，非稳定 API，绑定特定平台，不适合核心                               |
| **WebSocket Rooms**  | `defineRoom()`/`defineWebSocket()` + `.ws.ts` 文件        | ✅ **核心集成**            | WebSocket 是通用需求，crossws 已支持跨平台，void 的 defineRoom 模式优雅                        |
| **KV 存储**          | `env.KV` + `kv.get()/put()/list()`                        | ✅ **通过 unstorage 集成** | 不绑定 Cloudflare KV，使用 unstorage 统一 KV 接口，各平台 preset 注入对应驱动                  |
| **D1/Database**      | `env.DB` Drizzle 集成                                     | ✅ **核心集成（抽象化）**  | 使用 db0 抽象数据库接口，Drizzle 作为一等 ORM，但不绑定 Cloudflare D1                          |
| **Basic Auth**       | 内置 `basicAuth()` middleware                             | ✅ **保留为内置中间件**    | 通用需求，作为可选 middleware 导出                                                             |
| **Better Auth 内置** | 内置 Better Auth 集成                                     | ❌ **移除**                | 鉴权方案多样（Better Auth/Auth.js/自建），不内置特定方案，通过 `meta.public` 支持中间件鉴权    |

### 10.3 相对 nitro 的变化

1. **Hono 替代 h3**: 使用 Hono 作为 HTTP 框架
2. **Inertia 式 Pages**: 内置 SSR 页面路由，无需额外 renderer
3. **Vue 深度集成**: 一等公民 Vue 支持，自动配置 Vue SSR
4. **简化 API**: 面向应用开发者的更简洁 API
5. **vite-plus 优先**: 使用 vite-plus 而非纯 Vite
6. **文件约定优化**: 采用 void 风格的目录约定 (routes/ pages/ middleware/)
7. **环境变量 Schema**: void 风格的 defineEnv 类型安全验证
8. **Skills 内置**: 内置 Agent Skills 系统
9. **客户端类型生成**: 自动生成类型安全的 fetch 客户端
10. **Vue 组件内置**: Link、Head、ClientOnly 等 Vue 组件
11. **OpenAPI 自动文档**: nitro 风格的 OpenAPI 自动生成 + Scalar UI 集成
12. **defineApp 定制**: 取代硬编码入口，支持完整 Vue 插件生态

---

## 11. 关键技术决策

| 决策点      | 选择                                   | 理由                                                 |
| ----------- | -------------------------------------- | ---------------------------------------------------- |
| HTTP 框架   | Hono                                   | 轻量、现代、边缘友好、类型安全、API 优雅             |
| 构建工具    | vite-plus                              | void 已验证、高性能、内置配置管理                    |
| 包管理器    | pnpm\@11                               | monorepo 支持好、catalog 功能、性能优秀              |
| CLI 框架    | citty                                  | unjs 生态、轻量、类型安全                            |
| 配置加载    | c12                                    | unjs 生态、支持 ts 配置、watch 模式                  |
| 路由匹配    | rou3                                   | nitro 使用、高性能、支持编译优化                     |
| Hooks 系统  | hookable                               | unjs 生态、类型安全、同步异步支持                    |
| 存储抽象    | unstorage                              | nitro 使用、多驱动支持                               |
| 数据库抽象  | db0 + Drizzle                          | db0 统一接口 + Drizzle 类型安全 ORM                  |
| WebSocket   | crossws                                | nitro 使用、跨平台兼容                               |
| 测试框架    | vitest (vite-plus)                     | Vite 原生集成、高性能                                |
| 运行器      | env-runner                             | nitro 使用、支持多 runtime worker                    |
| Node 兼容   | unenv                                  | nitro 使用、Cloudflare/Edge 环境 Node API 兼容       |
| 自动导入    | unimport                               | unjs 生态、按需自动导入                              |
| 日志        | consola                                | unjs 生态、美观、可配置                              |
| OpenAPI类型 | @scalar/openapi-types                  | Scalar 维护的 OpenAPI 3.1 类型、nitro 已验证         |
| OpenAPI UI  | @scalar/api-reference (CDN)            | 现代化 API 文档 UI、零构建依赖                       |
| HTTP 客户端 | ofetch + 中间件；浏览器 XHR 上传适配器 | 默认跨 runtime 一致；仅上传进度切换为浏览器 XHR 传输 |

---

## 12. 风险与注意事项

1. **Vite-Plus 版本对齐**: catalog 必须锁定 vite-plus、vite 和 vitest 的兼容版本；升级通过独立兼容性 CI 后才可合并
2. **Preset 测试复杂度**: 多平台测试需要不同环境，部分可使用 miniflare 等模拟
3. **Vue SSR 性能**: 需要注意 SSR 流式渲染和 hydration 优化
4. **类型推导复杂度**: Pages loader/action 的类型推导需要精心设计
5. **Rolldown 稳定性**: Rolldown 仍在发展中，Rollup 作为稳定备选
6. **Hono vs h3 生态**: h3 与 nitro 生态绑定更深，Hono 需要一些适配工作
7. **env-runner 集成**: Worker 开发运行时需要处理好 HMR 和重启逻辑
8. **defineApp 类型兼容**: 需要确保 defineApp 的 async 返回值和 app 实例类型在 SSR/Client 两端一致
9. **OpenAPI meta 提取**: AST 解析 `defineHandlerMeta()` 调用和文件级 `export const meta` 需要处理各种写法（变量引用、展开等），初期可采用 void 方式仅支持字面量对象；OpenAPI Operation 定义已迁移至 hono-openapi 的 `describeRoute` 中间件自动收集
10. **类型链完整性**: ~~defineValidator 多重重载~~已迁移至 hono-openapi 的 validator 中间件，类型由 hono-openapi 自动处理，自定义中间件通过 defineMiddleware 包装保持类型链不断裂
11. **definePage 宏转换**: `<script setup>` 中的 `definePage()` 编译时宏需要 Vite 插件在 Vue SFC 编译阶段拦截提取，避免运行时残留调用
12. **Reuse 路由类型闭环**: `reuse` 字段的类型需要引用已生成的 `RouteName` 联合，存在鸡生蛋问题，需采用两阶段生成（先生成 RouteName 类型，再校验 reuse 引用）
13. **CLI AST 操作安全性**: CLI 使用 ts-morph 修改生成文件时需做好备份，避免用户手动编辑的内容丢失
14. **SSR 序列化与 hydration 安全性**: 页面数据必须采用防 XSS 的序列化格式，并覆盖 `</script>`、Unicode 分隔符、循环引用和 hydration mismatch 测试
15. **路由协议兼容性**: Pages 协议、虚拟模块和生成类型均需带版本；客户端与服务端版本不兼容时应诊断并拒绝继续导航
16. **平台能力语义差异**: 任何新 preset 在进入实验性或正式支持前，都必须记录缓存、cron、WebSocket、Queue、文件系统和 Node 兼容的语义差异及降级行为
17. **DevTools 安全边界**: 必须测试跨 origin 消息拒绝、token 失效、路径逃逸、敏感文件访问与 AI 写操作确认，不能仅验证正常 RPC 路径
18. **公开 API 演进**: exports、配置 schema 和生成类型的变更需声明稳定性等级、迁移说明和弃用周期，避免内部入口成为事实公共 API
19. **上传进度传输差异**: `onUploadProgress` 触发 XHR 与 ofetch 的双传输路径，必须确保认证头、cookie、超时、取消、错误和响应解析一致；SSR、edge 和 internalFetch 必须明确拒绝该选项

---

## 13. 任务跟踪状态

> 状态图例：⬜ 待开始 | 🔄 进行中 | ✅ 已完成

### 已完成阶段总览

| 阶段                              | 状态 | 核心交付                                                                                                                                                |
| --------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 1: 项目骨架                  | ✅   | monorepo + catalog、tsconfig、vitest、CLI 入口（citty）、c12 配置加载、consola 日志                                                                 |
| Phase 2: 构建核心                  | ✅   | 文件扫描（routes/pages/layouts/middleware/plugins/queues/locales）、rou3 路由匹配、虚拟模块框架、Vite 插件骨架、preset 系统（standard/node）、defineHandlerMeta/definePage AST 提取、代码生成（routes.d.ts/pages.d.ts） |
| Phase 3: 运行时核心                | ✅   | Hono 集成、defineHandler/defineMiddleware/defineHandlerMeta、中间件系统、hookable 插件、静态资源、defineEnv、OpenAPI（`/_openapi.json` + Scalar）、Cron 运行时、类型安全客户端（ofetch + XHR 上传适配器）、i18n 运行时、可观测性、SEO metadata |
| Phase 4: Vue Pages 系统            | ✅   | Pages 协议（Inertia 风格）、definePage 宏、Layout 系统（嵌套）、Reuse 路由、路由组、虚拟模块、Vue SSR 渲染器、defineApp、客户端运行时（router/Link/usePage）、Head 管理、Loader/Action、View Transitions、Prefetch、CLI page/api/layout/env/config 命令、Shared Layer |
| Phase 5: 实验性 Preset            | ✅   | capability 矩阵（19 项）、Cloudflare Workers preset、DevRunner 抽象层 + fs.watch 热重载、preset 自动检测、wrangler.toml 生成                                                           |
| Phase 6: 高级特性                  | ✅   | Cache（CacheStore + LRU + 中间件）、SSG 预渲染、Route Rules（headers/redirects/rewrites/cache）、Storage（unstorage 封装 + KV）、Database（db0 + 内存驱动 + 迁移）、WebSocket（Peer/Room/hooks）、SSE、internalFetch、自动导入（unimport）、DevTools 基础架构 + 内置 Tab + CRUD + Hooks + API Playground + AI Assistant + 自定义 Tab、Markdown/MDX 页面、Islands（client:* 指令）、i18n 增强（响应式/自动加载/SSR hydration/plural/Intl 格式化）、Queues、Better Auth 插件、Link 组件、CodeMirror 编辑器、Icon/Image/Content/Fonts/PWA 扩展包 |
| Phase 6b: Vite 模块化架构改造      | ✅   | Dev Server 迁移至 Vite Middleware Mode、Module 系统（`modules` 配置 + `resolveModules` + `ModuleKit` + 拓扑排序 + Hooks）、Vite SSR 生产构建 Pipeline（双构建 + preset 适配）、官方扩展包顶级配置快捷方式（icon/pwa/auth/image/fonts）、模块间依赖与 Hooks 集成 |
| Phase 7: Skills & 文档              | ✅   | Skills 系统（SKILL.md 路由）、内置文档（guide/reference/integrations 共 14 文档）、AGENT_PROMPT.md、ubean init 交互式初始化、示例项目（hello-world/api-routes/pages-basic） |
| Phase 8: 发布认证与测试完善        | ✅   | 单元测试补全（35 文件 811 用例）、DevTools 单元测试（32 用例）、集成与浏览器 e2e 测试（7 集成 + 1 e2e）、preset 测试矩阵、CI/CD（GitHub Actions）、npm scripts 验证                          |
| Phase 9: 元框架对齐补全            | ⬜   | 依据 [元框架对比与差距分析](framework-comparison.md)，补齐与 Next.js/Nuxt/SvelteKit/SolidStart/Astro 的关键差距：流式 SSR、Server Actions、ISR/per-route 规则、PPR、文件约定 SEO、平台预设补全等（P9-01 ~ P9-28） |

### Phase 9：元框架对齐补全

> 依据：[元框架对比与差距分析](framework-comparison.md)
> 目标：补齐与 Next.js 16 / Nuxt 4 / SvelteKit 2 / SolidStart / Astro 5 的关键差距，保持 ubean 独有优势。
> 状态图例同上：⬜ 待开始 | 🔄 进行中 | ✅ 已完成

#### P0 战略级（渲染与变更层，影响核心竞争力）

| ID    | 任务                                      | 状态 | 依赖       | 说明                                                                                                  |
| ----- | ----------------------------------------- | ---- | ---------- | ----------------------------------------------------------------------------------------------------- |
| P9-01 | 流式 SSR (Streaming SSR)                  | ✅   | -          | `@ubean/ssr` 使用 `renderToNodeStream` + `ReadableStream` 分块输出；`SsrOptions.streaming` 配置；`renderPageToStream` + 回退逻辑；13 单元测试 |
| P9-02 | Server Actions / Form Actions             | ✅   | -          | `@ubean/actions` 包：`defineAction` + `'use server'` 指令转换（Vite 插件，server/client 双端 transform）+ 稳定 action ID（base32(SHA-1)）+ 全局注册表 + `/__actions` RPC 中间件 + SvelteKit 风格 `?/<name>` 表单 action（`handlePageRequest` 内联 `mod.actions` 分发）+ 客户端运行时（`callAction`/`useAction`/`useFormAction`）+ `form-actions.ts` 可测试助手（`parseFormActionName`/`handleActionResponse`/`runServerAction`）；49 + 29 单元/集成测试 |
| P9-03 | per-route 渲染规则 + ISR                  | ✅   | -          | 扩展 `RouteRule` 支持 `ssr`/`prerender`/`isr` per-route 字段；`route-rules` 中间件按规则+路径特异性排序合并并通过 `c.get('routeRule')` 暴露；router 根据每路由 `ssr` 覆盖全局设置（`false`/`true`/`'streaming'`）并在 GET 请求走 ISR（TTL + SWR，`peek` 保留过期条目供 stale 回源）；`CacheStore` 扩展可选 `peek`；`prerender` 自动从 `routeRules` 中 `prerender: true` 发现路由；`app.ts` 自动初始化 `cacheStore`；CLI 构建把 `routeRules` 传给 prerender；新增 `route-rules.test.ts`/`isr.test.ts`/`prerender.test.ts`（routeRules 自动发现） |
| P9-04 | Partial Prerendering / Server Islands     | ⬜   | P9-01      | 静态壳 + Suspense 流式动态；对齐 Next.js 16 PPR / Astro `server:defer`                                 |

#### P1 重要级（SEO 与缓存对齐）

| ID    | 任务                                      | 状态 | 依赖       | 说明                                                                                                  |
| ----- | ----------------------------------------- | ---- | ---------- | ----------------------------------------------------------------------------------------------------- |
| P9-05 | 文件约定 SEO                              | ⬜   | -          | `sitemap.ts`/`robots.ts`/`manifest.ts`/`opengraph-image.tsx`/`icon.tsx` 约定文件扫描；对齐 Next.js     |
| P9-06 | OG Image 动态生成                         | ⬜   | -          | 集成 Satori + resvg（或 `@vercel/og`）；对齐 Next.js `ImageResponse`                                  |
| P9-07 | JSON-LD / Schema.org 结构化数据           | ⬜   | -          | `@ubean/seo` 增加 `useSchemaOrg()`/`defineJsonLd()`；对齐 Nuxt `nuxt-schema.org`                      |
| P9-08 | 组件级缓存指令                            | ⬜   | -          | `"use cache"` + `cacheLife()`/`cacheTag()` 宏 + AST 转换；对齐 Next.js 16                             |
| P9-09 | 全局 Hooks (handle/handleFetch/handleError) | ⬜ | -          | `@ubean/app` 增加全局 hooks 入口；对齐 SvelteKit hooks                                                |
| P9-10 | 平台预设补全（合并 P5-06）                | ⬜   | -          | Vercel/Netlify/Bun/Deno preset；合并原 P5-06，先完成能力矩阵和 ADR                                    |

#### P2 增强级（提升完整度）

| ID    | 任务                                      | 状态 | 依赖       | 说明                                                                                                  |
| ----- | ----------------------------------------- | ---- | ---------- | ----------------------------------------------------------------------------------------------------- |
| P9-11 | 通用 Sessions API                         | ⬜   | -          | `Astro.session` 式服务端 session；当前仅有 auth session                                               |
| P9-12 | CSRF 保护中间件                           | ⬜   | -          | 对齐 Astro 5 默认开启的 CSRF 保护                                                                     |
| P9-13 | 安全头（CSP/HSTS/X-Frame-Options）        | ⬜   | -          | 对齐 Astro 6 CSP / Next.js headers                                                                    |
| P9-14 | `after()` 响应后执行 API                  | ⬜   | -          | 日志/分析/缓存失效不阻塞 TTFB；对齐 Next.js 16 `after()`                                              |
| P9-15 | 请求 memoization（fetch 自动去重）        | ⬜   | -          | 对齐 Next.js 自动 fetch memoization                                                                   |
| P9-16 | Single-flight mutations                   | ⬜   | P9-02      | 避免变更后瀑布；对齐 SolidStart                                                                       |
| P9-17 | 嵌套布局（多层）                          | ⬜   | -          | 当前仅单层 `layout`；对齐 Next/Nuxt/SvelteKit 多层嵌套                                                |
| P9-18 | 并行路由 / 拦截路由                       | ⬜   | -          | 对齐 Next.js `@folder` slots + `(..)` 拦截                                                            |
| P9-19 | Live Content Collections                  | ⬜   | -          | 请求时拉取；对齐 Astro 5.10+ Live Collections                                                         |
| P9-20 | MDX 真实编译                              | ⬜   | -          | 当前仅类型注册无 MDX 编译器；对齐 Next/Nuxt/Astro/SvelteKit                                           |
| P9-21 | Color mode（深浅色）                      | ⬜   | -          | 对齐 Nuxt `@nuxtjs/color-mode`（当前委托 @soybeanjs/ui）                                              |
| P9-22 | 第三方脚本优化（Partytown 集成）          | ⬜   | -          | 对齐 Nuxt `@nuxtjs/scripts` / Astro partytown                                                         |
| P9-23 | Draft / Preview mode                      | ⬜   | -          | 对齐 Next.js `draftMode()` / Astro                                                                    |
| P9-24 | 流式 metadata                             | ⬜   | P9-01      | 流式 SSR 基础上的 metadata 流式；对齐 Next.js                                                         |
| P9-25 | Email 发送                                | ⬜   | -          | 内置邮件发送原语                                                                                      |
| P9-26 | 全文搜索（Pagefind 集成）                 | ⬜   | -          | 对齐 Astro Pagefind                                                                                   |
| P9-27 | Analytics（页面访问统计）                 | ⬜   | -          | 当前仅有 observability；补充页面访问统计                                                              |
| P9-28 | A/B 测试 / Feature flags                  | ⬜   | -          | 内置特性开关原语                                                                                      |

### 待办任务（非 Phase 9）

| ID    | 任务             | 状态 | 优先级 | 说明                                           |
| ----- | ---------------- | ---- | ------ | ---------------------------------------------- |
| P5-06 | ~~后续平台提案~~ | —    | —      | 已合并入 P9-10，不再单独跟踪                   |

> 各已完成阶段的任务明细（P1-01 ~ P8-06）见 git 历史；本表只保留当前活跃的待办项。

---

### 已决策事项（原 TBD）

| ID     | 事项                    | 决策      | 方案说明                                                                                                                                                                                                                                                                                                                                                                                         | 对应任务    |
| ------ | ----------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| TBD-01 | DevTools 客户端 UI 方案 | ✅ 已决策 | UI 全部基于 @soybeanjs/ui 实现（Table 组件原生支持虚拟滚动，无需额外表格库）；代码编辑器选用 **CodeMirror 6**（轻量 \~200KB、模块化、专为嵌入式场景设计，DevTools iframe 场景远优于 Monaco 的 \~3MB 体积），支持 JSON/JS/Vue 语法 + One Dark 主题                                                                                                                                                | P6-25       |
| TBD-02 | 队列(Queues) 设计       | ✅ 已决策 | 参考 void 的 Proxy 动态绑定模式但跨平台抽象化：`queues/` 目录 + `defineQueue<T>()` 定义队列，各 preset 注入平台驱动（Node=BullMQ/内存、CF=Queues、Vercel=Queues、Bun=Worker、Deno=Queue），自动生成 `.ubean/queues.d.ts` 类型                                                                                                                                                                    | P6-22       |
| TBD-03 | Islands 架构实现        | ✅ 已决策 | 参考 void 的 islands 编译时扫描思路，但采用更符合 Vue 习惯的 **Astro 风格** **`client:*`** **指令**（`client:load/idle/visible/media/only`）而非 Import Attributes；编译时扫描 `client:*` 指令自动标记孤岛组件，无孤岛的页面不发送客户端 JS。**v1.0 增强**：组件自动注册 —— Vite 插件扫描 `client:*` 指令 + 解析 `<script setup>` import，生成 `virtual:ubean-islands-registry` 虚拟模块，`hydrateIslands` 的 `components` 参数变为可选（手动传入优先）                      | P6-18       |
| TBD-04 | 国际化(i18n)集成        | ✅ 已决策 | void 和 nitro 均无内置 i18n，ubean 内置轻量 i18n：`locales/` 目录 + `defineLocale()` 定义消息，支持 `prefix/prefix_except_default/no_prefix` 三种路由策略，`useI18n()` composable，`<Link>` 自动处理 locale 前缀                                                                                                                                                                                 | P6-21       |
| TBD-05 | 认证(Auth)插件方案      | ✅ 已决策 | 参考 void 的 Better Auth 集成模式，以官方插件 `ubean-auth` 形式提供（非核心内置）：注册 `/api/auth/*` 路由、提供 `useAuth()` composable、`c.get('user')` 获取用户、与 `meta.public` 配合实现路由鉴权                                                                                                                                                                                             | P6-23       |
| TBD-06 | Markdown/MDX 支持       | ✅ 已决策 | **内置** Markdown 页面：`pages/**/*.md` 与 `.vue` 页面混放，`front-matter` 解析 YAML frontmatter，[`markdown-exit`](https://github.com/serkodev/markdown-exit)（markdown-it 的 TS 重写版，原生 async）渲染正文，通过 `@shikijs/markdown-exit` 集成 Shiki 代码高亮，支持嵌入 Vue 组件配合 islands client 指令；MDX 可选开启（`markdown.mdx: true`）                                               | P6-17       |
| TBD-07 | 组件自动导入            | ✅ 已决策 | **内置**且默认启用，通过配置开关控制：Composables 使用 `unimport` 自动导入（`composables/`目录），Vue 组件使用 `unplugin-vue-components` 自动导入（`components/`目录），自动生成 `.d.ts` 类型文件                                                                                                                                                                                                | P6-19/P6-20 |
| TBD-08 | 类型安全 Link 组件      | ✅ 已决策 | **类型化**：`<Link>` 组件的 `to` 属性类型约束为 `RouteName` 联合类型，`:params` 类型推导与路由参数匹配，CLI/DevTools 修改路由时自动更新类型                                                                                                                                                                                                                                                      | P6-24       |
| TBD-09 | Icon 图标扩展           | ✅ 已决策 | 以 **Nuxt Icon** 为第一参考，实现独立 `@ubean/icon`：基于 Iconify 按需 collection 与本地 SVG collection，默认 SVG 输出，静态扫描/显式声明写入 client bundle；Node SSR 可本地按需服务，SSG、Edge 与测试使用离线 bundle 或明确 remote provider，默认禁止生产环境回退公共 Iconify API                                                                                                               | P6-26       |
| TBD-10 | 页面数据协议            | ✅ 已决策 | 参考 SvelteKit：loader 以 `depends()` 声明逻辑依赖，action 以 `invalidate` 精确刷新；同源调用优先 `internalFetch`，非关键数据使用 defer/stream，preset 必须声明 stream 或 buffered fallback 语义                                                                                                                                                                                                 | P4-20       |
| TBD-11 | 可观测性与 SEO          | ✅ 已决策 | 参考 Next.js：`@ubean/observability` 以 request ID、Hookable spans 与 OpenTelemetry adapter 为边界；Head 管理之上提供结构化 metadata、sitemap/robots/manifest 与可选 OG 图生成                                                                                                                                                                                                                   | P3-17/P3-18 |
| TBD-12 | Image/Content/Fonts/PWA | ✅ 已决策 | Image、Content、Fonts 分别以 Nuxt Image、Nuxt Content v3、Nuxt Fonts 为第一参考，均为官方可选扩展；PWA 保持 opt-in。详细 API、边界、延后项与验收见 [生态能力演进](ecosystem.md)                                                                                                                                                                                                                  | P6-27~P6-30 |
| TBD-13 | Vite 模块化架构         | ✅ 已决策 | 参考 Nuxt modules 模式：dev server 迁移至 Vite middleware mode（`vite.middlewares` 接入 Connect），用户通过 `ubean.config.ts` 的 `modules` 字段声明插件（支持字符串/元组/实例三种形式），框架自动装配内置 ubean 插件与用户模块；官方扩展包提供顶级配置糖（`icon`/`pwa`/`auth`/`image`/`fonts`）；Vite SSR 双构建输出适配 Node/Standard/Cloudflare preset；保留 vite.config.ts 作为高级自定义入口 | P6-36~P6-40 |
