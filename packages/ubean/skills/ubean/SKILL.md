# ubean Skill

> ubean is a full-stack framework for building modern web applications. It combines Vite, Hono, and Vue to provide a powerful development experience.

## Agent Info

- **Name**: ubean
- **Description**: Full-stack framework for building modern web applications with Vite, Hono, and Vue
- **Version**: 0.0.1
- **Category**: Web Framework

## Commands

| Command  | Description                    | Usage                     |
| -------- | ------------------------------ | ------------------------- |
| init     | Initialize a new ubean project | `ubean init [options]`    |
| dev      | Start development server       | `ubean dev [options]`     |
| build    | Build for production           | `ubean build [options]`   |
| preview  | Preview production build       | `ubean preview [options]` |
| config   | Show resolved configuration    | `ubean config [options]`  |
| page     | Scaffold a new page            | `ubean page <name>`       |
| devtools | Open DevTools                  | `ubean devtools`          |

### Command Details

#### ubean init

Initialize a new ubean project with interactive wizard or non-interactive mode.

**Options:**

- `--name, -n`: Project name
- `--template, -t`: Template (starter, minimal, blog)
- `--preset, -p`: Preset (standard, node, cloudflare)
- `--pm`: Package manager (npm, pnpm, yarn)
- `--yes, -y`: Skip interactive prompts
- `--force, -f`: Overwrite existing directory
- `--git`: Initialize git repository

**Examples:**

```bash
ubean init
ubean init --name my-app --template starter --preset node
ubean init -n blog -t blog -y
```

#### ubean dev

Start the development server with hot module replacement.

**Options:**

- `--port, -p`: Server port (default: 5173)
- `--host`: Host to listen on
- `--https`: Enable HTTPS
- `--open`: Open browser on start

**Examples:**

```bash
ubean dev
ubean dev --port 3000 --host 0.0.0.0
```

#### ubean build

Build the application for production.

**Options:**

- `--preset, -p`: Build preset (standard, node, cloudflare)
- `--clean`: Clean output directory before build
- `--sourcemap`: Generate source maps

**Examples:**

```bash
ubean build
ubean build --preset cloudflare
```

#### ubean preview

Preview the production build locally.

**Options:**

- `--port, -p`: Preview port (default: 4173)
- `--host`: Host to listen on

**Examples:**

```bash
ubean preview
ubean preview --port 3000
```

#### ubean config

Show resolved configuration.

**Options:**

- `--json`: Output as JSON
- `--env`: Show environment variables

**Examples:**

```bash
ubean config
ubean config --json
```

#### ubean page

Scaffold a new page component.

**Arguments:**

- `<name>`: Page name (e.g., "about", "blog/post")

**Examples:**

```bash
ubean page about
ubean page "blog/post"
```

#### ubean devtools

Open the DevTools panel.

**Examples:**

```bash
ubean devtools
```

## API Routes

### Built-in Routes

| Route                   | Method              | Description                  |
| ----------------------- | ------------------- | ---------------------------- |
| `/api/_health`          | GET                 | Health check endpoint        |
| `/api/_devtools/rpc`    | POST                | DevTools RPC endpoint        |
| `/api/_devtools/crud/*` | GET/POST/PUT/DELETE | CRUD operations for DevTools |

### Custom Routes

Custom API routes are defined in `src/routes/api/` directory:

- `GET /api/users` → `src/routes/api/users.get.ts`
- `POST /api/users` → `src/routes/api/users.post.ts`
- `PUT /api/users/:id` → `src/routes/api/users/[id].put.ts`

## Document Routes

### Guide

- `/docs/guide/quickstart`: Quick start guide
- `/docs/guide/pages-routing/overview`: Pages and routing overview
- `/docs/guide/pages-routing/loaders`: Data loaders
- `/docs/guide/pages-routing/actions`: Actions
- `/docs/guide/i18n`: Internationalization
- `/docs/guide/islands`: Islands architecture

### Reference

- `/docs/reference/api/route-helpers`: Route helper functions
- `/docs/reference/api/response-helpers`: Response helper functions
- `/docs/reference/api/env`: Environment variables
- `/docs/reference/api/database`: Database operations
- `/docs/reference/api/cache`: Cache operations
- `/docs/reference/api/queue`: Queue operations
- `/docs/reference/api/i18n`: I18n API

### Integrations

