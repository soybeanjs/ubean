# Response Helpers

## json()

Return JSON response.

```typescript
import { json } from '@ubean/core';

export default defineEventHandler(() => {
  return json({ message: 'Hello' });
});
```

### Parameters

| Parameter | Type        | Description      |
| --------- | ----------- | ---------------- |
| data      | any         | Response data    |
| options   | JsonOptions | Response options |

### Options

| Option  | Type                   | Default | Description      |
| ------- | ---------------------- | ------- | ---------------- |
| status  | number                 | 200     | HTTP status code |
| headers | Record<string, string> | {}      | Response headers |

### Example

```typescript
return json({ success: true }, { status: 201 });
```

## html()

Return HTML response.

```typescript
import { html } from '@ubean/core';

export default defineEventHandler(() => {
  return html('<h1>Hello</h1>');
});
```

### Parameters

| Parameter | Type        | Description      |
| --------- | ----------- | ---------------- |
| content   | string      | HTML content     |
| options   | HtmlOptions | Response options |

### Options

| Option  | Type                   | Default | Description      |
| ------- | ---------------------- | ------- | ---------------- |
| status  | number                 | 200     | HTTP status code |
| headers | Record<string, string> | {}      | Response headers |

## text()

Return plain text response.

```typescript
import { text } from '@ubean/core';

export default defineEventHandler(() => {
  return text('Hello World');
});
```

### Parameters

| Parameter | Type        | Description      |
| --------- | ----------- | ---------------- |
| content   | string      | Text content     |
| options   | TextOptions | Response options |

### Options

| Option  | Type                   | Default | Description      |
| ------- | ---------------------- | ------- | ---------------- |
| status  | number                 | 200     | HTTP status code |
| headers | Record<string, string> | {}      | Response headers |

## redirect()

Return redirect response.

```typescript
import { redirect } from '@ubean/core';

export default defineEventHandler(() => {
  return redirect('/new-url');
});
```

### Parameters

| Parameter  | Type   | Description      |
| ---------- | ------ | ---------------- |
| to         | string | Target URL       |
| statusCode | number | HTTP status code |

### Example

```typescript
return redirect('/new-url', 301);
```

## permanentRedirect()

Return permanent redirect (301).

```typescript
import { permanentRedirect } from '@ubean/core';

export default defineEventHandler(() => {
  return permanentRedirect('/new-url');
});
```

## setHeader()

Set a response header.

```typescript
import { setHeader } from '@ubean/core';

export default defineEventHandler(c => {
  setHeader(c, 'Content-Type', 'application/json');
  return json({ message: 'Hello' });
});
```

### Parameters

| Parameter | Type        | Description     |
| --------- | ----------- | --------------- |
| context   | HonoContext | Request context |
| name      | string      | Header name     |
| value     | string      | Header value    |

## setHeaders()

Set multiple response headers.

```typescript
import { setHeaders } from '@ubean/core';

export default defineEventHandler(c => {
  setHeaders(c, {
    'Content-Type': 'application/json',
    'Cache-Control': 'max-age=3600'
  });
  return json({ message: 'Hello' });
});
```

### Parameters

| Parameter | Type                   | Description     |
| --------- | ---------------------- | --------------- |
| context   | HonoContext            | Request context |
| headers   | Record<string, string> | Headers object  |

## createError()

Create an error response.

```typescript
import { createError } from '@ubean/core';

export default defineEventHandler(() => {
  throw createError({
    statusCode: 404,
    statusMessage: 'Not Found',
    data: { message: 'Resource not found' }
  });
});
```

### Options

| Option        | Type   | Description      |
| ------------- | ------ | ---------------- |
| statusCode    | number | HTTP status code |
| statusMessage | string | Status message   |
| data          | any    | Error data       |
| message       | string | Error message    |

## send()

Send a custom response.

```typescript
import { send } from '@ubean/core';

export default defineEventHandler(c => {
  return send(c, 'Custom response', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' }
  });
});
```

### Parameters

| Parameter | Type        | Description      |
| --------- | ----------- | ---------------- |
| context   | HonoContext | Request context  |
| body      | any         | Response body    |
| options   | SendOptions | Response options |

## stream()

Send streaming response.

```typescript
import { stream } from '@ubean/core';

export default defineEventHandler(c => {
  const encoder = new TextEncoder();
  const iterator = async function* () {
    yield encoder.encode('Hello');
    yield encoder.encode(' World');
  };

  return stream(c, iterator());
});
```

## download()

Return download response.

```typescript
import { download } from '@ubean/core';

export default defineEventHandler(c => {
  return download(c, '/path/to/file.pdf', 'document.pdf');
});
```

### Parameters

| Parameter | Type        | Description       |
| --------- | ----------- | ----------------- |
| context   | HonoContext | Request context   |
| path      | string      | File path         |
| filename  | string      | Download filename |

## noContent()

Return 204 No Content.

```typescript
import { noContent } from '@ubean/core';

export default defineEventHandler(() => {
  return noContent();
});
```

## notFound()

Return 404 Not Found.

```typescript
import { notFound } from '@ubean/core';

export default defineEventHandler(() => {
  return notFound();
});
```

## forbidden()

Return 403 Forbidden.

```typescript
import { forbidden } from '@ubean/core';

export default defineEventHandler(() => {
  return forbidden();
});
```

## unauthorized()

Return 401 Unauthorized.

```typescript
import { unauthorized } from '@ubean/core';

export default defineEventHandler(() => {
  return unauthorized();
});
```

## badRequest()

Return 400 Bad Request.

```typescript
import { badRequest } from '@ubean/core';

export default defineEventHandler(() => {
  return badRequest();
});
```

## serverError()

Return 500 Internal Server Error.

```typescript
import { serverError } from '@ubean/core';

export default defineEventHandler(() => {
  return serverError();
});
```
