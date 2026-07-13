# Ubean 功能测试清单

基于 ubean 框架的文档分析和代码调研，整理出以下测试功能点。所有功能点均已在框架中实现。

---

## 一、项目基础与配置

### 1.1 项目初始化与CLI

- [ ] `ubean init` 命令创建新项目
- [ ] `ubean dev` 启动开发服务器
- [ ] `ubean build` 生产构建
- [ ] `ubean preview` 预览生产构建
- [ ] `ubean prepare` 生成类型声明

### 1.2 配置系统 (defineConfig)

- [ ] `defineConfig` 基础配置加载
- [ ] `srcDir` 源码目录配置（默认 `src`）
- [ ] 配置热更新
- [ ] 默认值回退

### 1.3 Preset 预设系统

- [ ] `standardPreset` 标准预设
- [ ] `nodePreset` Node.js 预设
- [ ] `cloudflarePreset` Cloudflare Workers 预设
- [ ] `detectPreset` 自动环境检测
- [ ] Wrangler 配置生成

---

## 二、路由系统

### 2.1 API 路由

- [ ] 基于文件系统的 API 路由自动扫描（`routes/api/` 目录）
- [ ] HTTP 方法导出（GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS）
- [ ] `defineHandler` 定义处理器
- [ ] `defineHandlerMeta` 路由元数据（ubean特有：public/cache/rateLimit/自定义扩展）
- [ ] `describeRoute` OpenAPI 文档定义（from hono-openapi，tags/summary/description/responses）
- [ ] `validator` 请求验证（from hono-openapi，Standard Schema）
  - [ ] JSON body 验证（`validator('json', schema)`）
  - [ ] Query 参数验证（`validator('query', schema)`）
  - [ ] Path 参数验证（`validator('param', schema)`）
  - [ ] Form 验证（`validator('form', schema)`）
  - [ ] Header 验证（`validator('header', schema)`）
  - [ ] Cookie 验证（`validator('cookie', schema)`）
- [ ] `resolver` 响应 schema 定义（from hono-openapi）
- [ ] 动态路由 `[id].ts` 参数解析
- [ ] 嵌套路由目录结构
- [ ] 路由组 `(group)` 目录不影响 URL
- [ ] 中间件链组合
- [ ] `defineMiddleware` 全局/路由级中间件

### 2.2 Pages 路由（页面路由）

- [ ] 基于文件系统的页面路由（`pages/` 目录）
- [ ] `definePage` 宏定义页面配置
- [ ] 动态页面路由 `[id].vue`
- [ ] 嵌套页面路由
- [ ] 路由组 `(group)` 目录
- [ ] `reuse` 组件复用标记
- [ ] `public` 公共页面标记（跳过 SSR 仅静态）
- [ ] `head` 页面头部配置
- [ ] `meta` 页面元数据

### 2.3 布局系统 (Layouts)

- [ ] 默认布局 `layouts/default.vue`
- [ ] 自定义命名布局
- [ ] 布局嵌套链解析
- [ ] 页面指定布局 (`layout: 'custom'`)
- [ ] 布局 fallback 机制

---

## 三、SSR 与渲染

### 3.1 SSR 服务端渲染

- [ ] Vue 组件 SSR 渲染 (`renderToString`)
- [ ] 页面壳构建 (`buildPageShell`)
- [ ] SSR 内容注入标记
- [ ] 布局嵌套渲染
- [ ] 页面数据序列化注入页面

### 3.2 客户端导航

- [ ] `push`/`replace` 编程式导航
- [ ] `back`/`forward`/`refresh` 导航
- [ ] `prefetch` 预获取
- [ ] Form submit with actions
- [ ] `popstate` 监听
- [ ] 页面数据 JSON 获取（`x-ubeanpages` header）

### 3.3 defineApp 应用配置

- [ ] Vue app 插件注册（区分 all/client/server）
- [ ] 全局组件注册
- [ ] 全局依赖注入 (provides)
- [ ] 默认 SEO head 配置
- [ ] `rootId`/`rootAttrs` 根元素配置
- [ ] 生命周期钩子 (`onAppCreated`/`onClientReady`)
- [ ] 错误组件 (`errorComponent`)
- [ ] 加载组件 (`loadingComponent`)

### 3.4 视图过渡 (View Transitions)

- [ ] `supportsViewTransitions()` 特性检测
- [ ] `withViewTransition()` 异步更新包装
- [ ] View Transition Types API 支持
- [ ] fallback 策略（none/crossfade）
- [ ] `useViewTransitionState()` 样式辅助
- [ ] `getNavigationType()` 导航类型检测

