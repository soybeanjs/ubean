# @ubean/devtools

**English | [中文](./README.zh-CN.md)**

Dev-time visual panel for ubean — routes, pages, API, config, database, terminal and AI, hosted on a devframe hub.

```ts
import { createUbeanDevframe, ubeanDevtoolsPlugin } from '@ubean/devtools';
```

## Table of Contents

- [@ubean/devtools](#ubeandevtools)
  - [Package Positioning](#package-positioning)
  - [Install](#install)
  - [Quick Start](#quick-start)
  - [Devframe Integration](#devframe-integration)
  - [RPC Layer](#rpc-layer)
  - [Custom Tabs](#custom-tabs)
  - [File Operations](#file-operations)
  - [Type Safety](#type-safety)
  - [Architecture Notes](#architecture-notes)

## Package Positioning

| Layer                     | Responsibility                                                                |
| ------------------------- | ----------------------------------------------------------------------------- |
| `@ubean/devtools` (node)  | The ubean devframe definition, the Vite plugin, RPC function aggregation      |
| `@ubean/devtools` (rpc)   | Server-side CRUD / terminal / AI servers exposed over the hub's RPC transport |
| `@ubean/devtools` (panel) | The prebuilt iframe SPA served by the hub as the devframe's client assets     |

**Included:**

- `ubeanDevtoolsPlugin` / `createUbeanDevframe` — the plugin you add to the dev pipeline and the `DevframeDefinition` it produces.
- `createAllRpcFunctions` — aggregates every DevTools RPC method (info, env, CRUD, playground, terminal, AI).
- `createCrudServer`, `createAiServer`, `createTerminalServer`, `createDevToolsHooks` — the individual servers, usable on their own.
- `buildDevToolsInfo` / `emptyDevToolsInfo` / `maskSensitiveEnv` — the snapshot pushed to the panel.
- `defineDevToolsTab` / `getCustomTabs` / `clearCustomTabs` — the custom tab registry.
- The namespace constants `UBEAN_RPC_NAMESPACE`, `UBEAN_INFO_STATE_KEY`, `UBEAN_AI_STREAM_STATE_KEY`, `UBEAN_ANCHOR_DOCK`.

**NOT included** (deliberately):

- No dependency on the aggregate `ubean` package. `@ubean/devtools` declares **no peer on `ubean`** — that would create a cycle with `@ubean/cli`. All the data it needs (cwd, app fetcher, scan result, config meta) is injected through `UbeanDevtoolsPluginOptions`.
- No RPC transport of its own. WebSocket transport, the dock shell, frame navigation and authentication come from the devframe hub (`@devframes/hub`).
- No production code. DevTools is dev-time only — production builds emit no DevTools code and pay no runtime overhead.
- No hard dependency in the aggregate package. It is opt-in: install it explicitly.
- No hook registration entry point yet. `createDevToolsHooks()` builds the registry and is currently called internally by the plugin; config-level registration is not exposed.

**Runtime dependency whitelist (main entry):** `hookable`, `pathe`.

**Optional peers:** `hono` (`^4.0.0`) and `vue` (`^3.0.0`), both marked optional. `ai` / `@ai-sdk/openai-compatible` are optional dependencies used only by the AI view — without them the AI view is unavailable and every other view keeps working.

## Install

```bash
# opt-in: not part of the aggregate ubean dependency graph
pnpm add -D @ubean/devtools

# peers, if you use the parts that need them
pnpm add hono       # hosting the RPC servers on a Hono app
pnpm add vue        # the panel client
```

## Quick Start

**1. Enable DevTools**

```ts
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  devtools: {
    enabled: true,
    route: '/_devtools',
    ai: { enabled: false }
  }
});
```

**2. Open the panel**

Open the URL printed in the dev server banner — by default `/_devtools`, which 302-redirects to the devframe hub shell. The panel renders as an iframe in the hub's dock sidebar; no floating button and no client script are injected into your app pages.

The CLI prints the same information:

```bash
ubean devtools info                # how to reach it, available features, config
ubean devtools path --port 9527    # print the URL path
```

Built-in views: Overview, Pages, API, Middleware, Crons, Config, Env, API Docs, Database, Terminal and AI.

**3. Register a custom tab**

```ts
import { defineDevToolsTab } from '@ubean/devtools';

defineDevToolsTab({
  id: 'my-panel',
  label: 'My Panel',
  icon: 'lucide:puzzle',
  src: '/my-panel/index.html',
  sandbox: ['allow-scripts', 'allow-same-origin']
});
```

## Devframe Integration

`@ubean/devtools` is a devframe, not a standalone server. `createUbeanDevframe(options)` returns a `DevframeDefinition` describing the panel; the host (the devframe hub) owns the shell, the dock sidebar, the RPC transport and authentication.

| Option            | Purpose                                                          |
| ----------------- | ---------------------------------------------------------------- |
| `getCwd`          | Project root — required.                                         |
| `getApp`          | The running app's `fetch`, so the panel can invoke your routes.  |
| `getScanResult`   | Current scan result (routes, pages, middleware, layouts, crons). |
| `getConfigMeta`   | Resolved config metadata (preset, dirs, OpenAPI settings).       |
| `getCustomTabs`   | Custom tabs to surface in the panel.                             |
| `scaffoldOps`     | File operations used by the create/update/delete flows.          |
| `ai`              | `{ apiKey, apiBase, model }` for the AI view.                    |
| `triggerRescan`   | Ask the dev runner to rescan the project.                        |
| `registerRefresh` | Receive a callback the panel can call to refresh its data.       |
| `basePath`        | Panel base path, default `/_devtools/`.                          |

Reserved route namespaces:

- `/__devframes/**` — the hub namespace: shell, `__connection.json`, `__ws` WebSocket, and each devframe's artifacts under `/__devframes/ubean/`.
- `/_devtools` — the user-visible entry; 302-redirects to the hub shell.
- `/__devtools*` — kept only for projects still on `@vitejs/devtools`.

Framework HTML pages (`/_devtools`, `/_scalar`, everything under `/__devframes/**`) are skipped by the app's HTML transform. Without that skip the app client entry would be injected into a page with no `#app`, and the hub shell — which ships its own `embedded.js` — would boot twice.

## RPC Layer

The transport belongs to the hub. `createAllRpcFunctions` aggregates the methods ubean registers under the `ubean` scope; wire names are `ubean:<bare-name>`.

| RPC                       | Kind     | Description                                                      |
| ------------------------- | -------- | ---------------------------------------------------------------- |
| `ubean:get-info`          | query    | The `DevToolsInfo` snapshot (routes, pages, config, counts).     |
| `ubean:get-env`           | query    | Environment variables, sensitive keys masked.                    |
| `ubean:crud-read`         | query    | Read a page / API / layout / middleware / reuse / cron resource. |
| `ubean:crud-create`       | mutation | Create a scaffolded resource.                                    |
| `ubean:crud-update`       | mutation | Update a resource.                                               |
| `ubean:crud-delete`       | mutation | Delete a resource (backup kept).                                 |
| `ubean:crud-restore`      | mutation | Restore a resource from backup.                                  |
| `ubean:playground-invoke` | mutation | Invoke an API route from the panel.                              |

Client-side, connect to the hub and call through the scope:

```ts
import { connectDevframe } from '@devframes/hub/client';

const client = await connectDevframe();
const result = await client.call('ubean:crud-read', { type: 'page', path: 'src/pages/index.vue' });
```

Volatile data (for example the info snapshot or the AI stream) is published through shared state instead of being polled:

```ts
const info = client.sharedState.get(UBEAN_INFO_STATE_KEY);
```

`UBEAN_RPC_NAMESPACE` is `'ubean'`, `UBEAN_INFO_STATE_KEY` is `'ubean:info'`, and `UBEAN_AI_STREAM_STATE_KEY` is `'ubean:ai:stream'`.

`CrudResult` reports `{ success, created?, deleted?, restored?, updated?, skipped?, errors? }` so the panel can show exactly what changed.

## Custom Tabs

`DevToolsTabDefinition` is `{ id, label, icon?, src, sandbox? }` — `src` points at the tab's HTML entry and `sandbox` maps to the iframe sandbox attributes.

| Export                   | Description                                                  |
| ------------------------ | ------------------------------------------------------------ |
| `defineDevToolsTab(tab)` | Register (or replace by `id`) a custom tab; returns the tab. |
| `getCustomTabs()`        | Snapshot of the registered tabs.                             |
| `clearCustomTabs()`      | Empty the registry.                                          |

The registry is a process singleton stored on `globalThis`. In dev the same process often holds two copies of this package (the CLI imports it dynamically, your `vite.config.ts` imports it statically), so a module-level array would silently show a tab as "registered but never visible".

## File Operations

Everything that writes to disk goes through the same safety policies:

1. **AST-first** — structural edits rather than text splicing.
2. **Backup before change** — the previous file is copied to `.ubean/backup/`.
3. **Transactional writes** — write a temporary file, then rename.
4. **Path constraints** — only the project root and an allowlist.
5. **Least privilege for AI** — read-only by default; writes require a diff and explicit confirmation.
6. **Operation confirmation** — deletes and bulk operations need a second confirmation.
7. **Git detection** — DevTools advises committing first; it never auto-commits.

`createDevToolsHooks()` provides six lifecycle hooks — `beforeCreate`, `afterCreate`, `beforeUpdate`, `afterUpdate`, `beforeDelete`, `afterDelete` — each receiving a `CrudHookContext` with `{ type, path?, key?, content?, value? }`.

## Type Safety

- `UbeanDevtoolsPluginOptions` is a structural contract, which is what lets this package avoid a static dependency on `ubean` — the dev runner injects the data.
- `DevToolsInfo` types the snapshot shared with the panel, including the optional `routes`, `pagesList`, `middlewaresList`, `layoutsList`, `cronsList`, `customTabs`, `openAPI`, `database` and `ai` sections.
- `CrudResourceType` (`'page' | 'api' | 'layout' | 'middleware' | 'reuse' | 'cron' | 'plugin'`) and `DevToolsScaffoldType` keep resource names closed unions.
- `RpcRequest` / `RpcResponse<T>` and `RpcHandler` describe the call shape crossing the hub boundary.
- The package augments the hub client's types, so `client.call(...)` and `client.sharedState.get(...)` are typed on both server and client.

## Architecture Notes

- **Devframe, not a server.** `@ubean/devtools` contributes a `DevframeDefinition`; the hub owns the shell, dock and transport. The panel is an iframe, not an injected script.
- **No `ubean` peer.** Data arrives through injected getters, which keeps the dependency direction one-way and avoids a cycle with `@ubean/cli`.
- **Opt-in by construction.** The aggregate package does not depend on DevTools; production builds contain none of it.
- **The panel declares its own views.** The client posts a view manifest to the hub shell over frame navigation, and the shell composes the dock buttons — the server hardcodes no view list.
- **`globalThis` registries where dev holds two copies.** Custom tabs use a process singleton for the same reason the islands server-component registry does.
- **Backups are part of the contract.** Every mutation is reversible: delete writes a backup, restore reads it back.
- **AI drives RPC, not files.** The assistant calls the same RPC methods the panel uses, so the file-safety policies apply uniformly.
