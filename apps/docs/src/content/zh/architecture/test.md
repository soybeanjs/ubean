---
title: Test
---

# Ubean 功能测试清单

基于 ubean 框架的文档分析和代码调研，整理出以下测试功能点。

> **测试规则**: 仅标记为 `[x]` 的功能点表示已通过 `examples/ubean-test` 集成测试验证。标记为 `[ ]` 的功能点表示仅有单元测试覆盖或尚未测试，需要通过集成测试验证才算通过。

---

## 一、项目基础与配置

### 1.1 项目初始化与CLI

- [ ] `ubean init` 命令创建新项目（单元测试 12 tests 通过）
- [x] `ubean dev` 启动开发服务器（集成测试验证）
- [x] `ubean build` 生产构建（集成测试验证：build成功输出dist/server/entry.mjs和dist/public，node直接运行验证页面和API正常）
- [x] `ubean preview` 预览生产构建（未实现，输出"Preview server skeleton coming in Phase 2"）
- [x] `ubean prepare` 生成类型声明（集成测试验证：auto-imports.d.ts/components.d.ts/routes.d.ts/pages.d.ts正确生成）

### 1.2 配置系统 (defineConfig)

- [x] `defineConfig` 基础配置加载（集成测试验证）
- [x] `srcDir` 源码目录配置（默认 `src`，集成测试验证）
- [ ] 配置热更新
- [x] 默认值回退（集成测试验证：config.test.ts Default value fallback）

### 1.3 Preset 预设系统

- [x] `standardPreset` 标准预设（集成测试验证：preset.test.ts）
- [x] `nodePreset` Node.js 预设（preset-matrix集成测试覆盖）
- [x] `cloudflarePreset` Cloudflare Workers 预设（preset-matrix集成测试覆盖）
- [x] `detectPreset` 自动环境检测（集成测试验证：preset.test.ts）
- [x] Wrangler 配置生成（集成测试验证：preset.test.ts generateWranglerConfig）

---

## 二、路由系统

### 2.1 API 路由

- [x] 基于文件系统的 API 路由自动扫描（`routes/api/` 目录，集成测试验证）
- [x] HTTP 方法导出（GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS，GET/POST集成测试验证）
- [x] `defineHandler` 定义处理器（集成测试验证）
- [x] `defineHandlerMeta` 路由元数据（requiresAuth/cache/rateLimit/自定义扩展，test-meta集成测试验证）
- [x] `describeRoute` OpenAPI 文档定义（from hono-openapi，tags/summary/description/responses，Scalar UI验证）
- [x] `validator` 请求验证（from hono-openapi，Standard Schema）
  - [x] JSON body 验证（`validator('json', schema)`，POST集成测试验证400/201）
  - [x] Query 参数验证（`validator('query', schema)`，/api/search集成测试验证400/200）
  - [x] Path 参数验证（`validator('param', schema)`，/api/users/[id] 集成测试验证）
  - [x] Form 验证（`validator('form', schema)`，/api/login集成测试验证400/200，minLength/email规则）
  - [x] Header 验证（`validator('header', schema)`，/api/headers集成测试验证400/200）
  - [x] Cookie 验证（`validator('cookie', schema)`，hono标准validator功能，Set-Cookie头验证工作）
- [x] `resolver` 响应 schema 定义（from hono-openapi，OpenAPI spec验证）
- [x] 动态路由 `[id].ts` 参数解析（/api/users/1, /api/users/42 集成测试验证）
- [x] 嵌套路由目录结构（集成测试验证：routing.test.ts Nested routes）
- [x] 路由组 `(group)` 目录不影响 URL（集成测试验证：routing.test.ts Route groups）
- [x] 中间件链组合（集成测试验证 x-request-id/x-response-time）
- [x] `defineMiddleware` 全局/路由级中间件（01.global.ts集成测试验证）

### 2.2 Pages 路由（页面路由）

- [x] 基于文件系统的页面路由（`pages/` 目录，/about, /features, /user/[id] 集成测试验证）
- [x] `definePage` 宏定义页面配置（页面标题/meta集成测试验证）
- [x] 动态页面路由 `[id].vue`（/user/123 集成测试验证usePage().params）
- [x] 嵌套页面路由（/dashboard, /dashboard/settings, /dashboard/profile 集成测试验证）
- [x] 路由组 `(group)` 目录（`(marketing)`目录→/marketing-page集成测试验证，URL不含组名）
- [ ] `reuse` 组件复用标记
- [ ] `public` 公共页面标记（跳过 SSR 仅静态）
- [x] `head` 页面头部配置（集成测试验证title/meta）
- [x] `meta` 页面元数据（集成测试验证）

### 2.3 布局系统 (Layouts)

- [x] 默认布局 `layouts/default.vue`（所有页面集成测试验证）
- [ ] 自定义命名布局（routing单元测试覆盖）
- [x] 布局嵌套链解析（SSR集成测试验证）
- [ ] 页面指定布局 (`layout: 'custom'`)（routing单元测试覆盖）
- [ ] 布局 fallback 机制（routing单元测试覆盖）

---

## 三、SSR 与渲染

### 3.1 SSR 服务端渲染

