# Pages and Routing Overview

ubean uses a file-based routing system similar to Next.js and Nuxt.

## Page Components

Pages are Vue components located in the `src/pages/` directory. The file structure determines the route path.

### Basic Pages

```
src/pages/
├── index.vue           → /
├── about.vue           → /about
└── blog/
    ├── index.vue       → /blog
    └── [slug].vue      → /blog/:slug
```

### Dynamic Routes

Use square brackets `[param]` for dynamic segments:

```
src/pages/users/[id].vue        → /users/:id
src/pages/posts/[year]/[slug].vue → /posts/:year/:slug
```

Access route parameters with `useRoute()`:

```vue
<script setup lang="ts">
import { useRoute } from '@ubean/core';

const route = useRoute();
const userId = route.params.id;
</script>
```

### Catch-All Routes

Use `[...]` for catch-all routes:

```
src/pages/[...path].vue → /anything/here
```

## Layouts

Layout components wrap pages and provide consistent UI across routes.

### Default Layout

Create `src/layouts/default.vue`:

```vue
<script setup lang="ts">
import { defineSlots } from 'vue';

defineSlots<{
  default: {};
}>();
</script>

<template>
  <header>
    <nav>
      <a href="/">Home</a>
      <a href="/about">About</a>
    </nav>
  </header>
  <main>
    <slot />
  </main>
</template>
```

### Custom Layouts

Specify a layout per page:

```vue
<script setup lang="ts">
definePageMeta({
  layout: 'admin'
});
</script>
```

Create `src/layouts/admin.vue` for the admin layout.

## Page Metadata

Use `definePageMeta` to configure page options:

```vue
<script setup lang="ts">
definePageMeta({
  layout: 'default',
  title: 'My Page',
  meta: [{ name: 'description', content: 'My page description' }],
  public: false
});
</script>
```

## Navigation

Use the `<Link>` component for client-side navigation:

```vue
<script setup lang="ts">
import { Link } from '@ubean/core';
</script>

<template>
  <Link to="/about">About</Link>
  <Link to="/users/1">User 1</Link>
</template>
```

## Route Helpers

### useRoute()

Get current route information:

```typescript
const route = useRoute();
console.log(route.path); // Current path
console.log(route.params); // Route parameters
console.log(route.query); // Query parameters
console.log(route.hash); // Hash fragment
```

### navigateTo()

Programmatic navigation:

```typescript
import { navigateTo } from '@ubean/core';

// Navigate to a path
navigateTo('/about');

// Navigate with query params
navigateTo({ path: '/search', query: { q: 'ubean' } });

// Replace current history entry
navigateTo('/about', { replace: true });

// External URL
navigateTo('https://example.com', { external: true });
```

### redirectTo()

Redirect with HTTP status code:

```typescript
import { redirectTo } from '@ubean/core';

// Temporary redirect (302)
redirectTo('/new-url');

// Permanent redirect (301)
redirectTo('/new-url', { statusCode: 301 });
```

## Route Rules

Define route-level rules in `ubean.config.ts`:

```typescript
import { defineConfig } from '@ubean/core';

export default defineConfig({
  routeRules: {
    '/api/**': {
      headers: {
        'Access-Control-Allow-Origin': '*'
      }
    },
    '/admin/**': {
      auth: true
    },
    '/static/**': {
      cache: {
        maxAge: 3600
      }
    }
  }
});
```

## Middleware

Middleware runs before page or API routes:

```typescript
// src/middleware/auth.ts
import { defineMiddleware } from '@ubean/core';

export default defineMiddleware(c => {
  const user = c.get('user');
  if (!user) {
    return c.redirect('/login');
  }
});
```

## Next Steps

- [Data Loaders](/docs/guide/pages-routing/loaders)
- [Actions](/docs/guide/pages-routing/actions)
- [API Routes](/docs/guide/api-routes)
