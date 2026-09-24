---
title: 缓存
description: "路由级 HTTP 缓存：CacheStore、defineCachedFunction、cacheLife/cacheTag 与失效。"
---

# 缓存操作

ubean 内置了一套路由级 HTTP 缓存，核心是可替换的 `CacheStore`。它不是通用的键/值缓存客户端——若要做任意应用缓存，请使用 ubean 内置的存储层（`@ubean/server` 的 `useStorage`/`useKV`）。

## useCacheStore()

获取或设置全局缓存存储。默认为带 LRU 淘汰的内存存储。

```typescript
import { useCacheStore, createMemoryStore } from 'ubean/server';

// 使用默认的内存存储
const store = useCacheStore();

// 替换全局存储（例如换成 Redis 实现）
useCacheStore(createMemoryStore(500));
```

### CacheStore 接口

```typescript
export interface CacheStore {
  get(key: string): Promise<CacheEntry | undefined>;
  set(key: string, entry: Omit<CacheEntry, 'createdAt' | 'expiresAt'>, ttl: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  clear(): Promise<void>;
  /**
   * 读取条目，但不更新最近使用顺序，也不删除过期条目。
   * 可选（P9-03）：供 ISR SWR 在重新验证时返回旧内容。
   * 不支持 peek 的实现应将其留为 undefined；
   * 此时 ISR 回退到 `get()`（会删除过期条目，从而禁用 SWR）。
   */
  peek?(key: string): Promise<CacheEntry | undefined>;
}
```

实现该接口即可用 Redis、KV 或任何其他存储承载缓存。默认的 `createMemoryStore(maxEntries = 200)` 在写满时淘汰约 20% 最旧的条目。可选的 `peek()` 方法（P9-03 新增）是 ISR stale-while-revalidate 的前提——它即使条目已过期也返回原始条目，且不触碰 LRU 最近使用顺序、不淘汰该条目。

## createMemoryStore()

```typescript
import { createMemoryStore } from 'ubean/server';

const store = createMemoryStore(1000); // 最多 1000 个条目
```

## createCacheMiddleware()

把缓存作为 Hono 中间件挂载，由路由规则驱动。当 `routeRules` 声明了 `cache` 时，ubean 运行时会内部使用它。

```typescript
import { createCacheMiddleware, useCacheStore } from 'ubean/server';

app.use(createCacheMiddleware({
  store: useCacheStore(),
  rules: {
    '/api/products/**': { ttl: 60 },         // 60 秒
    '/api/feed': { ttl: 300, swr: true }     // 5 分钟，stale-while-revalidate
  },
  defaultTtl: 0
}));
```

| 选项 | 类型 | 说明 |
| ----------- | ----------------------------- | -------------------------------------------- |
| store       | CacheStore                    | 存储实现（默认为全局存储）    |
| rules       | Record<string, CacheRule>     | 路径模式 → 缓存规则 的映射            |
| defaultTtl  | number                        | 无规则匹配时应用的 TTL（0 表示禁用） |

路径模式支持 `*`（单段）与 `**`（多段），语义与 `routeRules` 一致。

### CacheRule

```typescript
export interface CacheRule {
  ttl: number;        // 秒；0 表示禁用缓存
  swr?: boolean | number;  // 只发出 stale-while-revalidate
                       // 响应头（CDN 语义）；应用层在重新验证
                       // 期间返回旧内容仅 ISR 支持
  name?: string;      // 显式缓存键（默认为 method + path + query）
}
```

## cachedEventHandler()

用缓存包装单个处理器。适合难以套进路径模式规则模型的昂贵端点。

```typescript
import { defineHandler, cachedEventHandler } from 'ubean/server';

export const GET = defineHandler(
  cachedEventHandler(
    async c => {
      const data = await expensiveCompute();
      return c.json(data);
    },
    { ttl: 300, name: 'expensive:endpoint' }
  )
);
```