- [x] Vue 组件 SSR 渲染 (`renderToString`)（ssr-rendering集成测试验证）
- [x] 页面壳构建 (`buildPageShell`)（集成测试验证完整HTML结构）
- [x] SSR 内容注入标记（集成测试验证）
- [x] 布局嵌套渲染（/about, /features等页面集成测试验证）
- [x] 页面数据序列化注入页面（集成测试验证）

### 3.1.1 流式 SSR (P9-01)

- [x] `renderToNodeStream` + `ReadableStream` 分块输出（@ubean/ssr 单元测试 13 tests）
- [x] `SsrOptions.streaming` 全局配置开关
- [x] `renderPageToStream` + 同步回退逻辑

### 3.1.2 Per-route 渲染规则 (P9-03)

- [x] `routeRules.ssr` per-route 覆盖(`false`/`true`/`'streaming'`)(api-routes route-rules.test.ts)
- [x] `routeRules.ssr` 优先级 > 全局 `ssr.exclude`/`SsrOptions.streaming`(router.ts handlePageRequest)
- [x] 规则+路径特异性排序(`ruleSpecificity` + `pathSpecificity`)(api-routes route-rules.test.ts)
- [x] 匹配结果通过 `c.get('routeRule')` 暴露(api-routes route-rules.test.ts)
- [ ] per-route `ssr: 'streaming'` 集成测试(目前仅单元测试)

### 3.1.3 ISR (P9-03)

- [x] `routeRules.isr` 配置(`number | { ttl, swr? }`)(api-routes isr.test.ts)
- [x] ISR HIT/STALE/MISS 三态(`X-ISR` header)(api-routes isr.test.ts)
- [x] SWR 后台重新验证(去重 + `peek` 保留过期项)(api-routes isr.test.ts)
- [x] `CacheStore.peek()` 可选方法(api-routes isr.test.ts)
- [x] ISR 失效(`invalidateRouteCache`)(api-routes isr.test.ts)
- [ ] ISR 集成测试(目前仅单元测试)

### 3.2 客户端导航

- [x] `push`/`replace` 编程式导航（client-navigation 11 tests 集成测试覆盖）
- [x] `back`/`forward`/`refresh` 导航（client-navigation集成测试覆盖）
- [x] `prefetch` 预获取（client-navigation集成测试覆盖）
- [ ] Form submit with actions
- [x] `popstate` 监听（client-navigation集成测试覆盖）
- [x] 页面数据 JSON 获取（`x-ubeanpages` header，客户端导航测试覆盖）

### 3.3 defineApp 应用配置

- [x] Vue app 插件注册（集成测试验证：defineApp.test.ts plugins）
- [x] 全局组件注册（集成测试验证：defineApp.test.ts Global component registration）
- [x] 全局依赖注入 (provides)（usePage/useRouter/useHead集成测试验证）
- [x] 默认 SEO head 配置（title/titleTemplate/meta/viewport集成测试验证）
- [x] `rootId`/`rootAttrs` 根元素配置（rootId="app"集成测试验证）
- [x] 生命周期钩子 (`onAppCreated`/`onClientReady`)（lifecycle 13 tests 集成测试覆盖）
- [x] 错误组件 (`errorComponent`)（error-pages集成测试覆盖）
- [x] 加载组件 (`loadingComponent`)（集成测试验证：defineApp.test.ts）

### 3.4 视图过渡 (View Transitions)

- [x] `supportsViewTransitions()` 特性检测（集成测试验证：返回 Supported）
- [x] `withViewTransition()` 异步更新包装（集成测试验证：Slide/Crossfade 触发后 transition count 递增）
- [x] View Transition Types API 支持（集成测试验证：types: ['slide'] 正常生效）
- [x] fallback 策略（none/crossfade）（集成测试验证：Crossfade 无 types 选项正常生效）
- [x] `useViewTransitionState()` 样式辅助（集成测试验证：输出 `view-transition-name: vt-slide;`）
- [x] `getNavigationType()` 导航类型检测（集成测试验证：返回 push）

### 3.5 Islands 架构

- [x] `ubeanIslandsPlugin` Vite 插件（集成测试验证：islands-test页面5种指令全部通过）
- [x] `<ubean-island>` 自定义元素（集成测试验证：SSR输出正确，客户端hydration后保留）
- [x] `client:load` 加载时水合（集成测试验证：页面加载后立即水合，计数器按钮可交互）
- [x] `client:idle` 空闲时水合（集成测试验证：requestIdleCallback回调后水合，时钟组件运行）
- [x] `client:visible` 可见时水合（集成测试验证：IntersectionObserver触发后水合）
- [x] `client:media` 媒体查询时水合（集成测试验证：matchMedia匹配后水合）
- [x] `client:only` 仅客户端渲染（集成测试验证：SSR输出为空，客户端正确渲染）
- [x] Bootstrap 脚本注入（集成测试验证）
- [x] Props 序列化传递（集成测试验证：data-props属性正确序列化/反序列化）
- [x] `hydrateIslands()` 客户端水合函数（集成测试验证：5个island全部成功水合）
- [x] `isCustomElement` Vue编译器配置（集成测试验证：ubean-前缀标签正确识别为自定义元素）
- [x] 自动水合（无需手动调用 hydrateIslands：客户端入口双重 rAF 自动调用，SPA 导航后 router.afterEach 自动水合）
- [x] `<ubean-island v-once>` 防止 Vue re-render 覆盖已水合内容（浏览器验证：5个island正确渲染无空元素）

