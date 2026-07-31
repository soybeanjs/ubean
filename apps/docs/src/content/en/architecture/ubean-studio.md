---
title: ubean-studio
---

# ubean-studio

> This document outlines the Electron-based desktop application **ubean-studio** (package name `@ubean/studio`): ubean's official desktop workbench.
> Its capabilities cover everything in `@ubean/devtools`, visual project command management, a UI materials marketplace (based on `@soybeanjs/ui`), and commercial systems (blog, commerce, and other solutions) — all centered around an **AI-driven core**.
>
> Status legend: ⬜ Not started | 🔄 In progress | ✅ Completed | ⏸️ Deferred
>
> Current overall status: **Planning phase (all tasks ⬜)**. Document version: v0.3 (2026-07-26, introducing `@ubean/electron` integration: studio enables Electron builds via `electron: true` in `ubean.config.ts`, with default main/preload entries and automatic SSR disabling).

---

## 0. Repository Strategy and AI Foundation (v0.2 Major Adjustments)

This section documents two foundational decisions from v0.2 that affect all subsequent architecture and task planning.

### 0.1 Repository Strategy: Standalone Private Repository

**Decision: ubean-studio does not go into the main monorepo. A separate private repository `ubeanjs/ubean-studio` is created.**

**Background**: The main repository `ubeanjs/ubean` will be fully open-sourced (MIT). studio involves commercial systems, materials marketplace, AI provider integrations, and other non-open-source content that cannot be mixed with open-source code.

| Approach | Trade-off | Conclusion |
| --- | --- | --- |
| **A. Standalone private repository (adopted)** | Main repository stays purely open-source with no leakage risk; studio consumes `ubean` and `@ubean/devtools` as npm dependencies; local dev uses `pnpm link` or local tarballs | ✅ Adopted |
| B. Main monorepo + gitignore | Dev-time `workspace:*` works; but gitignore + overlay can easily leak closed-source code into the open-source repo | ❌ Risk too high |
| C. Main monorepo + git submodule | Submodule experience is poor (clone/CI/PR flow complexity); still needs dual repositories | ❌ High maintenance cost |
| D. Main monorepo + git filter branch exclusion | Filter studio directory before release; fragile flow, error-prone | ❌ Unreliable |

**studio repository structure** (itself a standalone monorepo):

```
ubeanjs/ubean-studio (private)
├── packages/
│   ├── studio/              # @ubean/studio — Electron app itself
│   ├── studio-materials/    # @ubean/studio-materials — built-in materials library
│   └── studio-solutions/    # Commercial system templates (blog-pro / commerce / ...)
├── extensions/              # pi-agent extensions (see §0.2)
├── pnpm-workspace.yaml
└── package.json
```

**Dependency relationships with the main repository**:

| studio needs | Source | Dev coupling method |
| --- | --- | --- |
| `ubean` framework runtime and types | npm `ubean` | `pnpm link --global` or local `npm pack` |
| `@ubean/electron` Electron build | npm `@ubean/electron` (ubean built-in module, based on vite-plugin-electron) | Same; studio enables via `electron: true` in `ubean.config.ts`, default entries `electron/main.ts`, `electron/preload.ts` |
| `@ubean/devtools` client | npm `@ubean/devtools` (already included in `ubean` deps) | Same; loaded via `/<devtools-path>/client` at dev server runtime |
| CLI Shared Layer (scaffold fs-ops) | **Requires new `ubean/scaffold` subpath export in the main package** (see ADR-03 + ST0-08) | Same |
| `skills/ubean` knowledge package | Main repository's `skills/ubean` directory | studio pulls at build time (git subtree or npm package) |
| `@soybeanjs/ui` / UnoCSS preset | npm | Direct install |

**Minor changes needed in the main repository (open-source side)**:

1. Add `ubean/scaffold` subpath export, re-exporting `@ubean/cli/shared`'s `fs-ops` and `templates` (for studio and third-party tools to reuse scaffold capabilities).
2. `@ubean/devtools` client supports route deep links (URL hash/query for view positioning, see ST2-02) — this is already a devtools enhancement, not coupled with studio.

> These two changes proceed as independent PRs in the main repository; studio does not block the main repository's open-sourcing.

### 0.2 AI Foundation: Adopting pi-agent (earendil-works/pi)

**Decision: studio's AI capabilities no longer build a custom agent loop. Instead, it adopts the [`@earendil-works/pi-coding-agent`](https://github.com/earendil-works/pi) SDK mode as the foundation.**

**Background**: The original plan in §3.5 was to build a custom `AiGateway` based on the Vercel AI SDK (provider layer + tool registry + agent loop + context assembly + confirmation audit). This work is heavy, has a high maintenance burden, and ubean's core value lies in DevTools integration and ubean-specific tooling, not in generic agent infrastructure.

**pi-agent overview** (by Armin Ronacher / mitsuhiko):