可缓存性由框架自动强制：
- 只缓存 `GET`/`HEAD` 请求
- 带 `Authorization` 头的请求永不缓存
- 带 cookie 的请求仅在响应发送 `Cache-Control: public` 时才缓存
- 状态码非 200、或带 `Cache-Control: private` / `no-store` 的响应永不存储；写入前会剥离 `set-cookie` 头（因此使用 cookie 鉴权的应用同样可缓存）

## defineCachedFunction()

用缓存包装任意函数。适合对昂贵计算（数据库查询、远程请求、派生数据）做记忆化，并通过 TTL 与标签失效。

```typescript
import { defineCachedFunction, cacheLife, cacheTag } from 'ubean/server';

// 包装函数；在函数体内声明 TTL 与标签
export const getUserProfile = defineCachedFunction(
  async (userId: string) => {
    cacheLife(60);                          // 60 秒 TTL
    cacheTag('users', `user:${userId}`);    // 挂上标签以便失效
    const user = await db.query.users.findById(userId);
    return user;
  },
  { name: 'getUserProfile' }                // name 必填（缓存键前缀）
);

// 在变更处理器中按标签失效
import { revalidateTag } from 'ubean/server';
await revalidateTag('users'); // 失效所有带 'users' 标签的条目
```

| 选项 | 类型 | 说明 |
| ----------- | ------------------- | ----------------------------------------------------------------- |
| name        | string（必填）   | 缓存键前缀（如 `'getUserProfile'`）                        |
| defaultTtl  | number              | 未调用 `cacheLife()` 时的 TTL（秒，默认 60）      |
| getKey      | (...args) => string | 自定义缓存键生成器（默认为 `name + JSON.stringify(args)`） |

## invalidateRouteCache()

按键、按模式失效缓存条目，或清空全部。

```typescript
import { invalidateRouteCache } from 'ubean/server';

await invalidateRouteCache('GET:/api/users:1');   // 精确键
await invalidateRouteCache(/^GET:\/api\/users:/); // 正则匹配
await invalidateRouteCache();                      // 清空全部
```

## 路由规则集成

缓存规则通常在 `ubean.config.ts` 中通过 `routeRules` 声明，运行时会自动把它们解析为 `CacheRule`。

```typescript
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  routeRules: {
    '/api/products/**': { cache: { ttl: 60 } },
    '/api/feed': { cache: { ttl: 300, swr: true } },
    '/api/user/**': { headers: { 'cache-control': 'no-store' } }
  }
});
```

中间件会在命中缓存的响应上设置 `X-Cache: HIT` 与 `Age` 头以便观测（不会发出 `MISS` 标记）。

## ISR（增量静态再生成）

ISR（P9-03）为页面路由的**渲染后 HTML** 加 TTL 缓存，并可选地在后台重新验证时继续返回旧内容。与 `cache` 规则（在中间件层缓存 HTTP 响应）不同，ISR 缓存的是 Vue SSR 渲染器的输出，并通过 `routeRules.isr` 按路由配置。

```typescript
// ubean.config.ts
export default defineConfig({
  routeRules: {
    // 每 60 秒再生成 /blog/** 页面；重新验证期间返回旧内容
    '/blog/**': { isr: { ttl: 60, swr: true } },
    // 简写形式：只写 ttl（不启用 SWR）
    '/news/**': { isr: 300 }
  }
});
```

| 形式                           | 行为                                                            |
| ------------------------------ | ------------------------------------------------------------------- |
| `isr: 300`                     | 缓存 HTML 300 秒。过期后由下一次请求重新渲染。     |
| `isr: { ttl: 60 }`             | 等价于 `isr: 60`。                                                  |
| `isr: { ttl: 60, swr: true }`  | 缓存 HTML 60 秒；过期后返回旧内容并在后台重新验证。 |

### 工作方式