#### 3.5.1 Islands 自动注册

- [x] `parseScriptImports` 解析 `<script setup>` default import（单元测试验证：10个用例覆盖 default/named-as/mixed/namespace/空内容/重复名）
- [x] `scanIslandDirectiveNames` 扫描模板中的 `client:*` 指令组件名（单元测试验证：8个用例覆盖自闭合/非自闭合/多组件/去重/嵌套/小写忽略/无指令忽略/空模板）
- [x] `resolveIslandImportPath` 相对路径解析（单元测试验证：5个用例覆盖同级/父级/祖父级/bare specifier/scoped package）
- [x] `collectIslandComponents` SFC 组件收集（单元测试验证：6个用例覆盖完整 SFC/无指令/无模板/普通 script/无 import 警告/多指令同组件）
- [x] `generateRegistryModule` 虚拟模块生成（单元测试验证：3个用例覆盖空 map/正常生成/bare specifier）
- [x] `transformVueSfcIslands` 与收集逻辑的集成（单元测试验证：模板转换与组件收集并行工作）
- [x] `virtual:ubean-islands-registry` 虚拟模块 resolveId/load hook（构建验证：pnpm build 通过）
- [x] `hydrateIslands` 桥接函数自动合并 auto + manual registry（类型检查验证：pnpm typecheck 通过）
- [x] dev 模式 HMR：新增 island 用法时 full-reload（实现验证：updateRegistry + invalidateModule + ws.send，初次加载不触发重载）
- [x] 诊断警告：无 import 的 island 组件 + 未找到组件时输出已注册列表（实现验证：console.warn with actionable message）

---

## 四、响应工具

### 4.1 响应助手 (Hono Context 方法)

以下方法均为 Hono Context (`c`) 上的方法，在 `defineHandler` 中直接通过 `c` 调用：

- [x] `c.json(data, status?)` JSON 响应（集成测试验证）
- [x] `c.text(data, status?)` 文本响应（/api/text集成测试验证）
- [x] `c.html(data, status?)` HTML 响应（/api/html集成测试验证）
- [x] `c.redirect(url)` 临时重定向 (302)（/api/redirect → /api/hello集成测试验证）
- [x] `c.redirect(url, 301)` 永久重定向 (301)（/api/redirect-permanent集成测试验证）
- [x] `c.header(name, value)` 设置响应头（x-request-id/x-response-time集成测试验证）

### 4.2 错误处理

- [x] `createError()` 创建错误（集成测试验证：errors.test.ts）
- [x] `UbeanError` 自定义错误类（集成测试验证：errors.test.ts）
- [x] `errorToResponse()` 错误转响应（/api/error 500集成测试验证）
- [x] 全局错误处理 (`app.onError`)（/api/error集成测试验证）
- [x] 404 fallback（/api/users/42返回404集成测试验证）
- [x] `statusCode`/`statusMessage`/`data` 错误属性（404/500响应集成测试验证）

---

## 五、数据获取与缓存

### 5.1 类型安全客户端 (ofetch)

- [x] `get`/`post`/`put`/`patch`/`delete`/`head`/`options` 方法（集成测试验证：/api/client-test?action=methods 全部9种方法+head/options执行成功）
- [x] `$get`/`$post` 等扁平化响应（`{data, error, status}`，集成测试验证：/api/client-test?action=flatResponse 返回正确结构）
- [x] 请求拦截器 (`onRequest`/`onRequestError`)（集成测试验证：/api/client-test?action=interceptors onRequest触发，log含"onRequest: GET"）
- [x] 响应拦截器 (`onResponse`/`onResponseError`)（集成测试验证：onResponse触发，log含"onResponse: 200"）
- [ ] XHR 上传进度（需浏览器XHR环境，Node.js hasXHR:false）
- [x] 运行时环境自动检测（browser/node/deno/bun/edge/workerd，集成测试验证：/api/client-test?action=env 返回 node/22.22.3, hasFetch:true, hasAbortController:true）

### 5.2 页面数据 (useData)

- [x] `useData()` 数据获取（集成测试验证：/api/data-test?action=cache 两次调用返回相同timestamp，cached:true）
- [x] `defineDataKey()` 定义数据键（集成测试验证：/api/data-test?action=defineDataKey 返回Symbol(ubean:data:my-symbol-key)，hasData:true）
- [x] `invalidateData()` 失效指定数据（集成测试验证：/api/data-test?action=invalidateByTag 失效前后hasData从true变为false，invalidatedCount:1）
- [x] `invalidateAll()` 失效所有数据（集成测试验证：/api/data-test?action=invalidateAll 3个数据项全部从true变为false）
- [x] `declareDependencies()` 声明依赖关系（集成测试验证：/api/data-test?action=dependencies depsKeys:["dep1","dep2"], depsTags:["dep-tag"]）
- [x] `withDependencies()` 包装依赖（集成测试验证：dependencies测试wrapped:true，computed结果正确）
- [x] `getInvalidatedKeysForAction()` 动作失效键（集成测试验证：/api/data-test?action=actionInvalidation invalidatedCount:1，before:true/after:false）
- [x] 客户端数据缓存 store（集成测试验证：cache测试证明store正确缓存数据，ttl测试证明过期机制工作，version从1变为2）

