# Route Helpers

## useRoute()

Get current route information.

```typescript
import { useRoute } from '@ubean/core';

const route = useRoute();
```

### Properties

| Property | Type                   | Description      |
| -------- | ---------------------- | ---------------- |
| path     | string                 | Current path     |
| params   | Record<string, string> | Route parameters |
| query    | Record<string, string> | Query parameters |
| hash     | string                 | Hash fragment    |
| fullPath | string                 | Full URL path    |

### Example

```typescript
const route = useRoute();
console.log(route.path); // "/users/123"
console.log(route.params.id); // "123"
console.log(route.query.q); // "search term"
```

## navigateTo()

Programmatic navigation.

```typescript
import { navigateTo } from '@ubean/core';
```

### Parameters

| Parameter | Type                    | Description        |
| --------- | ----------------------- | ------------------ |
| to        | string \| RouteLocation | Target path        |
| options   | NavigateOptions         | Navigation options |

### Options

| Option   | Type    | Default | Description           |
| -------- | ------- | ------- | --------------------- |
| replace  | boolean | false   | Replace history entry |
| external | boolean | false   | External URL          |
| shallow  | boolean | false   | Skip full page reload |

### Example

```typescript
// Navigate to path
navigateTo('/about');

// Navigate with query
navigateTo({ path: '/search', query: { q: 'ubean' } });

// Replace mode
navigateTo('/about', { replace: true });

// External URL
navigateTo('https://example.com', { external: true });
```

## redirectTo()

Redirect with HTTP status code.

```typescript
import { redirectTo } from '@ubean/core';
```

### Parameters

| Parameter | Type            | Description      |
| --------- | --------------- | ---------------- |
| to        | string          | Target path      |
| options   | RedirectOptions | Redirect options |

### Options

| Option     | Type   | Default | Description      |
| ---------- | ------ | ------- | ---------------- |
| statusCode | number | 302     | HTTP status code |

### Example

```typescript
// Temporary redirect (302)
redirectTo('/new-url');

// Permanent redirect (301)
redirectTo('/new-url', { statusCode: 301 });
```

## useRouter()

Access router instance.

```typescript
import { useRouter } from '@ubean/core';

const router = useRouter();
```

### Methods

| Method      | Description           |
| ----------- | --------------------- |
| push(to)    | Navigate to path      |
| replace(to) | Replace current route |
| back()      | Go back               |
| forward()   | Go forward            |
| go(n)       | Navigate n steps      |

### Example

```typescript
const router = useRouter();
router.push('/about');
router.back();
```

## useRouteParams()

Get reactive route parameters.

```typescript
import { useRouteParams } from '@ubean/core';

const params = useRouteParams();
const id = params.id;
```

## useRouteQuery()

Get reactive query parameters.

```typescript
import { useRouteQuery } from '@ubean/core';

const query = useRouteQuery();
const search = query.q;
```

## useLocalePath()

Generate localized paths.

```typescript
import { useLocalePath } from '@ubean/core';

const localePath = useLocalePath();

const enPath = localePath('/about', 'en');
const zhPath = localePath('/about', 'zh-CN');
```

## useSwitchLocalePath()

Generate paths for switching locale.

```typescript
import { useSwitchLocalePath } from '@ubean/core';

const switchLocalePath = useSwitchLocalePath();

// Switch to English
switchLocalePath('en');

// Switch to Chinese
switchLocalePath('zh-CN');
```

## definePage()

Define page metadata.

```vue
<script setup lang="ts">
definePage({
  layout: 'default',
  title: 'My Page',
  meta: [{ name: 'description', content: 'Description' }],
  public: false
});
</script>
```

### Options

| Option     | Type               | Description      |
| ---------- | ------------------ | ---------------- |
| layout     | string             | Layout name      |
| title      | string             | Page title       |
| meta       | Array              | Meta tags        |
| public     | boolean            | Public page      |
| middleware | string \| string[] | Middleware names |
