---
title: Quickstart
description: Get a ubean project running in minutes.
---

# Quick Start

Get started with ubean in minutes.

## Prerequisites

- Node.js >= 22.0.0
- pnpm `11.24.0` (required — ubean uses pnpm catalog and workspace features)

## Create a Project

### Interactive Mode

```bash
pnpm create ubean@latest
```

Follow the prompts to configure your project.

### Non-Interactive Mode

```bash
pnpm create ubean@latest my-app --template starter --preset node -y
```

## Project Structure

```
my-app/
├── src/
│   ├── routes/           # API routes (void-style named exports)
│   │   └── api/          # /api/* endpoints
│   ├── pages/            # Page components (.vue, .md, .reuse.ts)
│   ├── layouts/          # Layouts (xx.vue or xx/index.vue)
│   ├── middleware/       # Middleware (numeric prefix ordering)
│   ├── components/       # Auto-imported Vue components
│   ├── composables/      # Auto-imported composables
│   ├── locales/          # i18n messages (en.json, zh.json…)
│   ├── crons/            # Scheduled tasks (defineScheduled)
│   ├── queues/           # Queue workers (defineQueue)
│   ├── plugins/          # Runtime plugins
│   ├── request/          # Typed internal fetch client (unify template)
│   ├── server.ts         # Server hooks (defineServer; unify template)
│   └── app.ts            # Vue app config (defineApp; optionally app.server.ts / app.client.ts)
├── public/               # Static assets
├── .ubean/               # Auto-generated types
├── ubean.config.ts       # Framework config (defineConfig)
└── package.json
```

> These are optional convention directories: middleware/, locales/, crons/, queues/, plugins/ are only needed when the corresponding capability is used; the unify template generates locales/ and middleware/.

## Minimal Example

The scaffolded project ships with these core files — you can also wire them by hand:

```bash
# vite.config.ts
import { defineConfig } from 'vite-plus';
import { ubeanPlugin } from 'ubean/vite';

export default defineConfig({
  plugins: [ubeanPlugin()]
});
```

```bash
# src/server.ts
import { defineServer } from 'ubean/server';

export default defineServer({});
```

```typescript
// src/routes/api/hello.ts
import { defineHandler } from 'ubean/server';

export const GET = defineHandler(() => ({ hello: 'ubean' }));
```

```vue
<!-- src/pages/index.vue -->
<script setup lang="ts">
import { ref } from 'vue';

const count = ref(0);
</script>

<template>
  <button @click="count++">Clicked {{ count }} times</button>
  <Link to="/api/hello">Call the API</Link>
</template>
```

## Development

Start the development server (Vite middleware mode):

```bash
cd my-app
pnpm install
pnpm dev
```

Visit `http://localhost:9527` to see your application.

## Building for Production

```bash
pnpm build
```

The build output will be in the `dist` directory (`dist/public/` for client, `dist/server/` for server — see [App Modes](app-modes.md) for mode-specific output).

## Preview Production Build

```bash
pnpm preview
```

## Available Scripts

```json
{
  "scripts": {
    "dev": "ubean dev",
    "build": "ubean build",
    "preview": "ubean preview",
    "typecheck": "vue-tsc --noEmit"
  }
}
```

### Using the plain Vite commands

The dev / build / preview lifecycles are owned by the Vite plugin (ADR-0012), so the **plain Vite commands are equivalent** as long as the project registers `ubeanPlugin()` (from `ubean/vite`):

```bash
vite dev       # ≡ ubean dev
vite build     # ≡ ubean build (including prerendered HTML)
vite preview   # ≡ ubean preview (fullstack / backend go through the built production handler)
```

Two differences: `vite build` ignores `--outDir` (it always writes `config.build.outputDir`), and platform-specific wiring (e.g. miniflare preview of cloudflare artifacts) only exists on the `ubean preview` side. Both paths produce item-for-item identical output, so either works in CI.

`ubeanPlugin()` is async (the config is loaded inside the factory), but **the call site needs no `await`** — Vite's `PluginOption` is `Thenable<…>`, so a promise in the plugins array is awaited before any hook runs. Top-level await in `ubean.config.ts` therefore works on both paths, with no extra config loading in `vite.config.ts`:

```ts
// vite.config.ts — shared by the plain Vite commands and the ubean CLI
import { defineConfig } from 'vite-plus';
import { ubeanPlugin } from 'ubean/vite';

export default defineConfig({
  plugins: [ubeanPlugin()]
});
```

Only reach for `await ensureUbeanConfig()` when *you* need the config earlier (a self-managed Vite server, or reading config fields in `vite.config.ts` to pass to another plugin) — it is cache-first, so it never clobbers the CLI's in-place config mutations (`--mode` / `--ssr` / `--verbose`, etc.).

## Next Steps

- [Application Modes](app-modes.md) — fullstack / spa / ssg / backend
- [Route Generation Modes](routing-modes.md) — virtual / file / both
- [Pages and Routing](pages-routing/overview.md)
- [Data Loaders](pages-routing/loaders.md)
- [Actions](pages-routing/actions.md)
- [Internationalization](i18n.md)
- [Islands Architecture](islands.md)
