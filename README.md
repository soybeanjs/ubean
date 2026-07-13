# ubean

[中文文档](README.zh_CN.md)

A Vue-first full-stack meta-framework.

Built on Vite-Plus, ubean aims to unite Vue SSR pages, Hono API routes, type-safe clients, and portable deployment presets into a consistent development experience.

> This repository is currently in the design and project-skeleton stage. It has not yet published a framework package suitable for production use. This document describes confirmed direction and the development commands available today. See the [documentation index](docs/README.md) for the implementation plan.

## Goals

- Vue 3-specific SSR page routing and application entry customization.
- Hono-based file-system API routes with named HTTP method exports.
- OpenAPI and type-safe clients driven by validation schemas and route metadata.
- An `ofetch` client across runtimes, with an XHR adapter for browser upload progress.
- A Node.js-first deployment experience that expands to other platforms through a capability matrix.
- Strict TypeScript, explicit side-effect boundaries, and continuous contract testing.

## Status

The formal v0.1 target is Node.js (`node-server`). Cloudflare Workers will be experimental only after completing its capability matrix and deployment smoke tests. Bun, Deno, Vercel, Netlify, and other platforms are outside the v0.1 support commitment.

Planned capabilities include:

- `routes/` API file routing with named `GET`, `POST`, and `PATCH` exports.
- `pages/` Vue SSR pages, layouts, loaders/actions, and typed navigation.
- `defineValidator`, `defineHandlerMeta`, OpenAPI 3.1, and generated `paths` types.
- An `ofetch` typed client, flat client, and the browser-only `ubean/client-xhr` upload-progress adapter.
- Future optional features such as route rules, prerendering, storage, databases, queues, WebSockets, and DevTools.

Most of these capabilities have not been implemented. Do not treat them as available APIs.

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

The core implementation follows these boundaries:

- Pure functions handle configuration merging, file scanning, route parsing, code generation, and type inference.
- I/O, Hono, Vite, Hookable, file-system access, and network access live behind explicit adapter/effect boundaries.
- The public HTTP client uses `ofetch` by default. A browser request switches to `XMLHttpRequest.upload` only when it provides `onUploadProgress`.
- `internalFetch` dispatches framework handlers directly without making a network request and does not support upload progress.
- Presets declare their capabilities. Unsupported features must produce build-time diagnostics rather than silently degrade.

## Planning and Contributions

- See the [documentation index](docs/README.md) for the complete architecture, directory structure, public API drafts, test strategy, and task tracking.
- Each feature should include its unit tests, a real fixture, and the applicable `dev`, `build`, `preview`, or browser end-to-end verification.
- Changes to public APIs, preset capabilities, or generated types must update the plan, tests, and migration guidance together.

## License

[MIT License](LICENSE)