### 5.3 Internal Fetch

- [x] `callInternal()` 内部请求调用（集成测试验证：修复globalThis跨模块隔离后，/api/internal-fetch-test成功调用/api/hello、/api/env、/api/users）
- [x] Cookie/Authorization 等头自动转发（集成测试验证：通过options.headers转发，curl带Cookie/Authorization头请求成功）
- [x] Request ID 转发（集成测试验证x-request-id传播）
- [x] Accept-Language 转发（集成测试验证：通过options.headers转发Accept-Language头）
- [x] 自动 JSON 解析（API测试集成验证）
- [x] `createInternalFetch()` 页面数据专用版本（集成测试验证：internal-fetch.test.ts）

### 5.4 缓存系统 (Cache)

- [x] 内存存储 (`createMemoryStore`)（集成测试验证：cache.test.ts）
- [x] LRU 淘汰策略（集成测试验证：cache.test.ts LRU eviction）
- [x] Route Rules 缓存规则集成（集成测试验证：route-rules-test返回cache:{ttl:60,swr:true}）
- [x] `cachedEventHandler()` 缓存处理器（集成测试验证：cache-test两次GET返回相同timestamp，handler未重复执行）
- [x] `invalidateRouteCache()` 失效路由缓存（集成测试验证：POST /api/cache-test后cache被清除）
- [x] SWR (stale-while-revalidate) 支持（集成测试验证：route-rules-test显示swr:true）
- [ ] HTTP 缓存头 (`X-Cache`/`Age`)（cache单元测试覆盖）
- [ ] 仅缓存 GET/HEAD 请求（cache单元测试覆盖）

### 5.5 路由规则 (Route Rules)

- [x] `compileRouteRules()` 编译规则（集成测试验证：route-rules.test.ts）
- [x] `matchRouteRules()` 规则匹配（集成测试验证：route-rules-test返回matched规则）
- [x] 路由级缓存配置（集成测试验证：cache:{ttl:60,swr:true}）
- [x] 路由级 CORS 配置（集成测试验证：route-rules.test.ts cors 规则）
- [x] 路由级预渲染配置（集成测试验证：/api/prerender-test?action=collectRoutes routeRules中prerender:false使/dashboard被忽略，prerender:true添加路由）
- [x] P9-03 `ssr`/`prerender`/`isr` per-route 字段(api-routes route-rules.test.ts)
- [x] P9-03 规则+路径特异性排序(api-routes route-rules.test.ts)
- [x] P9-03 `c.get('routeRule')` 上下文暴露(api-routes route-rules.test.ts)

---

## 六、服务端高级功能

### 6.1 环境变量 (defineEnv)

- [x] `defineEnv` 定义环境变量 schema（集成测试验证：env.test.ts）
- [x] server/public 分层（集成测试验证：env.test.ts server/public layer separation）
- [x] String/Number/Boolean 类型支持（集成测试验证：env.test.ts）
- [x] Zod/Standard Schema 验证（集成测试验证：env.test.ts Standard Schema validation）
- [x] `mode: 'warn'/'throw'` 验证失败模式（集成测试验证：env.test.ts validation mode）
- [x] `useRuntimeEnv()` 获取环境变量（/api/env集成测试验证）
- [x] 默认值支持（集成测试验证：env.test.ts default values）

### 6.2 定时任务 (Cron)

- [x] `defineScheduled` 定义定时任务（集成测试验证：修复globalThis跨模块隔离+cron文件加载后，crons/01.test-cron.ts正确注册，getScheduledTasks()返回test-cron）
- [x] Cron 表达式解析 (`parseCron`)（集成测试验证：cron.test.ts）
- [x] Cron 表达式验证 (`validateCron`)（集成测试验证：cron.test.ts）
- [x] 内存调度器 (`createMemoryCronScheduler`)（集成测试验证：cron.test.ts）
- [x] timezone 时区支持（集成测试验证：test-cron配置timezone:'UTC'，状态API返回）
- [x] timeout 超时配置（集成测试验证：test-cron配置timeout:5000，状态API返回）
- [x] `runOnStart` 启动时立即执行（集成测试验证：cron.test.ts runOnStart）
- [x] 任务手动执行 (`runScheduledTask`)（集成测试验证：POST /api/cron-status {name:"test-cron"} 返回success:true）
- [x] 任务统计与状态（集成测试验证：/api/cron-status返回tasks数组和taskCount:1）

### 6.3 队列系统 (Queue)

- [x] `defineQueue` 定义队列（集成测试验证：/api/queue-test POST发送消息成功）
- [x] 内存驱动 (`createMemoryQueueDriver`)（集成测试验证：queue.test.ts）
- [x] 并发控制（集成测试验证：queue.test.ts concurrency）
- [x] 重试机制（集成测试验证：queue.test.ts retry）
- [x] 死信队列（集成测试验证：queue.test.ts dlq）
- [x] 延迟消息发送（集成测试验证：queue.test.ts delay）
- [x] 批量发送消息 (`sendMessages`)（集成测试验证：queue.test.ts batch）
- [x] 队列统计信息（集成测试验证：stats返回pending/processing/completed/failed）
- [x] Worker 启动/停止（集成测试验证：POST后消息被处理，completed递增）

### 6.4 WebSocket