- `/docs/integrations/database`: Database integrations (Drizzle, Prisma)
- `/docs/integrations/auth`: Authentication (Better Auth)
- `/docs/integrations/icons`: Icons (Iconify)
- `/docs/integrations/pwa`: PWA support
- `/docs/integrations/content`: Content management
- `/docs/integrations/image`: Image optimization
- `/docs/integrations/fonts`: Font optimization

## Configuration

### ubean.config.ts

```typescript
import { defineConfig } from '@ubean/core';

export default defineConfig({
  rootDir: '.',
  srcDir: 'src',
  modules: [],
  icon: false,
  pwa: false,
  auth: false,
  image: false,
  fonts: false
});
```

### Module Configuration

```typescript
export default defineConfig({
  modules: [
    // Vite plugin instance
    somePlugin(),

    // Factory tuple
    [iconFactory, { prefix: 'icon-' }],

    // Module definition
    {
      name: 'my-module',
      vitePlugin: myPlugin(),
      setup(options, kit) {
        kit.addServerHandler({ route: '/api/hello', handler: () => 'Hello' });
      },
      dependsOn: ['@ubean/icon']
    }
  ]
});
```

## Key Features

### 1. Full-Stack Framework

- Server-side rendering (SSR) with Vue
- Client-side hydration
- Islands architecture for partial hydration

### 2. Vite Integration

- Middleware mode for dev server
- Hot module replacement
- Virtual modules for framework internals

### 3. Module System

- Plugin-based architecture
- Topological dependency resolution
- Nuxt Kit-style API (addServerHandler, addVitePlugin, etc.)

### 4. Internationalization

- Built-in i18n support
- Locale auto-detection
- Pluralization and Intl formatting
- SEO-friendly locale routing

### 5. DevTools

- Real-time inspection
- API documentation
- CRUD operations
- AI assistant

### 6. Platform Presets

- Standard: Generic fetch handler
- Node: Node.js HTTP server
- Cloudflare: Cloudflare Workers

## Project Structure

```
├── src/
│   ├── routes/           # API routes
│   │   └── api/          # API endpoints
│   ├── pages/            # Page components
│   ├── layouts/          # Layout components
│   ├── middleware/       # Middleware
│   ├── composables/      # Vue composables
│   ├── components/       # Vue components
│   ├── locales/          # Translation files
│   ├── plugins/          # Vite plugins
│   ├── crons/            # Cron jobs
│   └── queues/           # Queue workers
├── ubean.config.ts       # Framework config
├── vite.config.ts        # Vite config (optional)
└── package.json
```

## Common Workflows

### Creating a Page

```bash
ubean page about
```

### Creating an API Route

```typescript
// src/routes/api/hello.get.ts
import { defineEventHandler } from '@ubean/core';

export default defineEventHandler(() => {
  return { message: 'Hello World!' };
});
```

### Using Loaders

```vue
<script setup lang="ts">
import { defineLoader } from '@ubean/core';

const data = await defineLoader(() => {
  return {
    posts: [{ id: 1, title: 'Hello' }]
  };
});
</script>

<template>
  <div v-for="post in data.posts" :key="post.id">
    {{ post.title }}
  </div>
</template>
```

### Using Actions

```vue
<script setup lang="ts">
import { defineAction } from '@ubean/core';

const { pending, execute } = defineAction(async (formData: FormData) => {
  await fetch('/api/submit', {
    method: 'POST',
    body: formData
  });
});
</script>

<template>
  <form @submit.prevent="execute">
    <button :disabled="pending">Submit</button>
  </form>
</template>
```

### Internationalization

```typescript
// src/locales/en.json
{
  "hello": "Hello",
  "welcome": "Welcome to @:app.name",
  "items": "no items | one item | {count} items"
}
```

```vue
<script setup lang="ts">
import { useI18n } from '@ubean/core';

const { t, d, n, c } = useI18n();

console.log(t('hello'));
console.log(t('items', { count: 3 }));
console.log(d(new Date()));
console.log(n(1234.56));
console.log(c(42.99, 'USD'));
</script>
```

## Resources

- **Documentation**: `/docs/`
- **CLI Help**: `ubean --help`
- **DevTools**: `ubean devtools`

## Version History

- **v0.0.1**: Initial release
  - Vite middleware mode dev server
  - Module system with topological resolution
  - SSR with Vue
  - i18n with pluralization and Intl formatting
  - DevTools with AI assistant
  - Platform presets (Standard, Node, Cloudflare)