### 3.5 Islands 架构

- [ ] `ubeanIslandsPlugin` Vite 插件
- [ ] `<ubean-island>` 自定义元素
- [ ] `client:load` 加载时水合
- [ ] `client:idle` 空闲时水合
- [ ] `client:visible` 可见时水合（IntersectionObserver）
- [ ] `client:media` 媒体查询时水合
- [ ] `client:only` 仅客户端渲染
- [ ] Bootstrap 脚本注入
- [ ] Props 序列化传递

---

## 四、响应工具

### 4.1 响应助手 (Hono Context 方法)

以下方法均为 Hono Context (`c`) 上的方法，在 `defineHandler` 中直接通过 `c` 调用：

- [ ] `c.json(data, status?)` JSON 响应
- [ ] `c.text(data, status?)` 文本响应
- [ ] `c.html(data, status?)` HTML 响应
- [ ] `c.redirect(url)` 临时重定向 (302)
- [ ] `c.redirect(url, 301)` 永久重定向 (301)
- [ ] `c.header(name, value)` 设置响应头

### 4.2 错误处理

- [ ] `createError()` 创建错误
- [ ] `UbeanError` 自定义错误类
- [ ] `errorToResponse()` 错误转响应
- [ ] 全局错误处理 (`app.onError`)
- [ ] 404 fallback
- [ ] `statusCode`/`statusMessage`/`data` 错误属性

---

## 五、数据获取与缓存

### 5.1 类型安全客户端 (ofetch)

- [ ] `get`/`post`/`put`/`patch`/`delete`/`head`/`options` 方法
- [ ] `$get`/`$post` 等扁平化响应（`{data, error, status}`）
- [ ] 请求拦截器 (`onRequest`/`onRequestError`)
- [ ] 响应拦截器 (`onResponse`/`onResponseError`)
- [ ] XHR 上传进度
- [ ] 运行时环境自动检测（browser/node/deno/bun/edge/workerd）

### 5.2 页面数据 (useData)

- [ ] `useData()` 数据获取
- [ ] `defineDataKey()` 定义数据键
- [ ] `invalidateData()` 失效指定数据
- [ ] `invalidateAll()` 失效所有数据
- [ ] `declareDependencies()` 声明依赖关系
- [ ] `withDependencies()` 包装依赖
- [ ] `getInvalidatedKeysForAction()` 动作失效键
- [ ] 客户端数据缓存 store

### 5.3 Internal Fetch

- [ ] `callInternal()` 内部请求调用
- [ ] Cookie/Authorization 等头自动转发
- [ ] Request ID 转发
- [ ] Accept-Language 转发
- [ ] 自动 JSON 解析
- [ ] `createInternalFetch()` 页面数据专用版本

### 5.4 缓存系统 (Cache)

- [ ] 内存存储 (`createMemoryStore`)
- [ ] LRU 淘汰策略
- [ ] Route Rules 缓存规则集成
- [ ] `cachedEventHandler()` 缓存处理器
- [ ] `invalidateRouteCache()` 失效路由缓存
- [ ] SWR (stale-while-revalidate) 支持
- [ ] HTTP 缓存头 (`X-Cache`/`Age`)
- [ ] 仅缓存 GET/HEAD 请求

### 5.5 路由规则 (Route Rules)

- [ ] `compileRouteRules()` 编译规则
- [ ] `matchRouteRules()` 规则匹配
- [ ] 路由级缓存配置
- [ ] 路由级 CORS 配置
- [ ] 路由级预渲染配置

---

## 六、服务端高级功能

### 6.1 环境变量 (defineEnv)

- [ ] `defineEnv` 定义环境变量 schema
- [ ] server/public 分层（服务端私有/客户端公开）
- [ ] String/Number/Boolean 类型支持
- [ ] Zod/Standard Schema 验证
- [ ] `mode: 'warn'/'throw'` 验证失败模式
- [ ] `useRuntimeEnv()` 获取环境变量
- [ ] 默认值支持

### 6.2 定时任务 (Cron)

- [ ] `defineScheduled` 定义定时任务
- [ ] Cron 表达式解析 (`parseCron`)
- [ ] Cron 表达式验证 (`validateCron`)
- [ ] 内存调度器 (`createMemoryCronScheduler`)
- [ ] timezone 时区支持
- [ ] timeout 超时配置
- [ ] `runOnStart` 启动时立即执行
- [ ] 任务手动执行 (`runScheduledTask`)
- [ ] 任务统计与状态

### 6.3 队列系统 (Queue)

