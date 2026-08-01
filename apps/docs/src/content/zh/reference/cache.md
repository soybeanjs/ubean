---
title: 缓存
description: ubean 缓存系统的 API 参考。
status: translated-stub
---

# 缓存

本页面尚未翻译完成，当前将显示英文内容。

## 从旧语法迁移

`"use cache"` 字符串指令及其 `ubeanCacheDirectivePlugin` Vite 插件（原从 `@ubean/server/vite` 导出）已**移除**。请迁移到显式的 `defineCachedFunction()` 包装器：

```typescript
// 迁移前（已移除）："use cache" 字符串指令
async function getUserProfile(userId: string) {
  'use cache';
  return await db.query.users.findById(userId);
}

// 迁移后：显式 defineCachedFunction() 包装器
export const getUserProfile = defineCachedFunction(
  async (userId: string) => db.query.users.findById(userId),
  { ttl: 60 }
);
```

> `wrapWithCache(fn, options)` 作为 `defineCachedFunction()` 的弃用别名保留，新代码请使用 `defineCachedFunction()`。`cacheLife()` / `cacheTag()` 宏以及 `revalidateTag()` / `revalidateTags()` / `revalidatePath()` 失效 API 保持不变。