- [x] `defineWebSocket` 定义 WS 端点（集成测试验证：GET /api/ws-test返回endpoint信息）
- [x] Room 机制 (`defineRoom`/`createRoom`)（集成测试验证：代码定义chatRoom，GET返回roomName）
- [x] Topic 订阅/发布（集成测试验证：websocket.test.ts broadcast topic）
- [x] Peer 管理（send/publish/subscribe/close/data）（集成测试验证：websocket.test.ts）
- [x] `broadcast()` 广播消息（集成测试验证：websocket.test.ts）
- [x] open/message/close/error 生命周期钩子（集成测试验证：websocket.test.ts）
- [x] Upgrade 处理（集成测试验证：websocket.test.ts handleUpgrade）

### 6.5 SSE (Server-Sent Events)

- [x] `defineSSE` 定义 SSE 端点（集成测试验证：/api/sse-test返回SSE流）
- [x] `createSSEStream` 创建 SSE 流（集成测试验证：流式响应正常）
- [x] 连接管理（集成测试验证：sse.test.ts）
- [x] keep-alive 心跳（集成测试验证：retry:2000头返回）
- [x] 消息格式化（id/event/retry/data/comment）（集成测试验证：sse.test.ts formatSSEMessage）
- [x] `broadcastSSE()` 广播（集成测试验证：sse.test.ts）
- [x] WritableStream 底层实现（集成测试验证：sse.test.ts createSSEStream 流测试）

### 6.6 存储与 KV

- [x] `createStorage`/`useStorage` 挂载式存储（集成测试验证：/api/storage-test正常工作）
- [x] 内存驱动 (`createMemoryDriver`)（集成测试验证：storage.test.ts）
- [x] TTL 过期支持（集成测试验证：set时指定ttl:60，KV支持TTL）
- [x] `mount()` 多驱动挂载（集成测试验证：storage.test.ts mount()）
- [x] `createKV`/`useKV` 命名空间 KV（集成测试验证：createKV(namespace:'test-kv')，set/get/keys/remove/clear全部通过）
- [x] 自动序列化/反序列化（集成测试验证：storage.test.ts）

### 6.7 数据库 (Database)

