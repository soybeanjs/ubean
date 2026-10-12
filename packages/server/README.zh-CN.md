# @ubean/server

**[English](./README.md) | 中文**

ubean 的服务端运行时原语：缓存、数据库、队列、定时任务、实时通信、存储、安全、可观测性、邮件、分析、静态文件服务与平台驱动。

`@ubean/server` 是 ubean 的服务端能力库。每项能力都有一个**语义子路径**（`@ubean/server/cache`、`/db`、`/queue` …）；主入口 `.` 是再导出全部子路径的便利 barrel。新代码应从子路径导入 —— barrel 会迫使 `tsc` 与 IDE 在只导入一个符号时也解析每一个子模块的类型。

```ts
import { defineHandler } from '@ubean/routes';
import { useCacheStore, createMemoryStore } from '@ubean/server/cache';
import { useDatabase } from '@ubean/server/db';

const store = useCacheStore(createMemoryStore(500));

export const GET = defineHandler(async c => {
  const { rows } = await useDatabase().sql`SELECT id, title FROM posts LIMIT 20`;
  return c.json({ posts: rows });
});
```

## 目录

- [包定位](#包定位)
- [安装](#安装)
- [快速开始](#快速开始)
- [入口](#入口)
- [缓存](#缓存)
- [数据库](#数据库)
- [队列](#队列)
- [定时任务](#定时任务)
- [实时通信](#实时通信)
- [存储与 KV](#存储与-kv)
- [邮件](#邮件)
- [分析与特性开关](#分析与特性开关)
- [安全](#安全)
- [中间件](#中间件)
- [可观测性](#可观测性)
- [静态文件服务](#静态文件服务)
- [平台驱动](#平台驱动)
- [类型安全](#类型安全)
- [架构说明](#架构说明)

## 包定位

| 层                      | 职责                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@ubean/server`（本包） | 与路由无关的跨请求服务端原语：cache、db、queue、cron、realtime、storage、email、analytics、flags、security、middleware、observability、static、drivers |
| `@ubean/app`            | 拥有 Hono 应用与请求中间件链 —— 它负责*挂载*本包的中间件工厂                                                                                           |
| `@ubean/routes`         | 路由、路由规则、ISR、Server Actions、OpenAPI                                                                                                           |
| `@ubean/build`          | 构建期关注点：预渲染、平台预设、配置加载、Vite 插件                                                                                                    |

**运行时依赖白名单：`@ubean/shared`、`hono`、`hookable`、`pathe`。** 所有重依赖（unstorage、db0、drizzle、crossws、nodemailer、各平台 SDK）都按需懒加载，或由应用通过驱动注入 —— 这正是本包能部署到 edge 运行时的原因。`vite` peer 是可选的，只用于开发期资源路径。`nodemailer` 开发依赖支撑 `smtp` 邮件 provider；没有它时该 provider 不可用，其余仍可正常工作。

## 安装

```bash
pnpm add @ubean/server hono

# 仅在用到对应功能时：
pnpm add unstorage   # 存储 / KV 后端
pnpm add db0         # 数据库连接器
pnpm add nodemailer  # smtp 邮件 provider
```

## 快速开始

```ts
import { defineScheduled, startCronScheduler } from '@ubean/server/cron';
import { useDatabase } from '@ubean/server/db';
// src/server.ts
import { defineQueue, sendMessage, startQueueWorkers } from '@ubean/server/queue';
import { useKV } from '@ubean/server/storage';

defineQueue({ name: 'emails' }, async message => {
  await sendEmail({ to: message.to, subject: 'Welcome', text: 'Hi!' });
});

defineScheduled({ name: 'cleanup', schedule: '0 3 * * *' }, async () => {
  await useDatabase().exec('DELETE FROM sessions WHERE expires_at < now()');
});

await startQueueWorkers();
startCronScheduler();
await useKV('flags').set('dark-mode', true);
```

## 入口

每行对应一个子路径。子路径是**语义聚合**，不是内部文件的 1:1 映射 —— 其中六个各合并了多个模块。barrel（`@ubean/server`）仍然完全受支持并导出相同的符号；子路径存在的意义是把类型解析范围收窄。

| 子路径                          | 背后是什么                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| `@ubean/server/cache`           | 路由级 HTTP 缓存 + 组件缓存（`cache` + `cache-directive`）                                      |
| `@ubean/server/cache-directive` | 仅组件/函数缓存                                                                                 |
| `@ubean/server/db`              | 数据库与迁移                                                                                    |
| `@ubean/server/realtime`        | WebSocket 与 SSE（`websocket` + `sse`）                                                         |
| `@ubean/server/security`        | CSP / CSRF / Sessions（`security-headers` + `csrf` + `sessions`）                               |
| `@ubean/server/queue`           | 消息队列                                                                                        |
| `@ubean/server/cron`            | 定时任务（`cron` + `cron-scheduler`）                                                           |
| `@ubean/server/storage`         | unstorage + KV 命名空间                                                                         |
| `@ubean/server/observability`   | 请求 ID、span、链路追踪                                                                         |
| `@ubean/server/email`           | 邮件 provider 与 transport                                                                      |
| `@ubean/server/analytics`       | 分析与 A/B 实验（`analytics` + `feature-flags`）                                                |
| `@ubean/server/static`          | 静态文件服务                                                                                    |
| `@ubean/server/drivers`         | 平台原生驱动                                                                                    |
| `@ubean/server/middleware`      | 请求生命周期（`cors` + `rate-limit` + `after` + `fetch-memo` + `draft-mode` + `single-flight`） |

`./cdn-cache` 没有子路径，只能从 barrel 导入。

## 缓存

```ts
import { createCacheMiddleware, useCacheStore, createMemoryStore } from '@ubean/server/cache';

app.use(
  createCacheMiddleware({
    store: useCacheStore(createMemoryStore(500)),
    rules: { '/api/products/**': { ttl: 60 }, '/api/feed': { ttl: 300, swr: true } },
    defaultTtl: 0
  })
);
```

`CacheStore` 是可替换的后端：`get` / `set(key, entry, ttl)` / `delete` / `clear`，以及可选的 `peek(key)` —— 它读取条目时**不**更新 LRU 热度，也不会在条目过期时删除它。`peek` 正是 stale-while-revalidate 的前提；不实现它时 ISR 退化为 `get()`，而 `get()` 会丢弃过期条目，从而关闭旧内容服务。`createMemoryStore(maxEntries = 200)` 在满载时淘汰最旧条目的大约 20%，`createStorageCacheStore(storage, prefix = 'cache:')` / `createFsCacheStore(dir)` / `loadFsCacheStore(dir)` 分别提供存储后端与 Node 文件系统后端。

`CacheRule` 为 `{ ttl, swr?, name? }` —— `swr` 只输出 `stale-while-revalidate` 响应头（CDN 语义）；应用层的旧内容服务是 ISR 的职责。`cachedEventHandler(handler, rule)` 包装单个 handler。可缓存性是强制的：只缓存 `GET`/`HEAD`，带 `Authorization` 的请求永不缓存，带 cookie 的请求仅在响应带 `Cache-Control: public` 时缓存，非 200 与 `private`/`no-store` 响应永不存储，存储前会剥掉 `set-cookie`。`invalidateRouteCache(keyPattern?)` 可按精确 key、模式、`RegExp` 或全部清空。

这是路由级 HTTP 缓存，**不是**通用键值客户端 —— 任意应用层缓存请用 `./storage`。组件缓存位于同一子路径之下：

```ts
import { defineCachedFunction, cacheLife, cacheTag, revalidateTag } from '@ubean/server/cache-directive';

export const getUserProfile = defineCachedFunction(
  async (userId: string) => {
    cacheLife(60);
    cacheTag('users', `user:${userId}`);
    return await db.query.users.findById(userId);
  },
  { name: 'getUserProfile' } // 必填 —— 缓存 key 的前缀
);
```

`cacheLife(seconds)` 与 `cacheTag(...tags)` 只在被包装的函数体内生效；在缓存作用域之外调用是空操作。按标签失效用 `revalidateTag(tag)` / `revalidateTags(...tags)`，glob/正则模式用 `revalidatePath(pattern)`，两者都返回删除的条目数。`useComponentCacheStore(store?)` 读取或替换存储，`createComponentMemoryStore(maxEntries = 500)` 创建带标签反向索引的内存后端。`wrapWithCache` 是 `defineCachedFunction` 的已废弃别名。

## 数据库

```ts
import { defineDatabase, useDatabase, runMigrations, rawSql } from '@ubean/server/db';

const db = defineDatabase({ default: 'primary', connectors: { primary, replica } });

const { rows } = await useDatabase().sql<{ id: number; email: string }>`
  SELECT id, email FROM users WHERE id = ${userId}
`;
```

该层建立在 `db0` 连接器抽象之上，在既未提供 `connector` 也未提供 `connectors` 时回退到内存 SQL，因此同一套代码路径在测试与 edge 运行时都能工作。`Database` 为 `{ sql<T>(strings, ...values) => Promise<{ rows: T[] }>; exec(query); close() }`。参数始终自动绑定 —— 永远不要把用户输入直接插入模板字符串。`rawSql(str)`（别名 `sqlRaw` 与 `raw`）用于标记无法绑定的片段，例如表名或列名。

`migrateDatabase(db, statements)` 按顺序执行原始 SQL 语句；`runMigrations(db, migrations, options)` 在 `_migrations` 表中记录已应用的迁移，只执行待执行的，返回 `{ applied }`（`Migration` 为 `{ name, up, down? }`）。这里没有 `defineMigration` 或 `defineSeed` API。生命周期钩子来自 `getDatabaseHooks()`（`db:connect`、`db:disconnect`、`db:query`、`db:error`）；`registerDb0Create(fn)` 注册 db0 工厂，`closeDatabases()` 关闭所有已注册数据库。

## 队列

```ts
import { defineQueue, sendMessage, startQueueWorkers } from '@ubean/server/queue';

defineQueue({ name: 'emails' }, async (message: { to: string }) => {
  await sendEmail({ to: message.to, subject: 'Welcome', text: 'Hi!' });
});

await startQueueWorkers();
await sendMessage('emails', { to: 'alice@example.com' });
```

`defineQueue(options, handler?)` 声明一个队列；`createMemoryQueueDriver()` 是默认驱动，`setQueueDriver` / `useQueueDriver` 用于替换（平台驱动在 `./drivers`）。`sendMessage(queueName, body, options?)` 返回消息 id，`sendMessages` 返回一批 id。worker 由 `startQueueWorkers()` / `stopQueueWorkers()` 控制，`getQueueStats(queueName)` / `getAllQueueStats()` 报告计数。

## 定时任务

```ts
import { defineScheduled, runScheduledTask, validateCron } from '@ubean/server/cron';
import { startCronScheduler } from '@ubean/server/cron';

defineScheduled({ name: 'cleanup', schedule: '0 3 * * *' }, async ctx => {
  await pruneExpiredSessions();
});

validateCron('0 3 * * *'); // true
startCronScheduler();
```

`defineScheduled(metaOrName, handler?)` 返回 `ScheduledTask`；`getScheduledTasks()` / `clearScheduledTasks()` 列出或重置，`runScheduledTask(name)` 直接执行一个（从平台 cron 触发器调用时很有用）。`parseCron(expr)` 与 `validateCron(expr)` 只做表达式解析，不涉及调度，`createCronContext(name, schedule)` 构造传给 handler 的 `CronContext`。在 serverless 与 edge 目标上框架不启动进程内调度器 —— 请使用平台的 cron。

## 实时通信

```ts
import { defineWebSocket, createRoom, broadcast } from '@ubean/server/realtime';

createRoom('chat');

defineWebSocket({
  path: '/ws/chat',
  hooks: {
    open: peer => peer.subscribe('lobby'),
    message: (peer, message) => broadcast('lobby', message)
  }
});
```

```ts
import { defineHandler } from '@ubean/routes';
import { createSSEStream } from '@ubean/server/realtime';

export const GET = defineHandler(c =>
  createSSEStream(c, {
    onConnect: connection => connection.sendData({ tick: 1 }, 'tick')
  })
);
```

WebSocket：`defineWebSocket(def)` / `defineRoom(name)` / `createRoom(name)` / `getRoom(name)` / `broadcast(topic, data)`，运行时入口为 `registerWebSocket(path, def)`、`handleUpgrade(c, options)`、`handleMessage(peer, message)`、`handleClose(peer, code = 1000, reason = '')`、`handleError(peer, error)` 与 `createWebSocketMiddleware()`。SSE：`createSSEStream(c, handler, options?)` / `defineSSE(handler, options?)` / `formatSSEMessage(msg)` / `broadcastSSE(event, data, filter?)` / `getSSEConnections()` / `sseHeaders()` / `closeAllSSE()`。类型：`Peer`、`WebSocketRoom`、`WebSocketHooks`、`WebSocketDefinition`、`UpgradeResult`、`SSEMessage`、`SSEConnection`、`SSEHandler`、`SSEOptions`。

## 存储与 KV

```ts
import { useStorage, createStorage, useKV } from '@ubean/server/storage';

const storage = useStorage();
await storage.set('user:1', { name: 'John' });
const user = await storage.get<User>('user:1');

const flags = useKV<boolean>('flags');
await flags.set('dark-mode', true);
```

`useStorage(storage?)` 读取或安装全局 unstorage 实例；`createStorage(options)` 构造一个，`createMemoryDriver()` 是默认内存驱动，`clearGlobalStorage()` 重置它。`useKV<T>(name = 'default', options?)` 返回带命名空间的 `KVNamespace<T>`，`createKV<T>(options?)` 直接构造一个。任意键值缓存都应放在这一层 —— `./cache` 的存储专门用于路由级 HTTP 缓存。

## 邮件

```ts
import { defineEmailProvider, sendEmail, renderEmailTemplate } from '@ubean/server/email';

defineEmailProvider({ type: 'log' }); // 'log' | 'smtp' | 'mock' | 'sendmail'

await sendEmail({
  to: 'alice@example.com',
  subject: 'Welcome',
  html: renderEmailTemplate('<p>Hi {{name}}</p>', { name: 'Alice' })
});
```

`defineEmailProvider(options)` 注册 provider，`createEmailTransport(provider)` 构造其 transport；`setDefaultEmailProvider` / `useEmailProvider` / `getEmailProvider(name)` / `getEmailProviderNames()` 管理注册表。`sendEmail(options)` 返回 `EmailResult`，`renderEmailTemplate(template, data)` 插值 `{{name}}` 占位符。`getSentEmails()` / `clearSentEmails()` 暴露 mock transport 的发件箱。

## 分析与特性开关

```ts
import { createAnalyticsMiddleware, trackEvent, defineAnalyticsProvider } from '@ubean/server/analytics';
import { defineFeatureFlag, evaluateFlag, getVariant } from '@ubean/server/analytics';

defineAnalyticsProvider({ name: 'console', transport: 'log' });
app.use('*', createAnalyticsMiddleware());

await trackEvent(c, 'signup', { plan: 'pro' });

defineFeatureFlag('new-checkout', { kind: 'percentage', rollout: 25 });
const enabled = await evaluateFlag('new-checkout', { userId });
const variant = await getVariant('new-checkout', { userId });
```

分析：`defineAnalyticsProvider(options)`，注册表助手 `registerAnalyticsProvider` / `unregisterAnalyticsProvider` / `getAnalyticsProvider` / `listAnalyticsProviders` / `clearAnalyticsProviders`，全局设置 `setGlobalAnalyticsProvider`，`extractAnalyticsContext(c)`，追踪器 `trackPageView` / `trackEvent` / `trackRaw`，以及 `createAnalyticsMiddleware(options?)`（别名 `defineAnalytics(options)`）。内置 provider 有 `createLogAnalyticsProvider()`、`createMemoryAnalyticsProvider()` 与 `createMockAnalyticsProvider(impl?)`。

特性开关：`defineFeatureFlag(name, options?)` 与 `defineExperiment(name, options)` 注册定义；`evaluateFlag` / `evaluateFlagWithReason` / `getVariant` / `getVariantAssignment` 进行评估（`FlagKind` 为 `'boolean' | 'multivariate' | 'percentage'`）；`useFlags(c)` / `useExperiments(c)` / `useFlagContext(c)` 读取请求级结果。`createMemoryFeatureFlagStore()` 默认支撑全部，`extractFlagContext(c)` 构造评估上下文，`listFlagNames` / `listExperimentNames` / `removeFeatureFlag` / `removeExperiment` 查看或清理注册表。

## 安全

```ts
import { createCsrfMiddleware, createSecurityHeadersMiddleware } from '@ubean/server/security';
import { createSessionMiddleware, useSession } from '@ubean/server/security';

app.use('*', createSecurityHeadersMiddleware({ contentSecurityPolicy: { directives: { 'script-src': ["'self'"] } } }));
app.use('*', createCsrfMiddleware());
app.use('*', createSessionMiddleware({ secret: process.env.SESSION_SECRET! }));
```

中间件在启动时安装一次；`useSession` 则在 handler 内部调用。安全头：`createSecurityHeadersMiddleware(options?)`（CSP / HSTS / X-Frame-Options / X-Content-Type-Options / Referrer-Policy / Permissions-Policy / Cross-Origin-*），构造 CSP 用 `serializeCsp(directives)` / `extendCspScriptSrc(directives, origins)`，分层默认值用 `mergeSecurityHeadersOptions(base, override)`。CSRF：`createCsrfMiddleware(options?)`（默认 double-submit cookie，另支持 origin 校验与 both 模式）与 `generateCsrfToken(length = 32)`。Sessions：`createSessionMiddleware(options?)`，`useSession<T>(c)` 返回 `Session<T> | null`，`createStorageSessionStore(storage?, prefix = 'session:')` 用于存储后端 session。每项能力也都有声明式形态：`defineSecurityHeaders` / `defineCsrf` / `defineSessionStore`。

## 中间件

```ts
import { after } from '@ubean/server/middleware';
import { createCorsMiddleware, createRateLimitMiddleware } from '@ubean/server/middleware';
import { createDataCacheMiddleware, createFetchMemoizationMiddleware } from '@ubean/server/middleware';
import { createSingleFlightMiddleware, defineDraftMode, defineRevalidation } from '@ubean/server/middleware';

app.use('*', createCorsMiddleware({ origin: 'https://example.com' }));
app.use('/api/*', createRateLimitMiddleware({ windowMs: 60_000, max: 100 }));

export const GET = defineHandler(async c => {
  after(() => analytics.flush()); // 响应之后执行，永不阻塞 TTFB
  return c.json({ ok: true });
});
```

| 分组              | API                                                                                                                                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CORS              | `createCorsMiddleware(options?)`、`defineCors(options)`                                                                                                                                                    |
| 限流              | `createRateLimitMiddleware(options?)`、`defineRateLimit(options)`、`createMemoryRateLimitStore()`、`disposeMemoryRateLimitStores()`                                                                        |
| `after`           | `after(callback)`、`createAfterMiddleware()`、`flushAfterCallbacks(c)`、`getAfterCallbackCount(c?)`                                                                                                        |
| Fetch memoization | `createFetchMemoizationMiddleware(options)`、`createMemoizedFetch(options)`                                                                                                                                |
| Data Cache        | `createDataCacheMiddleware(options?)`、`revalidateDataCacheTag(tag)`、`revalidateDataCachePath(pattern)`、`clearFetchDataCache()`、`getDataCacheSize()`                                                    |
| Draft Mode        | `createDraftModeMiddleware(options)`、`defineDraftMode(options)`、`enableDraftMode(c)`、`disableDraftMode(c)`、`isDraftMode(c)`、`useDraftMode(c)`                                                         |
| Single flight     | `defineRevalidation(keys, fetcher, name?)`、`createSingleFlightMiddleware(options?)`、`runRevalidation(keys, c, parallel?)`、`defineSingleFlight(options)`、`invalidateKey(key)`、`getInvalidatedKeys(c?)` |

`after(callback)` 是带 AsyncLocalStorage 请求作用域的 fire-and-forget：回调在响应发出后执行。Fetch memoization 在单次请求内对相同 `GET` URL 去重；Data Cache（`FetchCacheOptions`、`FetchInitWithNext extends RequestInit`）把它扩展到跨请求，识别 `next: { revalidate, tags, noStore }` 并与 `revalidateTag` / `revalidatePath` 集成。Draft Mode 对 cookie 签名并注入 controller；未注册该中间件时 `isDraftMode` 返回 `false`，`useDraftMode` 返回零开销的安全回退。

## 可观测性

```ts
import { createTracingMiddleware, createConsoleExporter, withSpan } from '@ubean/server/observability';

app.use('*', createTracingMiddleware({ exporter: createConsoleExporter() }));

await withSpan('db.query', async span => {
  span.setAttribute('table', 'users');
});
```

`createTracingMiddleware(options?)` 把链路追踪接入请求路径，`createObservabilityTracer(config?)` 构造独立 tracer（`ObservabilityTracer`）；`setGlobalTracer` / `getGlobalTracer` 管理共享实例。手动埋点使用 `startSpan(options | string)`、`withSpan(options | string, fn)`、`createSpan(options)` 与 `getSpan(c)`。请求 ID 来自 `generateRequestId()`、`getRequestId(c)` 与 `REQUEST_ID_HEADER` 常量。导出器：`createConsoleExporter(options)` 与 `createOpenTelemetryExporter(options)`。

## 静态文件服务

```ts
import { serveStatic } from '@ubean/server/static';

app.use('/*', serveStatic({ publicDir: './dist/public' }));
```

`serveStatic(options)` 从目录提供文件，并跳过 API 与 `_` 前缀路径。它读磁盘，因此是 Node 运行时特性 —— 在 Cloudflare Workers 等目标上，静态资源由平台层提供（`@ubean/app` 只在 `isNodeRuntime()` 时注册它）。

## 平台驱动

```ts
import { createCloudflareD1Database, createCloudflareQueueDriver } from '@ubean/server/drivers';
import { createVercelPostgresDatabase, createVercelKvQueueDriver } from '@ubean/server/drivers';
import { createBunSqliteDatabase } from '@ubean/server/drivers';
import { createDenoKvStorage, createNetlifyBlobsStorage } from '@ubean/server/drivers';

const db = createCloudflareD1Database(env.DB);
const driver = createCloudflareQueueDriver(env.QUEUES);
```

Cloudflare 有 `createCloudflareD1Database(db)` / `createCloudflareQueueDriver(queues, handlers?)` / `dispatchCloudflareQueueBatch(handlers, queueName, bodies)`；Vercel 有 `createVercelPostgresDatabase(client)` / `createVercelKvQueueDriver(kv, prefix?)`；Bun 有 `createBunSqliteDatabase(db)`；Deno 有 `createDenoKvStorage(kv)`；Netlify 有 `createNetlifyBlobsStorage(store)`。每个工厂接受结构化绑定类型（`D1DatabaseBinding`、`CloudflareQueueBinding`、`PostgresLike`、`KvListBinding`、`BunSqliteLike`、`DenoKvLike`、`NetlifyBlobsStore`），因此不导入任何平台 SDK —— 你把运行时交给你的绑定直接传进来。各平台的可运行示例见 [`examples/platform-drivers`](../../examples/platform-drivers)。

## 类型安全

- 环境与领域类型（`UbeanEnv`、`UbeanContext`、`UbeanVariables`、`UbeanBindings`、`RouteRule`、`Span*`）从 `@ubean/shared` 再导出，因此功能模块很少需要额外的类型导入。
- 存储与 KV 是泛型的：`useKV<T>(name?, options?)` 返回 `KVNamespace<T>`，`defineCachedFunction<TArgs, TResult>` 保留被包装函数的签名。
- 每个驱动工厂接受平台绑定的结构化接口而非具体 SDK 类型，这正是本包在未安装任何平台 SDK 的情况下也能通过类型检查的原因。

## 架构说明

- **子路径是语义划分，不是 1:1 映射。** `./cache`、`./realtime`、`./security`、`./cron`、`./analytics`、`./middleware` 各自聚合了多个内部模块；barrel 与子路径导出相同的符号。
- **新代码优先用子路径。** barrel 是便利入口，并不是体积问题 —— 函数再导出可以被 tree-shake，重依赖也是动态导入 —— 但它会迫使 `tsc` 与 IDE 在只导入一个符号时也解析每一个子模块的类型。这份类型解析成本正是子路径存在的原因。
- **重依赖都是懒加载的。** unstorage、db0、drizzle、crossws 与各平台 SDK 要么在其模块内动态导入，要么由调用方注入。`dependencies` 只列 `@ubean/shared`、`hono`、`hookable`、`pathe`。
- **应用层缓存刻意分成两处。** 路由级 HTTP 缓存属于 `./cache`（藏在 `CacheStore` 之后）；其他一切属于 `./storage`。这里没有 `useCache()` / `defineCache()`，也没有缓存分组与 `remember()`。
- **仅 Node 的能力被门控。** `serveStatic` 与 fs 缓存存储读文件系统，因此只在 Node 运行时接线；在 worker 上由平台提供资源与状态存储。
