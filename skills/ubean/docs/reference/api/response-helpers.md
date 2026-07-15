# Response Helpers

ubean API routes use **Hono** under the hood, so response helpers come from Hono's context object (`c`). ubean does **not** export standalone `json()`, `html()`, `text()`, `redirect()`, `setHeader()`, `createError()`, `send()`, `stream()`, `download()`, `noContent()`, `notFound()`, etc. — use Hono's context methods instead.

## JSON Response

```typescript
// src/routes/api/hello.ts
import { defineHandler } from 'ubean';

export const GET = defineHandler(c => {
  return c.json({ message: 'Hello' });
});

// With status code
export const POST = defineHandler(c => {
  return c.json({ created: true }, 201);
});

// With headers
export const PUT = defineHandler(c => {
  return c.json(
    { updated: true },
    200,
    { 'X-Custom-Header': 'value' }
  );
});
```

## HTML Response

```typescript
import { defineHandler } from 'ubean';

export const GET = defineHandler(c => {
  return c.html('<h1>Hello</h1>');
});

// With status
export const GET_ERROR = defineHandler(c => {
  return c.html('<h1>Not Found</h1>', 404);
});
```

## Plain Text Response

```typescript
import { defineHandler } from 'ubean';

export const GET = defineHandler(c => {
  return c.text('Hello World');
});
```

## Redirect

```typescript
import { defineHandler } from 'ubean';

export const GET = defineHandler(c => {
  // 302 redirect (default)
  return c.redirect('/new-url');
});

// Permanent redirect (301)
export const GET_PERMANENT = defineHandler(c => {
  return c.redirect('/new-url', 301);
});
```

## Setting Headers

```typescript
import { defineHandler } from 'ubean';

export const GET = defineHandler(c => {
  c.header('Cache-Control', 'max-age=3600');
  c.header('X-Custom', 'value');
  return c.json({ ok: true });
});
```

Append vs set:

```typescript
c.header('Set-Cookie', 'session=abc; Path=/');      // Overwrites
c.header('Set-Cookie', 'tracking=xyz; Path=/', { append: true }); // Appends
```

## Setting Status Code

```typescript
import { defineHandler } from 'ubean';

export const GET = defineHandler(c => {
  c.status(204);
  return c.body(null);
});

// Or pass status to response methods
export const POST = defineHandler(c => {
  return c.json({ created: true }, 201);
});
```

## No Content (204)

```typescript
import { defineHandler } from 'ubean';

export const DELETE = defineHandler(c => {
  // Delete resource...
  c.status(204);
  return c.body(null);
});
```

## Not Found (404)

```typescript
import { defineHandler } from 'ubean';

export const GET = defineHandler(c => {
  const user = findUser();
  if (!user) {
    c.status(404);
    return c.json({ error: 'Not found' });
  }
  return c.json({ user });
});
```

## Error Responses

Throw an error or return an error response:

```typescript
import { defineHandler, defineHandlerMeta } from 'ubean';

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

Throw `HTTPException` (from Hono):

```typescript
import { defineHandler } from 'ubean';
import { HTTPException } from 'hono/http-exception';

export const GET = defineHandler(c => {
  throw new HTTPException(404, { message: 'Resource not found' });
});
```

## Streaming Response (SSE)

```typescript
import { defineHandler } from 'ubean';
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

## Streaming Body

```typescript
import { defineHandler } from 'ubean';
import { stream } from 'hono/streaming';

export const GET = defineHandler(c => {
  return stream(c, async stream => {
    await stream.writeln('Hello');
    await stream.writeln('World');
  });
});
```

## Cookies

```typescript
import { defineHandler } from 'ubean';

export const POST = defineHandler(c => {
  // Set cookie
  c.header('Set-Cookie', 'session=abc; HttpOnly; Path=/; Max-Age=3600');

  // Read cookie
  const session = c.req.header('Cookie');

  return c.json({ ok: true });
});
```

Use `hono/cookie` for typed cookie helpers:

```typescript
import { defineHandler } from 'ubean';
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

## File Download

```typescript
import { defineHandler } from 'ubean';

export const GET = defineHandler(c => {
  const buffer = readFileBytes();
  c.header('Content-Disposition', 'attachment; filename="document.pdf"');
  c.header('Content-Type', 'application/pdf');
  return c.body(buffer);
});
```

## Best Practices

1. **Use Hono's context methods**: `c.json()`, `c.html()`, `c.text()`, `c.redirect()`, `c.header()`, `c.status()`
2. **Validate inputs**: Use `validator()` from `hono-openapi` for type-safe requests
3. **Document endpoints**: Use `describeRoute()` for OpenAPI metadata
4. **Handle errors gracefully**: Return appropriate status codes
5. **Set cache headers**: Use `c.header('Cache-Control', ...)` for static resources
6. **Use streaming**: For large responses or real-time data, use Hono's streaming helpers