- [ ] `defineQueue` 定义队列
- [ ] 内存驱动 (`createMemoryQueueDriver`)
- [ ] 并发控制
- [ ] 重试机制（retries/retryDelay）
- [ ] 死信队列（deadLetterQueue）
- [ ] 延迟消息发送
- [ ] 批量发送消息 (`sendMessages`)
- [ ] 队列统计信息
- [ ] Worker 启动/停止

### 6.4 WebSocket

- [ ] `defineWebSocket` 定义 WS 端点
- [ ] Room 机制 (`defineRoom`/`createRoom`)
- [ ] Topic 订阅/发布
- [ ] Peer 管理（send/publish/subscribe/close/data）
- [ ] `broadcast()` 广播消息
- [ ] open/message/close/error 生命周期钩子
- [ ] Upgrade 处理

### 6.5 SSE (Server-Sent Events)

- [ ] `defineSSE` 定义 SSE 端点
- [ ] `createSSEStream` 创建 SSE 流
- [ ] 连接管理
- [ ] keep-alive 心跳
- [ ] 消息格式化（id/event/retry/data/comment）
- [ ] `broadcastSSE()` 广播
- [ ] WritableStream 底层实现

### 6.6 存储与 KV

- [ ] `createStorage`/`useStorage` 挂载式存储
- [ ] 内存驱动 (`createMemoryDriver`)
- [ ] TTL 过期支持
- [ ] `mount()` 多驱动挂载
- [ ] `createKV`/`useKV` 命名空间 KV
- [ ] 自动序列化/反序列化

### 6.7 数据库 (Database)

- [ ] `defineDatabase` 定义数据库
- [ ] `useDatabase()` 获取数据库实例
- [ ] 内置内存 SQL 数据库
- [ ] CREATE TABLE/INSERT/SELECT/DELETE/DROP 支持
- [ ] db0 connector 接口
- [ ] 迁移系统 (`runMigrations`/`migrateDatabase`)
- [ ] 生命周期钩子 (connect/disconnect/query/error)
- [ ] 模板字符串 `sql` 标签

### 6.8 CORS 跨域

- [ ] `createCorsMiddleware`/`defineCors`
- [ ] origin 配置（string/array/boolean/function）
- [ ] allowMethods/allowHeaders 配置
- [ ] exposeHeaders/credentials/maxAge 配置
- [ ] 预检请求 (OPTIONS) 处理

### 6.9 限流 (Rate Limit)

- [ ] `createRateLimitMiddleware`/`defineRateLimit`
- [ ] 内存存储 (`createMemoryRateLimitStore`)
- [ ] 标准头（RateLimit-Limit/Remaining/Reset）
- [ ] 遗留头（X-RateLimit-\*）
- [ ] 自定义 keyGenerator
- [ ] Retry-After 头

---

## 七、国际化 (i18n)

### 7.1 基础 i18n

- [ ] `defineLocale` 注册语言包
- [ ] `t()` 翻译函数
- [ ] 插值替换
- [ ] 复数形式
- [ ] 链接消息
- [ ] `setLocale()`/`getLocale()` 切换/获取语言
- [ ] `getRegisteredLocales()` 获取已注册语言
- [ ] `getDefaultLocale()` 获取默认语言

### 7.2 Intl 格式化

- [ ] `d()` 日期格式化
- [ ] `n()` 数字格式化
- [ ] `c()` 货币格式化
- [ ] `relativeTime()` 相对时间
- [ ] `list()` 列表格式化
- [ ] RTL 语言支持

### 7.3 i18n 路由

- [ ] `prefix` 策略（所有路径带语言前缀）
- [ ] `prefix_except_default` 策略（默认语言无前缀）
- [ ] `no_prefix` 策略（路径无语言前缀）
- [ ] `localizePath()` 路径本地化
- [ ] `switchLocalePath()` 切换语言路径
- [ ] `getLocalePath()` 获取语言路径
- [ ] `extractLocaleFromPath()` 从路径提取语言
- [ ] Accept-Language 浏览器语言检测 (`detectBrowserLocale`)
- [ ] i18n 中间件自动语言检测

---

## 八、Markdown 支持

- [ ] `.md`/`.mdx` 页面直接作为路由
- [ ] `parseMarkdown()` Markdown 解析
- [ ] `markdownToHtml()` Markdown 转 HTML
- [ ] `parseFrontmatter()` Frontmatter 解析（YAML）
- [ ] 标题提取 + slugify (`extractHeadings`)
- [ ] 摘要提取 (`extractExcerpt`)
- [ ] 内联格式（bold/italic/code/link/image/del）
- [ ] 代码块渲染
- [ ] 列表、引用、水平线
- [ ] `defineMarkdownPage()` 定义 Markdown 页面
- [ ] Markdown 中嵌入 Vue 组件