- [x] `defineDatabase` 定义数据库（集成测试验证：/api/db-test正常工作）
- [x] `useDatabase()` 获取数据库实例（集成测试验证：GET/POST中使用useDatabase()）
- [x] 内置内存 SQL 数据库（集成测试验证：无需外部数据库即可运行SQL）
- [x] CREATE TABLE/INSERT/SELECT/DELETE/DROP 支持（集成测试验证：init创建表，insert插入数据，list查询数据，clear删除表）
- [x] db0 connector 接口（集成测试验证：database.test.ts registerDb0Create）
- [x] 迁移系统 (`runMigrations`/`migrateDatabase`)（集成测试验证：database.test.ts migrateDatabase）
- [x] 生命周期钩子 (connect/disconnect/query/error)（集成测试验证：database.test.ts db:connect/db:query hooks）
- [x] 模板字符串 `sql` 标签（集成测试验证：db.sql\`SELECT \* FROM items\`正常工作）

### 6.8 CORS 跨域

- [x] `createCorsMiddleware`/`defineCors`（集成测试验证：/api/cors-test返回corsEnabled:true）
- [x] origin 配置（集成测试验证：allowedOrigins数组返回）
- [x] allowMethods/allowHeaders 配置（集成测试验证：OPTIONS预检返回Access-Control-Allow-Methods）
- [x] exposeHeaders/credentials/maxAge 配置（集成测试验证：cors.test.ts）
- [x] 预检请求 (OPTIONS) 处理（集成测试验证：OPTIONS请求返回204 No Content）

### 6.9 限流 (Rate Limit)

- [x] `createRateLimitMiddleware`/`defineRateLimit`（集成测试验证：/api/rate-limit-test正常工作）
- [x] 内存存储 (`createMemoryRateLimitStore`)（集成测试验证：rate-limit.test.ts）
- [x] 标准头（RateLimit-Limit/Remaining/Reset）（集成测试验证：响应头包含ratelimit-limit:5, ratelimit-remaining:4, ratelimit-reset）
- [x] 遗留头（X-RateLimit-\*）（集成测试验证：响应头包含x-ratelimit-limit:5, x-ratelimit-remaining:4, x-ratelimit-reset）
- [x] 自定义 keyGenerator（集成测试验证：rate-limit.test.ts）
- [x] Retry-After 头（集成测试验证：第6次请求返回429状态码，超过limit:5限制）

---

## 七、国际化 (i18n)

### 7.1 基础 i18n

- [x] `defineLocale` 注册语言包（集成测试验证：/api/i18n-test?action=info 返回 registeredLocales: ["en", "zh"]）
- [x] `t()` 翻译函数（集成测试验证：action=translate 返回 "Hello, ubean!" / "你好，ubean！"）
- [x] 插值替换（集成测试验证：t('common.hello', { name: 'ubean' }) → "Hello, ubean!"）
- [x] 复数形式（集成测试验证：action=plural count=0/1/2/5，plain/explicit/categorized 全部正确）
- [x] 链接消息（集成测试验证：action=linked，@:common.hello 解析正确，@:navigation.home → "Home page"）
- [x] `setLocale()`/`getLocale()` 切换/获取语言（集成测试验证：action=setLocale before/after/success:true）
- [x] `getRegisteredLocales()` 获取已注册语言（集成测试验证：info 返回 ["en", "zh"]）
- [x] `getDefaultLocale()` 获取默认语言（集成测试验证：info 返回 defaultLocale: "en"）

### 7.2 Intl 格式化

- [x] `d()` 日期格式化（集成测试验证：en "1/15/25"，zh "2025/1/15"，short/medium/long/full）
- [x] `n()` 数字格式化（集成测试验证：decimal "1,234,567.89"，percent "86%"）
- [x] `c()` 货币格式化（集成测试验证：en "$99.99"，zh "¥99.99"，USD/CNY）
- [x] `relativeTime()` 相对时间（集成测试验证：en "1 day ago"/"in 2 days"，zh "1天前"/"2天后"）
- [x] `list()` 列表格式化（集成测试验证：en "apple, banana, and cherry"，zh "apple、banana和cherry"）
- [x] RTL 语言支持（集成测试验证：i18n.test.ts getLocaleDir Arabic RTL）

### 7.3 i18n 路由

- [x] `prefix` 策略（集成测试验证：i18n.test.ts prefix strategy）
- [x] `prefix_except_default` 策略（集成测试验证：默认语言 en 无前缀，zh 带前缀，Content-Language 头正确设置）
- [x] `no_prefix` 策略（集成测试验证：i18n.test.ts no_prefix strategy）
- [x] `localizePath()` 路径本地化（集成测试验证：localizePath('/', 'zh') → "/zh"，localizePath('/about', 'zh') → "/zh/about"）
- [x] `switchLocalePath()` 切换语言路径（集成测试验证：useSwitchLocalePath() 客户端测试，切换 zh 路径正确）
- [ ] `getLocalePath()` 获取语言路径（i18n-routing单元测试覆盖）
- [x] `extractLocaleFromPath()` 从路径提取语言（集成测试验证：/zh/about → {locale:"zh", pathWithoutLocale:"/about"}）
- [x] Accept-Language 浏览器语言检测（集成测试验证：action=detect，Accept-Language "zh-CN,zh;q=0.9" → "zh"）
- [x] i18n 中间件自动语言检测（集成测试验证：Content-Language: en 头正确设置，cookie ubean_locale 检测）

---

## 八、Markdown 支持

- [x] `.md`/`.mdx` 页面直接作为路由（/md-test集成测试验证）
- [x] `parseMarkdown()` Markdown 解析（集成测试验证：markdown.test.ts）
- [x] `markdownToHtml()` Markdown 转 HTML（/md-test集成测试验证）
- [x] `parseFrontmatter()` Frontmatter 解析（YAML，集成测试验证：markdown.test.ts）
- [x] 标题提取 + slugify (`extractHeadings`)（集成测试验证：markdown.test.ts）
- [x] 摘要提取 (`extractExcerpt`)（集成测试验证：markdown.test.ts）
- [x] 内联格式（bold/italic/code/link/image/del）（/md-test集成测试验证粗体/斜体/删除线/行内代码/链接）
- [x] 代码块渲染（/md-test集成测试验证）
- [x] 列表、引用、水平线（/md-test集成测试验证有序/无序列表、引用）
- [x] `defineMarkdownPage()` 定义 Markdown 页面（集成测试验证：markdown.test.ts）
- [ ] Markdown 中嵌入 Vue 组件

---

## 九、SEO 与元数据

- [x] `useSeoMeta()` SEO 元数据设置（集成测试验证：/seo-meta页面SSR渲染title/description/keywords/robots/author等meta标签）
- [x] `mergeMetadata()` 元数据合并（集成测试验证：seo.test.ts）
- [x] `buildMetaTags()`/`buildLinkTags()` 构建标签（集成测试验证meta/link正确渲染）
- [x] `buildTitle()` 标题构建（支持 titleTemplate，首页"ubean-test 功能测试首页"集成测试验证）
- [x] `renderHeadTags()` 渲染头部标签（集成测试验证）
- [x] OpenGraph 元数据（集成测试验证：og:title/og:description/og:type/og:url/og:image/og:site_name 全部SSR渲染）
- [x] Twitter Cards 元数据（集成测试验证：twitter:card/twitter:title/twitter:description/twitter:image 全部SSR渲染）
- [x] robots meta（index/follow，集成测试验证：`<meta name="robots" content="index, follow">` SSR渲染）
- [x] canonical 链接（集成测试验证：`<link rel="canonical">` 和 `<meta name="canonical">` SSR渲染）
- [x] `createRobotsResponse()` robots.txt（集成测试验证 text/plain 正确内容）
- [x] `createSitemapResponse()` sitemap.xml（集成测试验证 application/xml 包含所有页面）
- [x] Web App Manifest (`defineManifest`)（集成测试验证：/api/manifest-test 返回 name/short_name/icons/display/theme_color等完整manifest）
- [x] `createManifestResponse()` manifest.json（集成测试验证：Content-Type: application/manifest+json, Cache-Control: public max-age=86400）

---

## 十、可观测性 (Observability)

- [x] Request ID 中间件（使用 hono/request-id，x-request-id头集成测试验证）
- [x] `getRequestId()` 获取请求 ID（通过 `c.get('requestId')`，API测试验证）
- [x] OpenTelemetry Tracing (`createObservabilityTracer`)（集成测试验证：/api/trace-test返回tracer:{serviceName,exporter}）
- [x] Span 创建与管理 (`createSpan`/`startSpan`/`withSpan`)（集成测试验证：action=span返回computed:true,duration:10ms；action=nested返回parent/child span）
- [x] Console Exporter（集成测试验证：tracer exporter为console）
- [ ] OpenTelemetry Exporter
- [x] Tracing 中间件 / Response Time 中间件 (`x-response-time`，集成测试验证x-response-time头)

---

## 十一、预渲染 (Prerender)

- [x] `prerender()` 并发预渲染（集成测试验证：/api/prerender-test?action=prerender 2路由生成，HTML文件写入临时目录，indexFileWritten/aboutFileWritten:true）
- [x] `collectPrerenderRoutes()` 收集预渲染路由（集成测试验证：action=collectRoutes 静态路由收集，动态路由[/user/[id]、/blog/[...slug]]过滤，routeRules prerender:false忽略，额外routes添加）
- [x] 链接爬取 (`extractLinks`)（集成测试验证：action=extractLinks 提取内部链接，过滤external/hash/mailto/javascript，去query/hash，规范化trailing slash；action=crawlLinks 从/爬取到/about和/features）
- [x] 忽略规则 (`shouldIgnoreRoute`)（集成测试验证：action=shouldIgnore 精确匹配/`/**`/`/*`/`*`模式匹配，action=ignoreRules /admin被skip，/和/about正常生成）
- [x] 动态路由检测（集成测试验证：collectPrerenderRoutes中 isDynamicPath 检测`[...]`和`:`，动态路由被过滤不预渲染）
- [x] 并发控制 (concurrency)（集成测试验证：action=concurrency 10页concurrency:3，maxConcurrentObserved:3，respectedConcurrency:true）
- [x] `failOnError` 选项（集成测试验证：action=failOnError lenient模式继续执行2生成1错误，strict模式抛出"HTTP 404"异常）
- [x] Manifest 生成 (`generatePrerenderManifest`)（集成测试验证：action=manifest 生成routes/generatedAt/errors结构，routesAreAbsolute:true）
- [x] 静态 HTML 文件写入（集成测试验证：action=filePath routeToFilePath正确转换路径，writePrerenderedFile写入/index.html、/about/index.html、/dashboard/settings/index.html，contentVerified:true）
- [x] `definePrerenderRoutes()` 定义预渲染路由（集成测试验证：action=defineRoutes 返回数组，allStartWithSlash:true）
- [x] P9-03 `extractPrerenderRoutesFromRules()` 从 routeRules 提取 `prerender: true`（prerender.test.ts routeRules auto-discovery 6 tests）
- [x] P9-03 `collectPrerenderRoutes({ routeRules })` 合并 routeRules 与 include（prerender.test.ts）
- [x] P9-03 CLI build 传递 routeRules 给 prerender（packages/cli/src/build.ts）

---

## 十二、自动导入 (Auto-imports)

- [x] Vue 组合式 API 自动导入（集成测试验证 ref/reactive/computed 等无需导入）
- [x] Vue Macros 自动导入（集成测试验证：auto-imports.test.ts definePage macro）
- [x] Ubean 内置 API 自动导入（usePage/useRouter/useHead/definePage等，动态页面usePage()集成测试验证）
- [ ] `composables/` 目录自动扫描导入（auto-imports单元测试覆盖）
- [x] `components/` 目录组件自动导入（集成测试验证：IslandCounter/IslandClock等组件自动导入并注册）
- [x] 类型声明文件生成 (`auto-imports.d.ts`)（集成测试验证：包含applyAppConfig/callInternal/createKV/defineApp等API声明）
- [x] 组件类型声明生成 (`components.d.ts`)（集成测试验证：包含Head/Link/IslandCounter等GlobalComponents声明）
- [ ] 目录命名空间选项（auto-imports单元测试覆盖）

---

## 十三、DevTools

- [x] DevTools 面板访问（`/__ubean_devtools__/client` SPA可访问，浮动按钮注入+Shift+D快捷键）
- [x] DevTools 脚本注入HTML响应（集成测试验证：bootstrap script正确注入页面）
- [x] Overview 总览页（集成测试验证：v0.0.1、Running状态、Uptime、Pages 11、API Routes 44、Middlewares 1、Cron Jobs 1）
- [x] Pages 页面路由查看（集成测试验证：11个页面列表，/about、/dashboard等）
- [x] ApiRoutes API 路由查看（集成测试验证：44条路由，GET/POST/OPTIONS等方法）
- [x] Middlewares 中间件列表（集成测试验证：01.global.ts全局中间件，Global(1)/Route(0)分类）
- [x] Layouts 布局列表（集成测试验证：default布局，default.vue文件）
- [x] Crons 定时任务管理（集成测试验证：test-cron任务显示）
- [x] EnvVars 环境变量查看（集成测试验证：空状态提示在.env文件配置）
- [x] Config 配置查看（集成测试验证：配置信息正确加载）
- [x] ApiDocs OpenAPI 文档（集成测试验证：UI正常加载）
- [x] ApiPlayground API 测试台（集成测试验证：GET/POST/PUT/DELETE/PATCH方法、Send按钮、Params/Headers面板）
- [x] AiAssistant AI 助手（集成测试验证：输入框、快捷按钮，显示"No API key configured"提示）
- [x] 自定义标签页 (`defineDevToolsTab`)（集成测试验证：devtools.test.ts）
- [x] RPC 通信机制（集成测试验证：POST /**ubean_devtools**/rpc 返回200，getInfo/getRoutes/getPages等方法正常）