| Package | Capabilities | studio use |
| --- | --- | --- |
| `@earendil-works/pi-ai` | Unified multi-provider LLM API (OpenAI/Anthropic/Google/…) | Replaces custom provider layer |
| `@earendil-works/pi-agent-core` | agent runtime: tool calling, state management, event stream | Replaces custom `AiGateway` + agent loop |
| `@earendil-works/pi-coding-agent` | Complete coding agent, supports **SDK mode** for embedding in your own apps | Embeds in the Electron main process for out-of-the-box coding capabilities |
| `@earendil-works/pi-tui` | Terminal UI (studio doesn't use directly, renderer has its own Vue UI) | — |

**pi's extension mechanism matches studio's needs perfectly**:

- **Extensions** (TypeScript): All of studio's internal capabilities are registered as pi extensions — `ubean-project` / `ubean-scaffold` / `ubean-command` / `ubean-fs` / `ubean-devtools` (RPC passthrough) / `ubean-materials` / `ubean-solutions`.
- **Skills**: `skills/ubean` is injected as a pi skill package for context knowledge (pi natively supports skill retrieval injection, replacing the original plan's custom "context assembly" logic).
- **Event stream**: `agent.subscribe(event => ...)` native streaming events (`agent_start`/`turn_start`/`message_update`/`tool_call`/...), fed directly to the renderer's AI panel via IPC.
- **SDK mode**: pi-coding-agent explicitly supports "embedding in your own apps", with real SDK integration precedents like [openclaw/openclaw](https://github.com/openclaw/openclaw).

**What pi doesn't provide, studio builds itself**:

| Capability | pi status | studio approach |
| --- | --- | --- |
| Permission system | pi has no built-in permission restrictions, runs with launching user's permissions by default | studio builds `PermissionLayer`: write operation confirmation + command allowlist + path allowlist (inherits DevTools §4.12 security policy) |
| Secret storage | pi uses environment variables / config files | studio uses Electron `safeStorage` for encryption, injects into pi provider config |
| Audit logging | pi has none | studio intercepts in `PermissionLayer` layer and writes to `audit.log` |
| UI rendering | pi has TUI, but studio uses Vue | studio renderer consumes pi event stream, draws its own conversation UI |

**Benefits of adopting pi**:

1. Eliminates building custom provider abstraction, tool calling protocol, agent loop, context trimming, streaming distribution — these are pi's core maintenance areas.
2. pi is maintained by mitsuhiko, 5100+ commits, actively iterated — studio just follows upgrades for capability enhancements.
3. studio focuses on ubean-specific value: DevTools integration, materials/solutions marketplace, ubean scaffold tooling.
4. Extensions/Skills can be packaged as independent npm packages, potentially reusable in the pi ecosystem by the community in the future.

**Risks and mitigations**:

| Risk | Mitigation |
| --- | --- |
| pi version iteration breaking changes | Lock pi version in catalog; extension interface changes go through studio CI gates |
| pi has no permission system → risk of misuse | `PermissionLayer` intercepts before pi tool execution, all write operations require confirmation (§3.9 security model unchanged) |
| pi dependency size | pi is pure JS/TS with no native modules, impact on Electron bundle size is controllable; tree-shake on demand |
| pi coexists with Vercel AI SDK | DevTools' AI Assistant continues using Vercel AI SDK (existing implementation); studio's global AI uses pi — the two are independent, provider configs can be synced (ST3-11) |



---

## 1. Product Positioning

### 1.1 One-Sentence Positioning

**ubean-studio is the AI-driven desktop workbench for the ubean ecosystem**: it manages the full project lifecycle (create → develop → debug → build → pre-deploy checks), embeds complete DevTools, provides a materials and commercial systems marketplace, with all capabilities drivable by AI conversation.

### 1.2 Relationship with Existing Capabilities

| Existing capability | Form in ubean-studio |
| --- | --- |
| `ubean` CLI (dev/build/init/page/api/env/config/cron...) | **Command Center**: all commands form-based and visualized, reuses CLI Shared Layer to ensure consistent results |
| `@ubean/devtools` (13 views: Overview/Pages/ApiRoutes/ApiDocs/ApiPlayground/Config/EnvVars/Layouts/Middlewares/Crons/DrizzleStudio/Terminal/AiAssistant) | **DevTools module**: fully embedded as a top-level sidebar menu entry, zero rewrite |
| `skills/ubean` (AI Skill) | **AI knowledge source**: packaged as pi skill package, serves as context knowledge for the built-in AI assistant (pi native retrieval injection) |
| `@soybeanjs/ui` | **Materials marketplace foundation** + studio's own UI component library |
| `ubean init` templates (starter/minimal/blog) | Protocol basis for **commercial systems/solutions**, extended into a solution registry |

### 1.3 Design Principles

1. **AI-driven as core**: AI is not an attached tab but a global capability — every module has an AI entry point, and the global AI Agent can execute multi-step tasks across modules.
2. **Reuse over rewrite**: DevTools client is fully reused; scaffold operations reuse `packages/cli/src/shared/fs-ops.ts`; AI stack reuses pi-agent (agent loop / tool calling / multi-provider all handled by pi).
3. **GUI and CLI feature parity**: Follows the established principle in runtime.md §4.13 — studio is the third parity entry point (DevTools, CLI, Studio).
4. **Secure by default**: AI write operations require diff + confirmation; terminal command allowlist; file access allowlist (inherits DevTools security policy §4.12).
5. **Vue ecosystem consistency**: The renderer process uses Vue 3 + `@soybeanjs/ui` + UnoCSS, fully consistent with the devtools client tech stack.

---

## 2. Functional Architecture

### 2.1 Information Architecture (Sidebar Menu)

```
┌────────────────────────────────────────────────────────────────┐
│  ubean-studio                                                  │
│ ┌──────────┬───────────────────────────────────────────────────┤
│ │ Sidebar  │  Main workspace                                   │
│ │          │                                                   │
│ │ Dashboard│  ┌─────────────────────────────────────────────┐  │
│ │ Projects │  │              Current module content          │  │
│ │ Commands │  │                                             │  │
│ │ DevTools │  │  (When DevTools is embedded: devtools client │  │
│ │ Market   │  │   from project dev server; otherwise studio  │  │
│ │ Solutions│  │   native pages)                              │  │
│ │ Settings │  │                                             │  │
│ │          │  └─────────────────────────────────────────────┘  │
│ │ ──────── │  ┌─────────────────────────────────────────────┐  │
│ │ AI Asst. │  │  Global AI panel (expandable/collapsible,    │  │
│ │          │  │   right drawer or bottom)                    │  │
│ └──────────┴──┴─────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### 2.2 Module Feature List

| Module | Menu level | Features |
| --- | --- | --- |
| **Dashboard** | Top | Current project health status (dev server status/port/uptime), route and API counts, recent tasks, AI suggestions (e.g. outdated dependencies, type errors, missing env) |
| **Projects** | Top | Workspace project list, create (starter/minimal/blog + preset + pm), import, remove, favorite, batch operations |
| **Commands** | Top | dev/build/preview/prepare visualization (parameter forms, live logs, auto port detection, embedded preview); scaffold commands (page/api/layout/middleware/cron/plugin/env/config) as forms; npm scripts panel; multi-task concurrency and history |
| **DevTools** | Top (with 13 sub-tabs) | Fully embeds `@ubean/devtools`: Overview, Pages, API Routes, API Docs, API Playground, Config, Env Vars, Layouts, Middlewares, Crons, Drizzle Studio, Terminal, AI Assistant |
| **Materials Market** | Top | Component/block/page materials based on `@soybeanjs/ui`: categorized browsing, fuzzy search, live preview (iframe sandbox + props debugging), code viewing, one-click insert into current project, favorites; local built-in library + remote registry |
| **Solutions** | Top | Solutions marketplace: blog system, commerce system, CMS, SaaS skeleton and other complete starters; detail pages (feature list/tech stack/screenshots/required env); one-click install pipeline (generate → dependencies → env wizard → database migration → start); commercial placeholders (license/paid templates) |
| **AI Assistant** | Global (not a standalone page, persistent panel) | Conversation-driven everything: CRUD, command execution, materials insertion, solution installation, error diagnosis; Agent mode (plan → execute → confirm); context-aware (current project/current module/selected file) |
| **Settings** | Top | AI Provider (openai-compatible/anthropic/custom + key encrypted storage), theme (light/dark), workspace default directory, telemetry toggle, shortcuts, update channel |

---

## 3. Technical Architecture

### 3.1 Technology Selection Decisions

| Decision point | Choice | Rationale |
| --- | --- | --- |
| Desktop framework | **Electron + `@ubean/electron`** (based on vite-plugin-electron) | Heavy reliance on Node capabilities (child_process, node-pty, ts-morph AST, c12 config loading, direct reuse of ubean/devtools Node API); Tauri's Rust side cannot carry these dependencies at low cost. ubean's built-in `@ubean/electron` module: `electron: true` to enable, default main/preload entries (`electron/main.ts`, `electron/preload.ts`), auto-disables SSR, eliminating separate `electron-vite` toolchain |
| Renderer UI | Vue 3 + `@soybeanjs/ui` + UnoCSS (`@soybeanjs/unocss-shadcn` preset) | Consistent with devtools client, follows engineering spec §9.1 |
| Routing | vue-router (renderer SPA, studio doesn't use ubean runtime) | studio is a tool application, no SSR/API routes needed; ubean is studio's "managed object". studio reuses ubean's build toolchain (`@ubean/electron`, Vite plugins) but not its runtime (SSR/page routing/API routing) |
| Terminal | `node-pty` + `xterm.js` (devtools already uses xterm 6) | Reuse existing dependencies and experience |
| In-process API | `contextBridge` + typed RPC (custom lightweight wrapper, referencing devframe's RPC pattern) | Standard solution under contextIsolation security model |
| AI foundation | **[`@earendil-works/pi-coding-agent`](https://github.com/earendil-works/pi) SDK mode** + `pi-ai` (multi-provider) + `pi-agent-core` (agent runtime) | See §0.2: pi provides agent loop / tool calling / event stream / multi-provider abstraction, studio registers ubean-specific tools as Extensions; eliminates building custom agent infrastructure |
| Secret storage | Electron `safeStorage` (system keychain encryption) | API keys never stored in plaintext |
| Local data | JSON file storage (`app.getPath('userData')`) + `better-sqlite3` when needed (AI session history/materials cache index) | Avoid over-engineering; JSON is enough for first version |
| Packaging & distribution | `electron-builder` + `electron-updater` | Mature solution, supports mac/win/linux and auto-update |

### 3.2 Process Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ubean-studio (Electron)                       │
│                                                                     │
│  ┌──────────────────────────── Main Process ─────────────────────┐  │
│  │  WindowManager      │ Window lifecycle/single instance/deeplink│  │
│  │  WorkspaceStore     │ Workspace/project metadata persistence   │  │
│  │  ProcessManager     │ spawn/node-pty mgmt, multi-project tasks │  │
│  │  ProjectService     │ Project detection/scanning (read config) │  │
│  │  ScaffoldService    │ Reuse ubean CLI Shared Layer (fs-ops)    │  │
│  │  PiAgentHost        │ pi-coding-agent SDK + ubean extensions   │  │
│  │  PermissionLayer    │ Write confirmation + allowlist + audit   │  │
│  │  MaterialRegistry   │ Built-in materials + remote registry cache│ │
│  │  SolutionService    │ Commercial system fetch/install pipeline │  │
│  │  SecureStore        │ safeStorage key management               │  │
│  │  UpdateService      │ electron-updater                         │  │
│  └──────────────┬──────────────────────────────────────────────────┘  │
│                 │ contextBridge (typed StudioRPC API)                 │
│  ┌──────────────▼────────── Preload ──────────────────────────────┐  │
│  │  window.studio: projects/processes/scaffold/ai/materials/...   │  │
│  └──────────────┬──────────────────────────────────────────────────┘  │
│                 │                                                    │
│  ┌──────────────▼────────── Renderer (Vue 3 SPA) ─────────────────┐  │
│  │  Shell (sidebar + global AI panel + notification center)        │  │
│  │  Views: Dashboard/Projects/Commands/DevToolsHost/Market/       │  │
│  │         Solutions/Settings                                     │  │
│  │  DevToolsHost: <webview> loads project dev server's devtools SPA│ │
│  └────────────────────────────────────────────────────────────────┘  │
│                 │                                                    │
│  ┌──────────────▼────────── Managed ubean projects ───────────────┐  │
│  │  ubean dev (child process) ── DevTools RPC + /__ubean_devtools__/client│
│  └────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.3 DevTools Integration Strategy (Core Reuse Strategy)

**Decision: Embedded mode first, direct-connect mode as future enhancement.**

| Approach | Description | Trade-off |
| --- | --- | --- |
| **A. Embedded mode (preferred)** | studio starts/connects to project's `ubean dev` via `ProcessManager`, renderer loads `http://localhost:<port>/__ubean_devtools__/client` via `<webview>` | ✅ 100% reuse of existing 13 views and RPC, zero rewrite; ✅ devtools upgrades automatically benefit studio; ⚠️ depends on dev server running (studio handles one-click startup, which is already a command center capability) |
| B. Direct-connect mode | studio connects directly as RPC client to devtools server, UI rewritten natively in studio | ❌ Rewrites 13 views, double maintenance; listed as P3 long-term evaluation |

Implementation details:

- `<webview>` over iframe has independent process and `partition` isolation, suitable for loading local dev server content; enable `contextIsolation`, disable `nodeIntegration`.
- DevTools as a top-level menu hosts the complete SPA; sidebar sub-menu (13 tabs) deep-links to corresponding views via URL hash/query (requires devtools client to support route positioning, see task ST3-02).
- When dev server isn't running, show a guide page ("Start dev server" button → calls command center).
- Security: reuses devtools' session token / origin validation mechanism (§4.12 RPC communication layer); studio adds no extra privileges.

### 3.4 Command Execution and Process Management

- **ProcessManager**: Each task = `{ id, projectId, command, args, status, pid, startedAt, logBuffer }`; supports concurrency limit (default 4), log ring buffer (≤ 2MB per task), crash detection and restart strategy.
- **CLI visualization mapping**: All form operations generate calls identical to CLI, two paths:
  1. **Process commands** (dev/build/preview/prepare/typecheck/lint/test/db:*) → spawn package manager scripts (auto-detect pnpm/npm/yarn/bun).
  2. **Scaffold operations** (page/api/layout/middleware/cron/plugin/env/config CRUD) → main process directly calls ubean **CLI Shared Layer** (`packages/cli/src/shared/fs-ops.ts`, via `ubean/scaffold` subpath export) Node API, avoiding spawn overhead and getting structured results; shares the same implementation as DevTools RPC path, naturally ensuring three-way consistency (§4.13).
- **Embedded preview**: After dev server is ready (port detection + `/_health` polling), the main workspace can switch between "Preview / DevTools / Logs" views, preview uses `<webview>`.
- **Terminal**: Reuses devtools' Terminal capability; studio additionally provides project-level standalone terminal tabs (node-pty, cwd = project root).

### 3.5 AI Architecture (Based on pi-agent, v0.2 Revision)

studio no longer builds a custom agent loop. Instead, it embeds pi-coding-agent SDK mode in the main process, with ubean-specific capabilities registered as pi Extensions.

```
┌──────────────────────────────────────────────────────────────┐
│  Renderer: Global AI panel (conversation UI / plan confirm /  │
│             diff preview)                                     │
└──────────────┬───────────────────────────────────────────────┘
               │ IPC: pi event stream (agent_start/turn/...)
┌──────────────▼───────────────────────────────────────────────┐
│  Main: PiAgentHost                                            │
│  ├─ pi-ai: Multi-provider LLM API (OpenAI/Anthropic/Google/…) │
│  │   └─ Provider config injected by SecureStore (safeStorage) │
│  ├─ pi-agent-core: agent runtime (tool calling + state + stream)│
│  ├─ pi-coding-agent SDK: coding capabilities (read/write files,│
│  │   run commands, etc.)                                       │
│  ├─ ubean Extensions (TypeScript, registered as pi tools):    │
│  │   ubean-project    project.info / project.listRoutes       │
│  │   ubean-scaffold   scaffold.createPage / createApi / ...   │
│  │   ubean-command    command.run (via PermissionLayer allowlist)│
│  │   ubean-fs         fs.read / fs.glob (writes via confirm)  │
│  │   ubean-devtools   devtools.rpc.* (passthrough DevTools RPC)│
│  │   ubean-materials  market.search / market.insert           │
│  │   ubean-solutions  solutions.list / solutions.install      │
│  ├─ pi Skill: skills/ubean knowledge package (native retrieval)│
│  └─ PermissionLayer: write op intercept → confirm → audit log │
└──────────────────────────────────────────────────────────────┘
```

Key design:

- **pi is the foundation, extensions are capabilities**: All of studio's internal capabilities (including DevTools RPC) are registered as pi extensions/tools, AI and GUI share the same service layer — this is how "AI-driven as core" is implemented, without building a custom agent loop.
- **Context injection handled by pi Skill**: `skills/ubean` as a pi skill package, pi natively handles retrieval-based injection; current project summary (config/routes/env keys/error log tail) is dynamically provided by the `ubean-project` extension.
- **Permission layer independent of pi**: pi has no built-in permission system. studio inserts `PermissionLayer` before tool execution — file writes/deletions, command execution, materials insertion, solution installation all suspend, renderer shows structured diff/summary, user confirms before proceeding (reuses §4.12 "least privilege" principle).
- **Keys**: Stored only in main process `safeStorage`; decrypted and injected into pi provider config, renderer never touches keys; provider requests only go out from main process's pi-ai layer.
- **Event stream directly to UI**: `agent.subscribe(event => ...)` streaming events forwarded to renderer via contextBridge, renderer draws message list / tool call expansion / diff preview accordingly.
- **Relationship with DevTools AI Assistant**: DevTools' AI Assistant stays as-is (Vercel AI SDK, for CRUD within dev server context); studio's global AI uses pi (superset, can call DevTools RPC). Provider configs can be synced between the two (ST3-11), but runtimes are independent.

### 3.6 Materials Marketplace Protocol

A Material = a reusable unit based on `@soybeanjs/ui`, with a protocol referencing the shadcn registry approach:

```jsonc
// material.json
{
  "$schema": "https://ubean.dev/schemas/material.json",
  "name": "pricing-section",
  "type": "block",            // component | block | page
  "title": "Pricing Section",
  "description": "Three-column pricing table with monthly/yearly toggle",
  "tags": ["marketing", "pricing"],
  "dependencies": ["@soybeanjs/ui"],        // Runtime deps (auto-detected for install)
  "files": [
    { "path": "components/PricingSection.vue", "target": "src/components/PricingSection.vue" }
  ],
  "propsSchema": { /* JSON Schema for preview panel props debugging */ },
  "preview": { "width": 1280, "height": 720 },
  "screenshot": "pricing-section.png",
  "version": "1.0.0",
  "author": "ubean"
}
```

- **Built-in materials library**: `packages/studio-materials` distributed with studio, first batch covers: navbar, footer, Hero, feature grid, pricing table, FAQ, login/register forms, dashboard shell, data table page, settings page, etc. (all using `S*` components + UnoCSS, following shortcuts/safelist conventions).
- **Preview**: Independent hidden BrowserWindow/`<webview>` runs a minimal Vite preview host (built into studio, pre-installs `@soybeanjs/ui` + UnoCSS), generates a debugging panel based on material propsSchema.
- **Insert into project**: Copy files → detect target project dependencies and UnoCSS preset (prompt for one-click install/modify `uno.config.ts` if missing) → if target is a ubean project with auto-import enabled, no extra registration needed.
- **Remote registry**: HTTP static registry (index.json + material packages), main process cache + version verification; first version is read-only, publishing flow defined later.

### 3.7 Commercial Systems (Solutions)

A Solution = a complete runnable ubean application template:

```jsonc
// solution.json
{
  "name": "ubean-blog-pro",
  "title": "Blog System Pro",
  "category": "blog",          // blog | commerce | cms | saas | admin
  "description": "Complete blog with @ubean/content + @ubean/auth + SEO/sitemap",
  "template": { "type": "git", "url": "https://github.com/ubeanjs/solution-blog-pro", "ref": "v1.2.0" },
  "modules": ["@ubean/content", "@ubean/auth", "@ubean/icon"],
  "envSchema": { "DATABASE_URL": { "type": "string", "required": true } },
  "postInstall": ["db:migrate", "db:seed"],
  "pricing": { "type": "free" },   // free | paid (paid is commercial placeholder)
  "version": "1.2.0"
}
```

- **Installation pipeline**: degit pull → dependency install (detect pm) → **env wizard** (generates form from envSchema, writes `.env`) → postInstall commands (migration/seed) → register to workspace → one-click dev start.
- **First batch of commercial systems**:
  1. **Blog system**: `@ubean/content` collections + Markdown pages + `@ubean/auth` + SEO (useSeoMeta/sitemap/robots) + optional i18n.
  2. **Commerce system**: products/categories/cart/orders/inventory (ubean database + db0 connector), `@ubean/auth` account system, payment as adapter placeholder (Stripe/WeChat Pay interface abstraction, no real key flows built in).
  3. Future: CMS, SaaS multi-tenant skeleton, Admin backend (consumer of materials marketplace).
- **Commercialization**: `pricing.type: 'paid'` license verification and payment flow are placeholder designs, protocol reserved, implementation scheduled for ST6-05.

### 3.8 Data Persistence

| Data | Location | Description |
| --- | --- | --- |
| Workspace/project list | `userData/workspace.json` | Project paths, aliases, favorites, recent opens, port preferences |
| AI config | `userData/ai.json` + `safeStorage` | provider/model in plaintext, apiKey encrypted |
| AI sessions | `userData/sessions/*.json` (migrate to SQLite when large) | Grouped by project, can be cleared |
| Materials cache | `userData/materials-cache/` | Remote registry pull cache + index |
| Operation audit log | `userData/audit.log` | AI write operations and command execution records |
| Task history | `userData/tasks.json` | Command execution history (keeps recent N entries) |

### 3.9 Security Model

1. Renderer process: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; only accesses main process capabilities via typed APIs exposed by preload.
2. `<webview>`: independent `session partition`, disables nodeIntegration, only allows `http://localhost:*` and `http://127.0.0.1:*` navigation.
3. CSP: studio's own pages use `default-src 'self'`; devtools webview controlled by dev server itself.
4. File access: Main process service layer uniformly validates that paths must be within registered project directories (inherits §4.12 path constraints and backup strategy).
5. AI security: tool allowlist, write operation confirmation, command allowlist, all write operations logged to audit log; follows the same standard as roadmap risk item #17 (DevTools security boundary).
6. Commercial system/materials remote content: registry uses HTTPS + content hash verification; template postInstall commands shown and confirmed before execution.

---

## 4. Package Structure and Directory Design (v0.2 Revision: Standalone Repository)

studio is in a standalone private repository `ubeanjs/ubean-studio`, itself a monorepo (pnpm workspace). It is not placed in the main repository to avoid closed-source code mixing into the open-source main repo (see §0.1).

```
ubeanjs/ubean-studio (private)
├── packages/
│   ├── studio/                        # @ubean/studio (Electron app, private: true)
│   │   ├── ubean.config.ts            # electron: true enables @ubean/electron (default main/preload entries)
│   │   ├── electron-builder.yml
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── main/                  # Main process
│   │   │   │   ├── index.ts
│   │   │   │   ├── window.ts
│   │   │   │   ├── rpc/               # contextBridge service registration (typed)
│   │   │   │   ├── services/
│   │   │   │   │   ├── workspace.ts   # Workspace/projects
│   │   │   │   │   ├── process.ts     # ProcessManager
│   │   │   │   │   ├── scaffold.ts    # Bridge to ubean/scaffold (CLI Shared Layer)
│   │   │   │   │   ├── pi-host.ts     # PiAgentHost: pi-coding-agent SDK host
│   │   │   │   │   ├── permission.ts  # PermissionLayer: confirmation + audit
│   │   │   │   │   ├── materials.ts   # Materials registry/cache/insertion
│   │   │   │   │   ├── solutions.ts   # Commercial system install pipeline
│   │   │   │   │   ├── secure-store.ts# safeStorage
│   │   │   │   │   └── updater.ts
│   │   │   │   └── utils/
│   │   │   ├── preload/
│   │   │   │   ├── index.ts           # contextBridge exposes window.studio + pi event stream
│   │   │   │   └── index.d.ts         # Renderer types
│   │   │   └── renderer/              # Vue 3 SPA
│   │   │       ├── index.html
│   │   │       └── src/
│   │   │           ├── App.vue
│   │   │           ├── main.ts
│   │   │           ├── router/
│   │   │           ├── layouts/       # Shell (sidebar + AI panel)
│   │   │           ├── views/
│   │   │           │   ├── dashboard/
│   │   │           │   ├── projects/
│   │   │           │   ├── commands/  # Command center (with task logs/terminal)
│   │   │           │   ├── devtools/  # DevToolsHost (webview container)
│   │   │           │   ├── market/    # Materials marketplace
│   │   │           │   ├── solutions/ # Commercial systems
│   │   │           │   └── settings/
│   │   │           ├── components/
│   │   │           ├── composables/   # useStudio (preload API wrapper)
│   │   │           └── styles/
│   │   └── resources/                 # Icons etc.
│   │
│   └── studio-materials/              # @ubean/studio-materials (built-in materials library)
│       ├── package.json
│       ├── materials/
│       │   ├── blocks/                # Block materials (pricing/hero/footer/...)
│       │   ├── components/            # Component materials
│       │   └── pages/                 # Page materials
│       └── registry.json              # Built-in registry index
│
├── extensions/                        # pi-agent extensions (each an independent npm package)
│   ├── ubean-project/                 # project.info / listRoutes / ...
│   ├── ubean-scaffold/                # createPage / createApi / ...
│   ├── ubean-command/                 # command.run (allowlist)
│   ├── ubean-fs/                      # fs.read / glob / write (confirmed)
│   ├── ubean-devtools/                # devtools.rpc.* passthrough
│   ├── ubean-materials/               # market.search / insert
│   └── ubean-solutions/               # solutions.list / install
│
├── solutions/                         # Commercial system template sources
│   ├── blog-pro/
│   └── commerce/
│
├── pnpm-workspace.yaml
└── package.json
```

Dependency boundaries:

- `@ubean/studio` is `private`, not published to npm; artifacts distributed via electron-builder.
- studio consumes `ubean` (including `@ubean/devtools`) and `@ubean/electron` as npm dependencies; local dev uses `pnpm link --global` or local `npm pack` (see §0.1 dev coupling).
- Electron build handled by `@ubean/electron` (ubean built-in module, underlying vite-plugin-electron): `electron: true` in `ubean.config.ts` to enable, default entries `electron/main.ts`, `electron/preload.ts`, auto-disables SSR; custom entries can override `electron.main.entry` / `electron.preload.input`.
- Scaffold logic depends on the new `ubean/scaffold` subpath export in the main package (requires minor main package change, see ADR-03 + ST0-08).
- Main process depends on `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`, `node-pty`, (optional) `better-sqlite3`.
- Renderer depends on `@soybeanjs/ui`, `@soybeanjs/unocss-shadcn`, `xterm.js`.
- `node-pty` is a native module: electron-builder `asarUnpack` + `electron-rebuild` included in the build pipeline.
- pi extensions are pure TS, no native dependencies, can be packaged and published independently (community reuse in the future).

---

## 5. Milestones

| Milestone | Deliverable capability | Acceptance criteria |
| --- | --- | --- |
| **MS0 Skeleton** | Standalone repo init, `@ubean/electron` three-process skeleton (`ubean.config.ts` enabled), Shell layout, pi-agent SDK integration verification, packaged mac runnable app | `pnpm dev` starts; `pnpm build` produces installer; pi SDK can converse; lint/typecheck passes |
| **MS1 Project management + Command center** | Project CRUD, new project wizard, dev/build visualization, logs, embedded preview, scaffold forms | Full flow operable on examples/ubean-test; results consistent with CLI |
| **MS2 DevTools integration** | 13 tabs fully embedded, sub-menu deep links, not-running guide | All DevTools features usable (per docs/test.md section 13 checklist) |
| **MS3 AI core (pi-agent)** | pi provider config, ubean extensions, global AI panel, PermissionLayer, session management | AI can complete "create page + API + start dev" full chain; all write ops have confirmation and logging |
| **MS4 Materials marketplace** | Materials protocol, built-in library ≥15, preview, insert into ubean project | After material insertion, project `typecheck` passes, page renders correctly |
| **MS5 Commercial systems** | Solution protocol, blog system, commerce system, install pipeline | One-click install from marketplace to dev running success; env wizard and migration execute correctly |
| **MS6 Release** | Auto-update, error reporting (toggleable), CI packaging (mac notarized/win signed), docs | Three-platform installers produced by CI; upgrade flow verified |

---

## 6. Detailed Task List

> Numbering convention: `ST<phase>-<number>`. Priority: P0 highest. All tasks currently ⬜.

### MS0: Project Skeleton

| ID | Task | Status | Priority | Acceptance criteria |
| --- | --- | --- | --- | --- |
| ST0-01 | Initialize standalone private repo `ubeanjs/ubean-studio` (pnpm workspace + catalog + TS strict + `ubean.config.ts` enabling `@ubean/electron`) | ⬜ | P0 | Repo ready; pnpm install passes; `electron: true` takes effect (default main/preload entries, SSR auto-disabled); CI skeleton in place |
| ST0-02 | Main process: window management, single instance lock, deep links (`ubean-studio://`), macOS menu/tray placeholder | ⬜ | P0 | Double-open blocked; deep link opens and routes |
| ST0-03 | preload: contextBridge typed API (`window.studio`) + event subscription mechanism | ⬜ | P0 | Renderer uses zero direct `ipcRenderer`; types inferred end-to-end |
| ST0-04 | Renderer Shell: sidebar, theme (light/dark), vue-router, global notifications | ⬜ | P0 | Menu collapse/expand; route lazy loading; `SConfigProvider` theme |
| ST0-05 | Global AI panel container (right drawer, draggable width, shortcut to invoke) | ⬜ | P0 | Invocable from any module; UI ready (logic in MS3) |
| ST0-06 | Build packaging: electron-builder (mac dmg/zip), asarUnpack node-pty reserved | ⬜ | P0 | mac local produces runnable installer |
| ST0-07 | Engineering: eslint, vitest basics, CI packaging workflow skeleton | ⬜ | P1 | lint/typecheck/test added to commands |
| ST0-08 | **Main repo minor change**: Add `ubean/scaffold` subpath export (re-export `@ubean/cli/shared`) | ⬜ | P0 | studio can `import { ... } from 'ubean/scaffold'`; main repo unit tests all green |
| ST0-09 | **pi-agent SDK integration verification (spike)**: Embed `pi-coding-agent` SDK, minimal conversational + event stream via IPC to renderer | ⬜ | P0 | Renderer displays streaming replies; pi extension registration mechanism works |
| ST0-10 | **ubean-scaffold extension prototype**: Register 1 pi tool (`scaffold.createPage`) bridging `ubean/scaffold` | ⬜ | P1 | AI conversation can create a page file; consistent with CLI output |

### MS1: Project Management + Command Center

| ID | Task | Status | Priority | Acceptance criteria |
| --- | --- | --- | --- | --- |
| ST1-01 | WorkspaceStore: project model (path/name/pm/favorite/port preference) + JSON persistence + migration fault tolerance | ⬜ | P0 | State restored after restart; corrupted files auto-backed up and rebuilt |
| ST1-02 | Project detector: identify ubean projects (`ubean.config.ts` / deps include `ubean`), read version and preset | ⬜ | P0 | Non-ubean projects get guide prompt; examples/ubean-test correctly identified |
| ST1-03 | New project wizard: template (starter/minimal/blog) × preset (standard/node/cloudflare) × pm, calls `ubean init` equivalent logic | ⬜ | P0 | Generated project runs with `pnpm dev`; diff-identical to CLI output |
| ST1-04 | Import project: directory selection, batch import, validity check | ⬜ | P0 | Imported projects appear in list with correct status |
| ST1-05 | ProcessManager: spawn/node-pty wrapper, concurrency limit, log ring buffer, exit code capture | ⬜ | P0 | 4 concurrent tasks stable; logs complete; kill cascades child process cleanup |
| ST1-06 | Command center UI: dev/build/preview/prepare card-style operations (parameter forms: port/host/preset/sourcemap/clean) | ⬜ | P0 | Parameters mapped correctly; run/stop/restart; state machine correct (idle→running→ready/error) |
| ST1-07 | Live log view: xterm rendering, ANSI colors, search, export | ⬜ | P0 | High throughput without dropped frames; colors correct |
| ST1-08 | dev server ready detection: port listening + `/_health` polling + auto-invoke embedded preview (webview) | ⬜ | P0 | ready status accurate; preview interactive |
| ST1-09 | Scaffold forms (page/api/layout/middleware/cron/plugin/env/config CRUD) bridging CLI Shared Layer | ⬜ | P0 | Identical to `ubean page add` etc. CLI output; triggers same hooks; deletion auto-backs up and restorable |
| ST1-10 | npm scripts panel: parse package.json scripts, one-click run + common scripts pinned | ⬜ | P1 | scripts list hot-updates on change |
| ST1-11 | Project-level terminal tab (node-pty, cwd=project root) | ⬜ | P1 | Fully interactive (vim/top usable); switches with project |
| ST1-12 | Task history and notification center (success/failure toast + history list) | ⬜ | P1 | Failed tasks show exit code and log tail |

### MS2: DevTools Integration

| ID | Task | Status | Priority | Acceptance criteria |
| --- | --- | --- | --- | --- |
| ST2-01 | DevToolsHost view: `<webview>` container (independent partition, localhost-only navigation, loading/error states) | ⬜ | P0 | devtools SPA loads successfully; external navigation blocked |
| ST2-02 | Sub-menu deep links: 13 tabs map one-to-one to devtools client views (requires devtools client to support URL view positioning, submit a corresponding minor change) | ⬜ | P0 | Menu switching lands precisely on corresponding tab |
| ST2-03 | Not-running guide page: detect dev server not started, provide "one-click start" and auto-connect | ⬜ | P0 | After startup, auto-enters DevTools |
| ST2-04 | Feature regression: verify per docs/test.md section 13 (Overview/Pages/ApiRoutes/ApiDocs/ApiPlayground/Config/EnvVars/Layouts/Middlewares/Crons/DrizzleStudio/Terminal/AiAssistant) | ⬜ | P0 | All checklist items pass |
| ST2-05 | Multi-project DevTools context isolation (partition per project, port conflict handling) | ⬜ | P1 | Dual projects parallel without interference |

### MS3: AI Core (Based on pi-agent)

| ID | Task | Status | Priority | Acceptance criteria |
| --- | --- | --- | --- | --- |
| ST3-01 | pi Provider config: configure openai-compatible/anthropic/custom via `pi-ai`; model list; connectivity test | ⬜ | P0 | Three provider configs usable; failures give diagnostics |
| ST3-02 | Key management: safeStorage encrypt/decrypt provider apiKey, settings page entry/clear; decrypt and inject into pi config | ⬜ | P0 | Keys never stored in plaintext; invisible to renderer |
| ST3-03 | PiAgentHost: initialize `pi-coding-agent` SDK, agent state management, event stream forwarded to renderer via contextBridge | ⬜ | P0 | Streaming render stable; reconnection on disconnect |
| ST3-04 | ubean Extensions registration (7): ubean-project/scaffold/command/fs/devtools/materials/solutions (pi tool protocol + executors) | ⬜ | P0 | ≥12 tools; schema validation failures give clear errors |
| ST3-05 | Conversation panel: consume pi event stream to render message list, streaming text, Markdown/code highlighting, tool call expansion | ⬜ | P0 | Tool calls expandable to view params/results |
| ST3-06 | pi Skill integration: `skills/ubean` packaged as pi skill package; current project summary dynamically provided by `ubean-project` extension | ⬜ | P0 | Token budget controllable; injected content previewable |
| ST3-07 | Agent multi-step tasks: pi native agent loop (plan → tool → summarize); renderer shows step-by-step execution; interruptible | ⬜ | P0 | "Create product management module" type tasks complete end-to-end |
| ST3-08 | PermissionLayer: intercept write operations before pi tool execution; renderer shows unified diff / command summary / materials list; proceed after confirmation | ⬜ | P0 | Not executed without confirmation; diff accurate |
| ST3-09 | Audit log: all write operations and command executions intercepted by PermissionLayer written to `audit.log`, viewable/clearable in settings | ⬜ | P0 | Logs include time/tool/params/result |
| ST3-10 | Session management: session history grouped by project (pi `AgentMessage` serialization), create/rename/delete | ⬜ | P1 | Sessions restored after restart |
| ST3-11 | DevTools AI config sync: studio pi provider config can be pushed to project devtools ai settings (Vercel AI SDK side) | ⬜ | P2 | DevTools AI Assistant reuses same key |
| ST3-12 | AI error diagnosis entry: "Analyze with AI" one-click with log context on command failure/type errors | ⬜ | P1 | Log tail auto-attached; suggestions actionable |

### MS4: Materials Marketplace

| ID | Task | Status | Priority | Acceptance criteria |
| --- | --- | --- | --- | --- |
| ST4-01 | Materials protocol finalized: `material.json` JSON Schema + type definitions + validator | ⬜ | P0 | Invalid materials give located errors |
| ST4-02 | `packages/studio-materials` init + built-in registry index generation script | ⬜ | P0 | Build-time validates all materials |
| ST4-03 | First batch of ≥15 built-in materials (nav/footer/Hero/features/pricing/FAQ/login/register/dashboard shell/table page/settings page, etc., all `S*` components + UnoCSS) | ⬜ | P0 | Each material has preview + propsSchema + screenshot |
| ST4-04 | Market UI: categories/tags/search (fuse.js), card grid, favorites | ⬜ | P0 | Search response <100ms; dark theme adapted |
| ST4-05 | Preview host: built-in minimal Vite environment + iframe/webview live preview + props debugging panel (form generated from propsSchema) | ⬜ | P0 | Props changes take effect immediately; size switching (desktop/mobile) |
| ST4-06 | Code view: SFC source read-only display (CodeMirror, reuse devtools experience) + copy | ⬜ | P1 | Highlighting correct |
| ST4-07 | One-click insert: copy files to target project + dependency detection (`@soybeanjs/ui`/UnoCSS preset) + guide install/configure if missing | ⬜ | P0 | After insertion project typecheck passes; ubean auto-import directly usable |
| ST4-08 | Remote registry: HTTP pull + local cache + version/hash verification | ⬜ | P1 | Offline falls back to built-in library + cached |
| ST4-09 | AI materials tool: `market.search` / `market.insert` integrated into AI (find and insert materials via conversation) | ⬜ | P1 | "Add a pricing section" completes end-to-end |

### MS5: Commercial Systems

| ID | Task | Status | Priority | Acceptance criteria |
| --- | --- | --- | --- | --- |
| ST5-01 | Solution protocol: `solution.json` JSON Schema + validator + template fetch (git/degit + built-in) | ⬜ | P0 | Protocol documented; invalid solutions rejected |
| ST5-02 | Market UI: categorized list, detail page (feature list/tech stack/screenshots/env requirements/version) | ⬜ | P0 | Complete info; dark adapted |
| ST5-03 | Install pipeline: pull → pm install → env wizard (form from envSchema writes .env) → postInstall (migration/seed) → register workspace | ⬜ | P0 | Each step retryable; failure rolls back directory |
| ST5-04 | Blog system solution (@ubean/content + auth + SEO/sitemap + example articles) | ⬜ | P0 | After install, dev runs: home/article page/admin login usable |
| ST5-05 | Commerce system solution (products/categories/cart/orders + database + auth + payment adapter placeholder) | ⬜ | P0 | Core flow demonstrable: browse → add to cart → place order |
| ST5-06 | Commercial system upgrade path: detect template new version → change summary → update wizard | ⬜ | P2 | Version comparison correct |
| ST5-07 | Commercialization placeholder: license field protocol, paid solution display state (purchase guide external link) | ⬜ | P3 | Protocol reserved, UI has state |
| ST5-08 | AI commercial system tool: `solutions.list` / `solutions.install` (conversational install, env asks item by item) | ⬜ | P1 | "Set up a blog for me" completes end-to-end |

### MS6: Polish and Release

| ID | Task | Status | Priority | Acceptance criteria |
| --- | --- | --- | --- | --- |
| ST6-01 | electron-updater auto-update (release channels, update prompts, delta) | ⬜ | P0 | Old versions upgrade smoothly |
| ST6-02 | Error reporting and basic telemetry (off by default, toggleable in settings; anonymized) | ⬜ | P1 | Privacy compliance documentation complete |
| ST6-03 | CI release pipeline: mac (signed+notarized)/win (signed)/linux (AppImage/deb) | ⬜ | P0 | Tag triggers three-platform artifacts |
| ST6-04 | Performance budget: startup <3s, memory baseline <300MB, multi dev server stress test | ⬜ | P1 | Meets targets or has clear optimization records |
| ST6-05 | Docs: user guide (docs at same level as skills directory), shortcut table, materials/solution protocol docs | ⬜ | P1 | In sync with implementation |
| ST6-06 | Official website/landing page (can bootstrap with ubean, dogfooding) | ⬜ | P2 | Live |

---

## 7. Key Decision Records (ADR Drafts)

| ID | Topic | Decision | Notes |
| --- | --- | --- | --- |
| ADR-01 | Electron vs Tauri | ✅ Electron | Main process needs to directly run node-pty, ts-morph, c12, CLI Shared Layer and pi-agent SDK's Node ecosystem; Tauri requires Rust rewrite or sidecar, high cost and loses reuse |
| ADR-02 | DevTools integration approach | ✅ webview embedding | Fully reuse `@ubean/devtools`' 13 views; native rewrite listed as long-term P3 |
| ADR-03 | Scaffold operation channel | ✅ Main process directly calls CLI Shared Layer | Shares same implementation with DevTools RPC and CLI, results consistent (§4.13); requires new `ubean/scaffold` subpath export in main package (ST0-08 prerequisite minor change) |
| ADR-04 | studio's own tech stack | ✅ Vue 3 SPA (reuse ubean build chain, not ubean runtime) | studio is an Electron tool, no SSR/deployment needs; ubean is the managed object. studio handles Electron build via `@ubean/electron` (ubean built-in module) (main/preload/renderer three-process build, HMR, auto-start), but renderer doesn't use ubean's SSR/page routing/API routing runtime. Official landing page uses ubean bootstrap (ST6-06) |
| ADR-05 | AI tool protocol | ✅ pi-agent Extension (TypeScript) | v0.2 switches to pi-coding-agent SDK; ubean-specific capabilities registered as pi extension, eliminates custom tool registry; pi natively supports tool calling protocol |
| ADR-06 | Materials protocol | ✅ Custom material.json (referencing shadcn registry) | Aligns with `@soybeanjs/ui` ecosystem; preserves option to export to shadcn registry format |
| ADR-07 | Secret storage | ✅ safeStorage | System-level encryption; no third-party keyring; decrypt and inject into pi provider config |
| ADR-08 | Commercial system template distribution | ✅ git templates (degit) + solution.json | Consistent with community ecosystem; built-in templates usable offline |
| ADR-09 | Repository strategy | ✅ Standalone private repo `ubeanjs/ubean-studio` | Main repo fully open-sourced (MIT), studio contains closed-source commercial content that can't be mixed; standalone repo consumes ubean as npm dep, local dev via pnpm link (see §0.1) |
| ADR-10 | AI foundation | ✅ pi-coding-agent SDK (replaces custom AiGateway) | pi provides agent loop / tool calling / multi-provider / event stream / skill injection, maintained by mitsuhiko; studio focuses on ubean-specific extensions and PermissionLayer; pi's lack of permission system filled by studio's interception layer (see §0.2) |
| ADR-11 | DevTools AI retention | ✅ Layered retention (not cut) | devtools AI stays in framework as open-source gateway (dev server context assistant), studio AI carries complete agent; cutting it would sever the adoption funnel and trigger community trust crisis (Continue.dev acquisition/stabilization lesson); see §10.5 |
| ADR-12 | Product naming | ✅ Keep ubean-studio | Name conveys "official comprehensive workbench" positioning (cf. Android Studio / Xcode), AI is an attribute not the whole; tagline reinforces AI-Native positioning; renaming to agent would self-narrow, obscuring DevTools/marketplace/solutions' exclusive value |
| ADR-13 | Commercialization model | ✅ BYOK + feature gating + solutions marketplace | AI inference BYOK free (removes friction), advanced AI generators (table building/plugins/themes/templates) unlocked via Pro membership; solutions marketplace as high-profit one-time paid product; users pay for "capabilities" not "usage", cf. Cline/OpenCode's BYOK + Cursor's capability layering; see §10 |
| ADR-14 | Commercialization starting point | ✅ Solutions marketplace first | Complete application templates (blog/commerce/CMS) have strongest willingness to pay and lowest marginal cost; studio free + BYOK drives adoption, solutions start revenue; Pro subscription and enterprise tier follow; see §10.4 |
| ADR-15 | Electron build toolchain | ✅ `@ubean/electron` (replaces electron-vite) | v0.3: ubean built-in `@ubean/electron` module (thin wrapper over vite-plugin-electron), `electron: true` in `ubean.config.ts` to enable; default main/preload entries (`electron/main.ts`, `electron/preload.ts`), auto-disables SSR (desktop apps don't need SSR). Benefits: (1) studio doesn't need separate `electron-vite` toolchain, build config unified in `ubean.config.ts`; (2) any ubean project can upgrade to desktop app via `electron: true`, expanding ubean ecosystem coverage; (3) main repo natively maintains electron integration, studio follows upgrades at zero cost |

---

## 8. Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Large Electron package size (node-pty native module, materials preview host) | Poor download experience | asarUnpack only necessary modules; materials preview host lazy-built on demand; delta updates |
| Multi-project multi dev server resource usage | Memory/port pressure | ProcessManager concurrency limit; idle dev server auto-suspend prompt; port conflict auto-allocation |
| AI write operation security incidents | User code corruption | All write ops diff-confirmed + auto-backup (reuse .ubean/backup mechanism) + audit log; command allowlist |
| Materials/commercial system quality and maintenance cost | Marketplace reputation | Protocol validation + CI install testing (run install pipeline e2e for each solution); official first batch seeks quality over quantity |
| DevTools deep link changes affect main package | Regression risk | ST2-02's devtools client change as independent PR + existing 32 devtools unit tests all green |
| Cross-platform signing/notarization cost (mac/win certs) | Release blocking | CI runs unsigned packages first; cert application listed as MS6 prerequisite |
| node-pty cross-platform compilation | Windows build failure | electron-rebuild included in CI matrix (mac/win/linux) for early verification (ST0-06/ST6-03) |
| AI provider API changes | Feature failure | `pi-ai` Provider abstraction + contract tests; pi version locked in catalog |
| BYOK user churn to free alternatives (Cline/OpenCode are also BYOK) | Revenue below expectations | Differentiation via ubean-specific extensions (DevTools/scaffold/materials/solutions), generic agents can't replicate; advanced AI generators (table building/plugins/themes) are framework-exclusive workflows |
| Solutions marketplace cold start | No third-party creators initially | Official first releases blog Pro + commerce system 2 premium solutions, verify willingness to pay before opening to third parties; material/solution protocol reserves commercialization fields |
| Pro feature gating bypassed (closed-source extensions reverse-engineered) | Revenue loss | Core generator logic in main process (not in renderer); license verification server-side (phase three); accept some cracking in exchange for ecosystem adoption |
| devtools AI and studio AI dual-stack maintenance cost | Maintenance burden | devtools AI stays lightweight (Vercel AI SDK + single-file CRUD), no expansion; complex capabilities always route to studio |

---

## 9. Acceptance Baseline and Testing Strategy

1. **Unit tests**: Main process service layer (workspace/process/scaffold/materials/solutions/permission) and pi extensions (ubean-project/scaffold/command/fs/devtools/materials/solutions) pure function coverage; protocol validators positive/negative cases.
2. **Integration tests**: Using `examples/ubean-test` as fixed fixture, verify command center, scaffold forms and CLI output consistency (file diff).
3. **e2e tests**: Playwright Electron driver (`@playwright/test`'s `_electron`), covering MS1→MS5 core user journeys.
4. **Marketplace e2e**: CI runs "install → build → preview → smoke assertion" pipeline for blog/commerce solutions.
5. **Security testing**: webview navigation interception, path escape, AI unconfirmed write interception, key storage check (same standard as roadmap risk #17).
6. **Continuous acceptance**: Follows engineering.md §6.3 gate — fixtures, type tests, e2e updated in sync before each milestone merge, coverage used to discover blind spots.

---

## 10. Commercialization Strategy (v0.2 Addition)

### 10.1 Positioning: Framework Official Workbench, Not a Generic Agent

ubean-studio does not compete with Cursor / Claude Code (generic coding agents). It positions itself like **Android Studio to Android**, **Xcode to the Apple ecosystem** — a framework-specific workbench. Differentiation isn't through "stronger AI" but through **exclusive value from deep framework integration** (DevTools embedding, scaffold bridging, materials/solutions marketplace, ubean-specific AI extensions).

### 10.2 Core Principle

> **Framework open-source (adoption engine) → studio is the commercial vehicle → solutions are high-profit products → advanced AI workflows are subscription anchors**

### 10.3 BYOK + Feature Gating Model (Key Design)

**Decoupling AI inference cost from AI value**:

- **AI inference cost borne by users**: studio adopts BYOK (Bring Your Own Key) — users bring their own OpenAI/Anthropic API key. Basic AI conversation is free, removing adoption friction (cf. Cline / OpenCode).
- **Advanced AI-driven workflows are paid**: AI inference itself is free, but ubean's high-value "AI generators" wrapped via pi extensions require Pro membership to unlock. Users pay for **capabilities**, not **usage**.

| Capability tier | Free (BYOK) | Pro membership unlock |
| --- | --- | --- |
| **AI conversation** | General Q&A, code explanation, error diagnosis, single-file editing | — |
| **AI scaffolding** | Basic CRUD (single page/API creation) | AI app page templates (complete page layout generation) |
| **AI generators** | — | AI-driven database table building (describe entity → generate migration + model + API + pages) |
| **AI generators** | — | AI plugin generation (describe requirements → generate complete ubean module/plugin) |
| **AI generators** | — | AI theme generation (describe style → generate UnoCSS theme + component styles) |
| **AI multi-step agent** | — | Cross-file refactoring, solution customization, intelligent materials composition |
| **DevTools AI** | dev server context assistant (stays open-source, as gateway) | — |

**Gating implementation**: pi extensions marked `requiresPro: true` at registration; PermissionLayer checks membership status before execution, guides upgrade if not unlocked. Free/Pro provider configs are identical (same BYOK key), the only difference is the unlocked extension set.

### 10.4 Three-Phase Commercialization Path

**Phase 1: Adoption period — free studio + paid solutions** (start revenue)

- studio desktop app: **free download** (drives adoption, builds ecosystem)
- AI: **BYOK free** (basic conversation + basic scaffolding)
- **Solutions marketplace**: Blog Pro / Commerce system / CMS and other complete templates, one-time payment ($49-299)
- Materials marketplace: freemium (basic free, premium material packs paid)
- Pro membership: **early bird open** (advanced AI generators unlock, $19/mo)

> Solutions are the highest priority revenue — users' willingness to pay for "complete products" far exceeds tool subscriptions, and marginal cost is minimal.

**Phase 2: Recurring revenue — Studio Pro subscription** (build ARR)

- Free: local-only, BYOK AI, basic scaffolding, free solutions
- **Pro $19/mo**: all AI generators (table building/plugins/themes/templates), premium materials library, cloud sync
- **Teams $15/user/mo**: shared workspace, team AI config, audit logs, seat management

**Phase 3: Enterprise + Platform** (scale)

- Enterprise: SSO, on-prem deployment, compliance audit, dedicated support
- Cloud build/preview: one-click cloud build/preview from studio (infrastructure revenue)
- Solutions marketplace opens to third-party creators (revenue sharing, like App Store / ThemeForest)

### 10.5 DevTools AI Positioning (Layered Retention, as Conversion Gateway)

After studio is implemented, **do not cut** the AI Assistant in devtools. Instead, position it in layers:

| | devtools AI (open-source, distributed with framework) | studio AI (closed-source, pi-agent driven) |
| --- | --- | --- |
| **Positioning** | "dev server context assistant" | "full project lifecycle agent" |
| **Capabilities** | Route explanation, single-file CRUD, error diagnosis, env check (read-only + light write) | Multi-step agent, AI generators, cross-project, materials/solutions marketplace |
| **AI stack** | Vercel AI SDK (unchanged) | pi-agent (closed-source extensions) |
| **Trigger** | Only when `ubean dev` is running | Desktop persistent |
| **Value** | Lets users taste AI, builds ubean=AI-friendly mindset → converts to studio | Pay when wanting stronger AI and exclusive workflows |

**Rationale**:
1. In 2026, AI is already table-stakes for framework selection — OSS with no AI at all gets eliminated during selection.
2. Continue.dev acquisition/stabilization lesson: pulling AI from open-source to closed-source triggers community trust crisis.
3. devtools AI is the entry point of the adoption funnel (taste → want more → convert to studio); cutting it severs the entry point.
4. The two have naturally different responsibilities (dev server context vs project lifecycle), not a simple basic/advanced relationship.

---

## Next Steps

- [Overview](/architecture/overview) — ubean's overall architecture and design principles
- [Runtime](/architecture/runtime) — Client and server runtime internals
- [Electron Integration](/integrations/electron) — Building desktop apps with `@ubean/electron`
- [UI Components](/integrations/ui) — `@soybeanjs/ui` integration and materials