1. 对带 ISR 规则的页面发起 `GET` 请求时，路由层会到缓存存储中查渲染好的 HTML。
2. **HIT**（条目存在且未过期）→ 返回缓存 HTML，带 `X-ISR: HIT`。
3. **STALE**（条目存在但已过期，且 `swr: true`）→ 返回旧 HTML，带 `X-ISR: STALE`，并触发后台重新验证（按路径去重）。
4. **MISS**（没有条目，或 `swr: false` 且条目已过期）→ 同步渲染 HTML、写入缓存，带 `X-ISR: MISS` 返回。

只要存在任一 `isr` 规则，运行时就会自动初始化缓存存储。自定义存储应实现 `peek()` 以支持 SWR——否则 ISR 会回退到 `get()`，而它会删除过期条目（从而无法返回旧内容）。

### 失效

用 `invalidateRouteCache()` 失效 ISR 条目（与 HTTP 缓存是同一套 API）：

```typescript
import { invalidateRouteCache } from 'ubean/server';

// 发布新博客文章后，失效所有 /blog/* 的 ISR 条目
await invalidateRouteCache(/^isr:\/blog\//);
```

### 与其他渲染模式的关系

| 特性                | 运行时机                | 输出           | 缓存                       |
| ---------------------- | --------------------------- | ---------------- | ----------------------------- |
| `prerender: true`      | 构建时                  | 静态 HTML 文件 | 永久（直到下次构建）  |
| `isr`                  | 首次请求 / 过期时   | 缓存的 HTML      | 基于 TTL + 可选 SWR      |
| `ssr: true`（默认）  | 每次请求               | 全新 HTML       | 无                          |
| `ssr: false`           | 客户端                 | 空壳      | 无                          |

ISR 要求开启 SSR（全局 `ssr: true`，或按路由 `ssr: true` / `ssr: 'streaming'`）。路由若同时写了 `ssr: false` 与 `isr`，ISR 会被跳过（没有可用的渲染器）。

## 自定义存储

为 Redis、Cloudflare KV 或任何持久化后端实现 `CacheStore`：

```typescript
import { useCacheStore } from 'ubean/server';
import { type CacheStore } from 'ubean/server';
import { createClient } from 'redis';

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

const redisStore: CacheStore = {
  async get(key) {
    const raw = await redis.get(`cache:${key}`);
    return raw ? JSON.parse(raw) : undefined;
  },
  async set(key, entry, ttl) {
    await redis.set(`cache:${key}`, JSON.stringify(entry), { EX: ttl });
  },
  async delete(key) {
    const count = await redis.del(`cache:${key}`);
    return count > 0;
  },
  async clear() {
    // 实现时需谨慎——生产环境通常按前缀限定范围
  }
};

useCacheStore(redisStore);
```

## ubean 不提供什么

以下 API（在其他框架的缓存模块中很常见）ubean **不**提供：

- `useCache()` / `defineCache()` —— 改用 `useCacheStore()` + `cachedEventHandler`
- 缓存分组与 `remember()` / `rememberForever()` 辅助函数 —— 改用 `defineCachedFunction` + `revalidateTag`
- 内置 Redis/Memcached/文件驱动 —— 请自行实现 `CacheStore` 接口，或在 ubean 存储层上挂驱动

若需要任意应用级键/值缓存（而非 HTTP 响应缓存），优先使用内置的 `useStorage` / `useKV`（来自 `ubean/server`）：

```typescript
import { useStorage } from 'ubean/server';

const storage = useStorage();
await storage.set('user:1', { name: 'John' });
const user = await storage.get('user:1');
```

## 最佳实践

1. **在路由层缓存** —— 为保持一致，优先用 `routeRules` 而不是逐处理器缓存。
2. **给自定义存储划定范围** —— 为 Redis 键加命名空间，避免跨部署冲突。
3. **变更后失效** —— 在 `POST`/`PATCH`/`DELETE` 处理器中调用 `invalidateRouteCache(...)`。
4. **绝不缓存需鉴权的响应** —— 中间件已强制这一点，但仍请核对你的 `Cache-Control` 头。
5. **高流量 feed 用 `swr`** —— 在后台重新验证的同时保持低延迟。
