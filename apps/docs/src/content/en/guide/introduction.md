---
title: Introduction
description: ubean is a full-stack Vue meta-framework built on Vite, Hono and Vue.
---

# Introduction

**ubean** is a full-stack Vue meta-framework that combines Vite's developer experience, Hono's portable server runtime, and Vue's SSR capabilities into a single cohesive platform.

## What is ubean?

ubean (pronounced "you-bean") is built on Vite, Hono, and Vue 3, fusing void's Inertia-style SSR page routing with Nitro's cross-platform deployment capabilities. It is designed to give Vue developers a batteries-included framework with first-class TypeScript support, file-based routing, and a modular extension system.

## Key Features

- **Full-stack SSR** — Vue SSR with Inertia-style page routing, islands architecture, and native view transitions.
- **File-based Routing** — Typed API routes (`defineHandler`) and page routes (`definePage` macro) with auto-generated type-safe route helpers.
- **Islands Architecture** — Partial hydration via the `v-client.*` directive (`v-client.load|idle|visible|media|only`), auto-registered and auto-hydrated.
- **Multi-platform Deploy** — Presets for Node, Cloudflare, Vercel, Netlify, Bun, and Deno with a capability matrix.
- **DevTools** — An iframe-based inspector panel with Pages, API, Middleware, Cron, Env, and an AI assistant.
- **Built-in i18n** — Zero-dependency internationalization with four routing strategies and SSR hydration.
- **Markdown Pages** — First-class `.md` page support with frontmatter, shiki code highlighting, and per-page SEO.
- **SSG / Prerender** — Static site generation for SEO-critical and read-mostly pages.

## Architecture at a Glance

```
┌─────────────────────────────────────────────────┐
│                   ubean app                     │
│  src/pages/    src/layouts/   src/components/   │
│  src/routes/   src/middleware/  src/crons/      │
└───────────────────┬─────────────────────────────┘
                    │
         ┌──────────┴──────────┐
         ▼                     ▼
   Vite dev server        Hono server
   (middleware mode)      (portable runtime)
         │                     │
         └──────────┬──────────┘
                    ▼
            Platform presets
   (node / cloudflare / vercel / …)
```

## Extension Packages

ubean ships with optional extension packages under the `@ubean/` scope:

| Package | Purpose |
| --- | --- |
| `@ubean/auth` | Authentication (better-auth integration with email/password fallback) |
| `@ubean/icon` | Local SVG icon collections with Iconify API fallback |
| `@ubean/pwa` | Progressive Web App (manifest + service worker) |
| `@ubean/image` | Image optimization and transformation |
| `@ubean/content` | Content collections and Markdown processing |
| `@ubean/fonts` | Font optimization and subsetting |
| `@ubean/electron` | Electron desktop app integration |
| `@ubean/ui` | SoybeanUI integration (component resolver + styles) |
| `@ubean/pinia` | Pinia state management with SSR hydration helpers |

## Next Steps

- [Quick Start](/guide/quickstart) — Create your first ubean project.
- [App Modes](/guide/app-modes) — Understand SSG, SSR, and SPA modes.
- [Routing Modes](/guide/routing-modes) — File-based routing in depth.
