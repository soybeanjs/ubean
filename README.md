<p align="center">
  <img src="https://r2.soybeanjs.tech/soybeanjs/logo-ubean.png" alt="ubean logo" width="120" />
</p>

<h1 align="center">ubean</h1>

<p align="center">
  <a href="README.zh_CN.md">中文文档</a>
</p>

A Vue-first full-stack meta-framework.

Built on Vite-Plus, ubean unites Vue SSR pages, Hono API routes, type-safe route metadata, and portable deployment presets into a consistent development experience.

> ubean is under active development. Core runtime, file-system routing, Vue SSR, Hono API routes, i18n, caching, database/storage layers, queues, cron, WebSocket/SSE, OpenAPI/Scalar, DevTools, and the `@ubean/auth`/`@ubean/icon`/`@ubean/pwa`/`@ubean/image`/`@ubean/content`/`@ubean/fonts`/`@ubean/electron` extension packages are implemented and tested. See the [documentation index](docs/README.md) for architecture decisions and the [skills/ubean/docs](skills/ubean/docs) for usage guides and API references.

## Goals

- Vue 3-specific SSR page routing and application entry customization.
- Hono-based file-system API routes with named HTTP method exports.
- OpenAPI 3.1 and type-safe route metadata driven by `hono-openapi` validation schemas.
- Browser HTTP requests via [`@soybeanjs/fetch`](https://www.npmjs.com/package/@soybeanjs/fetch); in-process handler dispatch via `internalFetch` (no network round-trip).
- A Node.js-first deployment experience that expands to other platforms through a capability matrix.
- Strict TypeScript, explicit side-effect boundaries, and continuous contract testing.

## Status

The v0.1 target platforms are Node.js (`node-server`) and Cloudflare Workers. Bun, Deno, Vercel, Netlify, and other platforms are outside the v0.1 support commitment.

Implemented capabilities include:

- `routes/` API file routing with named `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `HEAD` exports wrapped by `defineHandler`.
- `pages/` Vue SSR pages, layouts, route groups, reuse routes, loaders/actions, and typed navigation.
- `defineHandlerMeta` for route metadata (`requiresAuth`, `cache`, `rateLimit`), `validator`/`describeRoute`/`resolver` from `hono-openapi` for request validation and OpenAPI 3.1 generation, and generated `paths` types at `.ubean/routes.d.ts`.
- `defineApp` options-based app customization (including `router.setup` for global navigation guards on both client and SSR), `definePage` macro, `defineMiddleware`, `defineLocale`, `defineEnv`, `defineScheduled` (cron), `defineQueue`.
- Built-in database layer (`defineDatabase`/`useDatabase`), storage (`useStorage`/`useKV`), cache (`useCacheStore`/`cachedEventHandler`), rate limiting, CORS, route rules (redirect/rewrite/headers/cache), and SSG prerendering.
- WebSocket (`defineWebSocket`), SSE streaming, and `internalFetch` (dispatches framework handlers in-process without a network request).
- DevTools with RPC, AI assistant, API playground, and CRUD scaffolding.
- Extension packages: `@ubean/auth` (Better Auth with fallback), `@ubean/icon` (Iconify integration), `@ubean/pwa`, `@ubean/image`, `@ubean/content`, `@ubean/fonts`, `@ubean/electron` (desktop apps via vite-plugin-electron, with default main/preload entries and auto SSR disable).

## Development

Requirements: Node.js and pnpm `11.11.0`.

```bash
pnpm install
pnpm typecheck
pnpm lint
```

Common commands:

| Command          | Description                                           |
| ---------------- | ----------------------------------------------------- |
| `pnpm typecheck` | Type-check the project with Vue TypeScript.           |
| `pnpm lint`      | Run Vite-Plus/OXC and Vue ESLint auto-fixes.          |
| `pnpm upkg`      | Check dependency updates.                             |
| `pnpm commit`    | Create a commit with the project commit-message tool. |

## Architecture Direction

ubean is a **monorepo** of 37 packages. The public package `ubean` is an **aggregator** that re-exports all `@ubean/*` subpackages — users install one package and get the full API surface. Subpackages are split by responsibility (routing, build, runtime, config, etc.) and can also be consumed individually for advanced use cases.

The core implementation follows these boundaries:

- Pure functions handle configuration merging, file scanning, route parsing, code generation, and type inference.
- I/O, Hono, Vite, Hookable, file-system access, and network access live behind explicit adapter/effect boundaries.
- ubean does not bundle a browser HTTP client. For browser requests, use [`@soybeanjs/fetch`](https://www.npmjs.com/package/@soybeanjs/fetch) (`createRequest` / `toFlatRequest` / `createTypedClient`); for typed clients, consume the generated `.ubean/routes.d.ts` paths types.
- `internalFetch` dispatches framework handlers in-process without a network request and does not support upload progress.
- Presets declare their capabilities. Unsupported features must produce build-time diagnostics rather than silently degrade.

### Package Structure

```
packages/
├── ubean/          # Main package (npm: "ubean") — aggregator, re-exports all @ubean/*
├── types/          # @ubean/types — shared types
├── routing/        # @ubean/routing — route scanner + rou3 router
├── build/          # @ubean/build — build-time core (virtual modules + Vite plugins)
├── runtime/        # @ubean/runtime — Vue client runtime
├── server/         # @ubean/server — cache/db/queue/cron/ws/sse
├── ...             # 31 more subpackages
└── electron/       # @ubean/electron — desktop apps (vite-plugin-electron wrapper)
```

See [docs/subpackage-splitting.md](docs/subpackage-splitting.md) for the original package-splitting design (now implemented) and [AGENTS.md](AGENTS.md) for the complete, current package list.

## Planning and Contributions

- See the [documentation index](docs/README.md) for the architecture reference, historical design records, and pending proposals.
- Usage guides and API references live in [skills/ubean/docs](skills/ubean/docs).
- Each feature should include its unit tests, a real fixture, and the applicable `dev`, `build`, `preview`, or browser end-to-end verification.
- Changes to public APIs, preset capabilities, or generated types must update the plan, tests, and migration guidance together.

## License

[MIT License](LICENSE)
