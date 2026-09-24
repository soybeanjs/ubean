---
title: 响应助手
description: 用于 API 路由的响应助手，建立在 Hono 的 context 对象之上。
translatedFrom: f80a35f6f2e9
sections: ["c813d8af","e3b0c442","591ac209","ecde8d73","3f96780a","ac4a085a","1e2c9c3e","e0b9d4e9","b5ef9e61","ffcfb0fa","ea877de1","46e52e1c","679c7c56","535a5c90","d8ae2dec","6ddcc3f1","eafd23a4"]
---

# 响应助手

ubean 的 API 路由底层使用 **Hono**，因此响应助手来自 Hono 的 context 对象（`c`）。ubean **不**导出独立的 `json()`、`html()`、`text()`、`redirect()`、`setHeader()`、`createError()`、`send()`、`stream()`、`download()`、`noContent()`、`notFound()` 等——请改用 Hono 的 context 方法。

## JSON 响应

```typescript
// src/routes/api/hello.ts
import { defineHandler } from 'ubean/server';

export const GET = defineHandler(c => {
  return c.json({ message: 'Hello' });
});

// 带状态码
export const POST = defineHandler(c => {
  return c.json({ created: true }, 201);
});

// 带响应头
export const PUT = defineHandler(c => {
  return c.json(
    { updated: true },
    200,
    { 'X-Custom-Header': 'value' }
  );
});
```

## HTML 响应

```typescript
import { defineHandler } from 'ubean/server';

export const GET = defineHandler(c => {
  return c.html('<h1>Hello</h1>');
});

// 带状态码
export const GET_ERROR = defineHandler(c => {
  return c.html('<h1>Not Found</h1>', 404);
});
```

## 纯文本响应

```typescript
import { defineHandler } from 'ubean/server';

export const GET = defineHandler(c => {
  return c.text('Hello World');
});
```

## 重定向

```typescript
import { defineHandler } from 'ubean/server';

export const GET = defineHandler(c => {
  // 302 重定向（默认）
  return c.redirect('/new-url');
});

// 永久重定向（301）
export const GET_PERMANENT = defineHandler(c => {
  return c.redirect('/new-url', 301);
});
```

## 设置响应头

```typescript
import { defineHandler } from 'ubean/server';

export const GET = defineHandler(c => {
  c.header('Cache-Control', 'max-age=3600');
  c.header('X-Custom', 'value');
  return c.json({ ok: true });
});
```

追加与覆盖的区别：

```typescript
c.header('Set-Cookie', 'session=abc; Path=/');      // 覆盖
c.header('Set-Cookie', 'tracking=xyz; Path=/', { append: true }); // 追加
```

## 设置状态码

```typescript
import { defineHandler } from 'ubean/server';

export const GET = defineHandler(c => {
  c.status(204);
  return c.body(null);
});

// 也可以把状态码传给响应方法
export const POST = defineHandler(c => {
  return c.json({ created: true }, 201);
});
```

## 无内容（204）

```typescript
import { defineHandler } from 'ubean/server';

export const DELETE = defineHandler(c => {
  // 删除资源...
  c.status(204);
  return c.body(null);
});
```

## 未找到（404）

```typescript
import { defineHandler } from 'ubean/server';

export const GET = defineHandler(c => {
  const user = findUser();
  if (!user) {
    c.status(404);
    return c.json({ error: 'Not found' });
  }
  return c.json({ user });
});
```

## 错误响应

抛出错误，或返回错误响应：

```typescript
import { defineHandler, defineHandlerMeta } from 'ubean/server';

export const GET = defineHandler(
  defineHandlerMeta({ requiresAuth: true }),
  c => {
    const user = c.get('user');
    if (!user) {
      c.status(401);
      return c.json({ error: 'Unauthorized' });
    }
    return c.json({ user });
  }
);
```

抛出 `HTTPException`（来自 Hono）：

```typescript
import { defineHandler } from 'ubean/server';
import { HTTPException } from 'hono/http-exception';

export const GET = defineHandler(c => {
  throw new HTTPException(404, { message: 'Resource not found' });
});
```

## 流式响应（SSE）

```typescript
import { defineHandler } from 'ubean/server';
import { streamSSE } from 'hono/streaming';

export const GET = defineHandler(c => {
  return streamSSE(c, async stream => {
    let id = 0;
    const sendEvent = async () => {
      await stream.writeSSE({ data: `Event ${id++}`, event: 'update' });
    };
    await sendEvent();
    const interval = setInterval(sendEvent, 1000);
    stream.onAbort(() => clearInterval(interval));
  });
});
```

## 流式响应体

```typescript
import { defineHandler } from 'ubean/server';
import { stream } from 'hono/streaming';

export const GET = defineHandler(c => {
  return stream(c, async stream => {
    await stream.writeln('Hello');
    await stream.writeln('World');
  });
});
```

## Cookie

```typescript
import { defineHandler } from 'ubean/server';

export const POST = defineHandler(c => {
  // 设置 cookie
  c.header('Set-Cookie', 'session=abc; HttpOnly; Path=/; Max-Age=3600');

  // 读取 cookie
  const session = c.req.header('Cookie');

  return c.json({ ok: true });
});
```

类型化的 cookie 助手请用 `hono/cookie`：

```typescript
import { defineHandler } from 'ubean/server';
import { getCookie, setCookie } from 'hono/cookie';

export const GET = defineHandler(c => {
  const session = getCookie(c, 'session');
  return c.json({ session });
});

export const POST = defineHandler(c => {
  setCookie(c, 'session', 'abc', {
    httpOnly: true,
    maxAge: 3600,
    path: '/'
  });
  return c.json({ ok: true });
});
```

## 文件下载

```typescript
import { defineHandler } from 'ubean/server';

export const GET = defineHandler(c => {
  const buffer = readFileBytes();
  c.header('Content-Disposition', 'attachment; filename="document.pdf"');
  c.header('Content-Type', 'application/pdf');
  return c.body(buffer);
});
```

## 最佳实践

1. **使用 Hono 的 context 方法**：`c.json()`、`c.html()`、`c.text()`、`c.redirect()`、`c.header()`、`c.status()`
2. **校验输入**：类型安全的请求请用 `hono-openapi` 的 `validator()`
3. **为端点写文档**：用 `describeRoute()` 提供 OpenAPI 元数据
4. **优雅处理错误**：返回恰当的状态码
5. **设置缓存头**：静态资源用 `c.header('Cache-Control', ...)`
6. **善用流式**：大响应或实时数据请用 Hono 的流式助手