---

## 九、SEO 与元数据

- [ ] `useSeoMeta()` SEO 元数据设置
- [ ] `mergeMetadata()` 元数据合并
- [ ] `buildMetaTags()`/`buildLinkTags()` 构建标签
- [ ] `buildTitle()` 标题构建（支持 titleTemplate）
- [ ] `renderHeadTags()` 渲染头部标签
- [ ] OpenGraph 元数据
- [ ] Twitter Cards 元数据
- [ ] robots meta（index/follow）
- [ ] canonical 链接
- [ ] `createRobotsResponse()` robots.txt
- [ ] `createSitemapResponse()` sitemap.xml
- [ ] Web App Manifest (`defineManifest`)
- [ ] `createManifestResponse()` manifest.json

---

## 十、可观测性 (Observability)

- [ ] Request ID 中间件 (`createRequestIdMiddleware`)
- [ ] `getRequestId()` 获取请求 ID
- [ ] OpenTelemetry Tracing (`createObservabilityTracer`)
- [ ] Span 创建与管理 (`createSpan`/`startSpan`/`withSpan`)
- [ ] Console Exporter
- [ ] OpenTelemetry Exporter
- [ ] Tracing 中间件 (`createTracingMiddleware`)

---

## 十一、预渲染 (Prerender)

- [ ] `prerender()` 并发预渲染
- [ ] `collectPrerenderRoutes()` 收集预渲染路由
- [ ] 链接爬取 (`extractLinks`)
- [ ] 忽略规则 (`shouldIgnoreRoute`)
- [ ] 动态路由检测
- [ ] 并发控制 (concurrency)
- [ ] `failOnError` 选项
- [ ] Manifest 生成 (`generatePrerenderManifest`)
- [ ] 静态 HTML 文件写入
- [ ] `definePrerenderRoutes()` 定义预渲染路由

---

## 十二、自动导入 (Auto-imports)

- [ ] Vue 组合式 API 自动导入
- [ ] Vue Macros 自动导入
- [ ] Ubean 内置 API 自动导入
- [ ] `composables/` 目录自动扫描导入
- [ ] `components/` 目录组件自动导入
- [ ] 类型声明文件生成 (`auto-imports.d.ts`)
- [ ] 组件类型声明生成 (`components.d.ts`)
- [ ] 目录命名空间选项

---

## 十三、DevTools

- [ ] DevTools 面板访问（`/_ubean/devtools`）
- [ ] Overview 总览页
- [ ] Pages 页面路由查看
- [ ] ApiRoutes API 路由查看
- [ ] Middlewares 中间件列表
- [ ] Layouts 布局列表
- [ ] Crons 定时任务管理
- [ ] EnvVars 环境变量查看
- [ ] Config 配置查看
- [ ] ApiDocs OpenAPI 文档
- [ ] ApiPlayground API 测试台
- [ ] AiAssistant AI 助手
- [ ] 自定义标签页 (`defineDevToolsTab`)
- [ ] RPC 通信机制

### 13.1 OpenAPI/Scalar

- [ ] OpenAPI 3.1.0 规范自动生成
- [ ] 路径参数推断
- [ ] operationId 自动生成
- [ ] Scalar UI 集成
- [ ] `/_openapi.json` 端点
- [ ] `/_scalar` API 文档 UI

---

## 十四、静态文件服务

- [ ] `public/` 目录静态文件服务
- [ ] MIME 类型映射（30+ 种）
- [ ] ETag + 304 Not Modified
- [ ] index.html 自动索引
- [ ] Cache-Control (maxAge)
- [ ] `X-Content-Type-Options: nosniff`
- [ ] `/_` 和 `/api/` 路径绕过

---

## 十五、流式响应

- [ ] `createStreamResponse()` 流响应
- [ ] `createSseStream()` SSE 流（同 6.5）

---

## 十六、代码生成与类型安全

- [ ] `generateTypes()` 自动生成类型
- [ ] RouteName 类型自动生成
- [ ] LayoutName 类型自动生成
- [ ] 类型安全 fetch 客户端
- [ ] TypedLinkProps 类型安全链接
- [ ] `.ubean/` 虚拟模块类型声明

---

## 测试环境说明

- **测试项目路径**: `examples/ubean-test`
- **参照项目**: `examples/hello-world`
- **测试范围**: 上述所有标记的功能点
- **验证方式**: 启动 dev server，通过浏览器访问和 API 调用验证各功能