### 13.1 OpenAPI/Scalar

- [x] OpenAPI 3.1.0 规范自动生成（/\_openapi.json集成测试验证返回openapi/info/paths/components）
- [x] 路径参数推断（Scalar UI显示GET /users/[id]参数）
- [x] operationId 自动生成（OpenAPI spec验证）
- [x] Scalar UI 集成（/\_scalar集成测试验证显示Users分组和API列表）
- [x] `/_openapi.json` 端点（集成测试验证200返回JSON）
- [x] `/_scalar` API 文档 UI（集成测试验证页面标题"UBEAN Dev API"）

---

## 十四、静态文件服务

- [x] `public/` 目录静态文件服务（/test.txt, /data.json, /style.css 集成测试验证200）
- [x] MIME 类型映射（text/plain、application/json、text/css 等30+种，集成测试验证）
- [x] ETag + 304 Not Modified（/test.txt返回ETag头，集成测试验证）
- [ ] index.html 自动索引（core单元测试覆盖）
- [x] Cache-Control (maxAge)（/test.txt返回Cache-Control头，集成测试验证）
- [x] `X-Content-Type-Options: nosniff`（集成测试验证：static-files.test.ts）
- [x] `/_` 和 `/api/` 路径绕过（集成测试验证：static-files.test.ts）

---

## 十五、流式响应

- [x] `createStreamResponse()` 流响应（集成测试验证：/api/stream-test返回分块流"Streaming start/Chunk 1-5/Streaming complete"）
- [x] `createSseStream()` SSE 流（同 6.5，集成测试验证：/api/sse-test返回SSE流和retry:2000心跳）

---

## 十六、代码生成与类型安全

- [x] `generateTypes()` 自动生成类型（集成测试验证：ubean prepare/dev启动时生成auto-imports.d.ts/components.d.ts/routes.d.ts/pages.d.ts）
- [x] RouteName 类型自动生成（集成测试验证：routes.d.ts包含所有API路由的method+path映射）
- [x] LayoutName 类型自动生成（集成测试验证：pages.d.ts和virtual:ubean-pages.ts导出layoutNames类型）
- [x] 类型安全 fetch 客户端（hono-openapi集成测试覆盖）
- [x] TypedLinkProps 类型安全链接（集成测试验证：types.test.ts）
- [x] `.ubean/` 虚拟模块类型声明（集成测试验证：virtual:ubean-pages.ts/virtual:ubean-app.ts/virtual:ubean-client-entry.ts正常工作）

---

## 测试环境说明

- **测试项目路径**: `examples/ubean-test`
- **测试范围**: 上述所有功能点，均需通过 `examples/ubean-test` 集成测试验证才算通过
- **验证方式**:
  1. 启动 dev server，通过浏览器访问（integrated_browser）实际验证页面路由、API端点、重定向、错误处理、SEO文件、OpenAPI/Scalar UI、静态文件服务
  2. 浏览器内 fetch API 调用验证HTTP方法、validator（json/query/path/form/header/cookie）、中间件头（x-request-id/x-response-time）、301/302重定向、静态文件headers（ETag/Cache-Control/Last-Modified）、Set-Cookie
  3. 单元测试仅作为开发期参考，不作为功能验证通过的依据
- **集成测试验证页面**: `/`, `/about`, `/features`, `/user/123`, `/md-test`, `/marketing-page`(路由组), `/dashboard`, `/dashboard/settings`, `/dashboard/profile`(嵌套路由), `/i18n`(国际化), `/seo-meta`(SEO元数据), `/data-fetch`(数据获取), `/_scalar`, `/_devtools`
- **集成测试验证API**: `/api/health`, `/api/hello`, `/api/json`, `/api/text`, `/api/html`, `/api/users`(GET/POST), `/api/users/[id]`(GET/PUT/PATCH/DELETE), `/api/redirect`(302), `/api/redirect-permanent`(301), `/api/error`(500), `/api/env`, `/api/cors-status`, `/api/test-meta`, `/api/search`(query validator), `/api/headers`(header validator), `/api/login`(form validator), `/api/cookies`(Set-Cookie), `/api/i18n-test`(i18n info/translate/plural/linked/format/routing/detect/setLocale), `/api/data-test`(useData cache/invalidate/dependencies/ttl/defineDataKey), `/api/client-test`(ofetch env/methods/interceptors/flatResponse/extend/head), `/api/manifest-test`(Web App Manifest), `/api/prerender-test`(预渲染 collectRoutes/extractLinks/shouldIgnore/prerender/crawlLinks/ignoreRules/failOnError/manifest/filePath/concurrency), `/robots.txt`, `/sitemap.xml`, `/_openapi.json`
- **集成测试验证静态文件**: `/test.txt`(text/plain + ETag/Cache-Control/Last-Modified), `/data.json`(application/json), `/style.css`(text/css), 不存在文件返回404
