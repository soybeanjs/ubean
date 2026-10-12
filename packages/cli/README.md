# @ubean/cli

**English | [中文](./README.zh-CN.md)**

The ubean command line: project lifecycle commands, scaffolding, `.env` and config management, plus the side-effect-free library surface for programmatic scaffolding.

```bash
pnpm add -D ubean @ubean/cli
pnpm exec ubean dev
```

## Table of Contents

- [Package Positioning](#package-positioning)
- [Install](#install)
- [Quick Start](#quick-start)
- [Library vs Executable Entry](#library-vs-executable-entry)
- [Commands](#commands)
  - [`ubean init`](#ubean-init)
  - [`ubean dev`](#ubean-dev)
  - [`ubean build`](#ubean-build)
  - [`ubean preview`](#ubean-preview)
  - [`ubean prepare`](#ubean-prepare)
  - [`ubean analyze`](#ubean-analyze)
  - [`ubean env`](#ubean-env)
  - [`ubean config`](#ubean-config)
  - [`ubean devtools`](#ubean-devtools)
- [Scaffolding](#scaffolding)
  - [`ubean page`](#ubean-page)
  - [`ubean api` / `layout` / `middleware` / `cron` / `plugin`](#ubean-api--layout--middleware--cron--plugin)
  - [`ubean scaffold`](#ubean-scaffold)
- [Library API](#library-api)
- [Scaffold Contract](#scaffold-contract)
- [Bundle Budget Helpers](#bundle-budget-helpers)
- [Global Flags](#global-flags)
- [Type Safety](#type-safety)
- [Architecture Notes](#architecture-notes)

## Package Positioning

`@ubean/cli` owns the **engineering commands** — the parts that are not lifecycle orchestration. The
dev / build / preview lifecycles themselves live in `@ubean/build`'s Vite plugin (ADR-0012), and the
CLI commands are thin aliases over `vite dev | build | preview`.

| Responsible for                                                                                                       | NOT responsible for                                                                            |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| The executable: `dev` / `build` / `preview` / `prepare` / `init` / `page` / `env` / `config` / `devtools` / `analyze` | Dev request routing, dev app bootstrap, build orchestration, preview takeover — `@ubean/build` |
| Scaffolding (`scaffold` / `deleteScaffold` / `recoverScaffold` / `listScaffoldableFiles`) + file templates            | Page/layout scanning and route metadata — `@ubean/scan` / `@ubean/vue`                         |
| The machine-readable scaffold catalog (`getScaffoldManifest`, `SCAFFOLD_CONTRACT_VERSION`)                            | Config shape and resolution — `@ubean/config`                                                  |
| Bundle-budget reporting (`ubean analyze`) and its baseline helpers                                                    | The build that produces the manifest — `@ubean/build`                                          |
| `.env` file read/write and `ubean.config.ts` creation/display                                                         | Deployment platform presets — `@ubean/preset`                                                  |
| The `env-runner`-backed dev worker entry wiring                                                                       | The worker entry source itself — `@ubean/build/vite`                                           |

**Runtime dependency whitelist (main entry `@ubean/cli`):** `citty` (command parsing), `kolorist`
(colors), `pathe` (paths), plus `@ubean/shared` for the logger. The main entry deliberately does
**not** import Vite, the plugin, or the command implementations — it is a library surface for
scaffold / fs-ops / templates, and importing it has **no side effects**.

Optional peer dependencies: `@ubean/content`, `@ubean/devtools`, `@vitejs/plugin-vue`, `vite`. When
they are absent, the corresponding capability degrades (content collections are not
bootstrapped, DevTools is not mounted) rather than failing — but the plain Vite commands require
`vite` itself, and `vite dev` needs `@vitejs/plugin-vue` unless your config brings its own.

`env-runner` lives **only here** and must not be added as a dependency of `@ubean/build` — it triggers
pnpm peer-variant drift, which surfaces as `Plugin` type identity mismatches.

## Install

```bash
pnpm add -D ubean @ubean/cli
```

The `ubean` aggregator package depends on `@ubean/cli` and ships the `ubean` binary, which forwards
to `@ubean/cli/cli`. Installing the aggregator is enough — `@ubean/cli` is listed separately here only
for consumers that want the binary, or the library surface, without the framework.

The `@ubean/cli` package's own `bin` entry is temporarily named **`ubean-next`**; the user-facing
command is `ubean`.

## Quick Start

```bash
ubean init my-app --name my-app --template starter --preset node -y
cd my-app
pnpm install
pnpm dev
```

Two conventions to know before running anything:

- Options accept `--flag value` and `--flag=value`; booleans can be negated with the `--no-` prefix
  (`--no-ssr`, `--no-install`, `--no-write`).
- **Always spell long-form option names.** Only `-f`, `-y`, and `--pm` have short forms. citty reads
  `init -n blog -t blog` as `{ n: true, t: true, _: ["blog", "blog"] }` with `template` / `preset` /
  `name` all `undefined` (they fall back to `unify` / `standard` / the directory name), and reads
  `-pm pnpm` as `-p -m pnpm`, silently leaving the package manager on its default. Write `--name` /
  `--template` / `--preset` / `--pm`.

## Library vs Executable Entry

The package has two subpaths, and picking the wrong one has a visible consequence.

| Subpath            | What it is                                                                       | Side effects                |
| ------------------ | -------------------------------------------------------------------------------- | --------------------------- |
| `@ubean/cli` (`.`) | Library surface: scaffold, fs-ops, templates, analyze helpers, scaffold manifest | **None** — import it freely |
| `@ubean/cli/cli`   | The executable entry; **importing it runs `runMain(main)` at module top level**  | Starts the CLI              |

`bin/ubean-next.mjs` is a two-line forwarder — `import '../dist/cli.mjs';` — because a bare import of
the executable entry is all that is required.

```ts
// ✓ import the library entry from your own tooling
import { scaffold, getScaffoldManifest, createFsOps } from '@ubean/cli';

// ✗ never do this in library code — it launches the CLI
// import '@ubean/cli/cli';
```

## Commands

### `ubean init`

Initialize a new ubean project.

```bash
ubean init [dir]
```

| Argument | Description             | Default |
| -------- | ----------------------- | ------- |
| `[dir]`  | Directory to initialize | `.`     |

| Option             | Alias  | Description                                    | Default    |
| ------------------ | ------ | ---------------------------------------------- | ---------- |
| `--force`          | `-f`   | Overwrite existing files                       | `false`    |
| `--name`           | —      | Project name                                   | —          |
| `--template`       | —      | Project template (unify/minimal/starter/blog)  | `unify`    |
| `--preset`         | —      | Target preset (standard/node/cloudflare/…)     | `standard` |
| `--packageManager` | `--pm` | Package manager (npm/pnpm/yarn/bun)            | `npm`      |
| `--git`            | —      | Initialize git repository (`--no-git` to skip) | —          |
| `--yes`            | `-y`   | Skip prompts and use defaults                  | `false`    |

Templates: `unify` (full-stack with islands/i18n/layouts/middleware — the default), `minimal`
(hello world page), `starter` (pages/api/layouts), `blog` (markdown blog structure).

The interactive preset menu offers three choices — `standard` (default), `node`, `cloudflare`. All
other platform presets must be passed explicitly: `cloudflare-dev`, `vercel`, `vercel-edge`,
`netlify`, `bun`, `deno`, `aws`, `azure` (11 presets in total).

Behavior notes: without `--yes` and in a TTY, the command prompts for name, template, preset, package
manager, and git initialization. An invalid `--packageManager` falls back to `npm`. Existing files are
only overwritten with `--force`; in non-interactive mode a non-empty directory aborts unless `--force`
is passed. Non-interactive mode is forced by `--yes`, a non-TTY stdin, or the `CI` / `NONINTERACTIVE`
environment variables.

```bash
# Non-interactive with explicit choices
ubean init my-app --name my-app --template starter --preset node -y

# Use a preset outside the interactive menu
ubean init my-app --preset vercel-edge -y

# Skip git initialization
ubean init my-app --no-git
```

### `ubean dev`

Start the development server with hot reload.

```bash
ubean dev
```

| Option          | Description                                                      | Default     |
| --------------- | ---------------------------------------------------------------- | ----------- |
| `--port`        | Port to listen on                                                | `9527`      |
| `--host`        | Host to listen on                                                | `localhost` |
| `--strictPort`  | Exit if the port is already in use, instead of auto-incrementing | `false`     |
| `--verbose`     | Show detailed startup logs (scan, codegen, diagnostics, reloads) | —           |
| `--logRequests` | Log each request (`GET /path 200 12ms`); ignored in ssg/spa      | —           |
| `--open`        | Open browser on startup                                          | `false`     |
| `--cwd`         | Project root directory                                           | `.`         |

There is no `--https` option and no `-p` short alias. `--port` / `--host` override the `dev.port` /
`dev.host` fields in `ubean.config.ts`.

Behavior: the project is scanned, type definitions are generated into `.ubean/`, and the dev server
starts. Watched directories are `api`, `pages`, `middleware`, `layouts`, `plugins`, `app`, and
`routes` under `srcDir`; a change triggers a rescan and a reload. In fullstack/backend modes the
banner lists the Scalar UI (`/_scalar`) and OpenAPI schema (`/_openapi.json`) URLs, and OpenAPI types
are generated asynchronously into `.ubean/`.

In `ssg` mode, security response headers (CSP/HSTS/…) are disabled by default in dev — static output
ships no framework-injected headers (the hosting platform controls them), so dev mirrors that reality.
Explicitly setting `security.headers` in `ubean.config.ts` re-enables them as a CSP debugging console.
If the DevTools module is enabled, its URL appears in the banner.

```bash
ubean dev --port 3000 --host 0.0.0.0
ubean dev --strictPort
```

### `ubean build`

Build the application for production.

```bash
ubean build
```

| Option        | Description                                                                                  | Default |
| ------------- | -------------------------------------------------------------------------------------------- | ------- |
| `--preset`    | Deployment preset (node, bun, deno, cloudflare, vercel, netlify, standard, ...)              | —       |
| `--mode`      | App mode (fullstack, spa, ssg, backend); overrides `ubean.config.ts`                         | —       |
| `--ssr`       | Enable SSR in fullstack mode (`--no-ssr` to disable); only effective with `--mode fullstack` | —       |
| `--ssg`       | Shortcut for `--mode ssg`                                                                    | `false` |
| `--outDir`    | Output directory (overrides `ubean.config.ts` `build.outputDir`)                             | —       |
| `--minify`    | Minify output (`--no-minify` to disable)                                                     | `true`  |
| `--sourcemap` | Generate sourcemaps                                                                          | `false` |
| `--prerender` | Pre-render static pages (`--no-prerender` to disable)                                        | —       |
| `--cwd`       | Project root directory                                                                       | `.`     |

There is no `--clean` option. `--preset` has no CLI default — it falls back to `build.preset` in
`ubean.config.ts`, which defaults to `node`.

`--mode ssg` (or `--ssg`) enables full prerendering via the **direct render path**: a minimal static
bundle renders each route without the Hono pipeline. `pages/404.vue` renders to `404.html` for static
hosts; i18n routes are expanded per strategy (e.g. `/about` + `/zh/about`). The temporary
`dist/server` bundle is removed afterwards — set `UBEAN_KEEP_SSR` to keep it. Page `loader` is not
executed in this mode (one-time warning); use fullstack prerendering when loaders are required.

`spa` and `backend` modes disable prerendering; fullstack with `ssr: false` also disables it.
`--prerender` / `--no-prerender` override the resolved value. Preset `build:before` / `build:after`
hooks are executed.

```bash
ubean build --preset cloudflare
ubean build --ssg
ubean build --no-ssr --sourcemap
```

`ubean build` ≡ `vite build`, with one difference: `vite build` **ignores `--outDir`** and always
writes `config.build.outputDir`.

### `ubean preview`

Preview the production build locally. Run `ubean build` first.

```bash
ubean preview
```

| Option         | Description                                                      | Default     |
| -------------- | ---------------------------------------------------------------- | ----------- |
| `--port`       | Port to listen on                                                | `9725`      |
| `--host`       | Host to listen on                                                | `localhost` |
| `--strictPort` | Exit if the port is already in use, instead of auto-incrementing | `false`     |
| `--outDir`     | Output directory to preview (overrides `build.outputDir`)        | —           |
| `--cwd`        | Project root directory                                           | `.`         |

There is no `-p` short alias. `--port` / `--host` override `preview.port` / `preview.host` (defaults
`9725` / `localhost`).

`spa` / `ssg` modes serve `dist/public/` with a built-in static file server (SPA falls back to
`index.html`; SSG resolves `<path>/index.html` or `<path>.html`). `fullstack` / `backend` modes spawn
the built `dist/server/server.mjs` with `PORT` and `HOST` environment variables. The `cloudflare`
preset is not supported for local preview — use `wrangler dev` instead; that platform preview is only
wired on the `ubean preview` side (via miniflare). Other fetch-handler presets run `handler.mjs` with
a warning. When the requested port is busy, the next free port is used unless `--strictPort` is set.

### `ubean prepare`

Generate type definitions and check project dependencies.

```bash
ubean prepare
```

| Option      | Description                                                                  | Default |
| ----------- | ---------------------------------------------------------------------------- | ------- |
| `--cwd`     | Project root directory                                                       | `.`     |
| `--install` | Prompt to install missing project dependencies (`--no-install` to only warn) | `true`  |

The project is scanned and type definitions are generated into `.ubean/`. The dependency check
compares the resolved config against what the project must declare:

- **required** — core packages (`vue`, `vue-router`, `vue-i18n`), the packages behind every enabled
  built-in module (`ui: true` → `@ubean/integrations` + `@vean/ui`), and those modules' required peers;
- **optional** — feature-gated packages (`@mdx-js/mdx` for MDX, `satori` + `@resvg/resvg-js` when an
  OG-image convention file exists, `pagefind` for content search, `miniflare` for `cloudflare-dev`,
  `nodemailer` for email).

Each missing entry names who requires it and why (`required by \`ui\``), followed by a copy-pasteable
install command. Build-time peers go to `devDependencies`, runtime peers to `dependencies`. On an
interactive terminal it asks before installing, using the project's package manager (detected from
lockfiles: pnpm > yarn > bun > npm), with `@ubean/*`packages pinned to`@^<ubean-version>`.

The same check also runs from the Vite plugin's `config` hook, so bare `vite dev` / `vite build`
(which never call `prepare`) are covered too. Set `UBEAN_SKIP_DEP_CHECK=1` to disable it. There is no
`--force` flag; missing dependencies and install failures are non-fatal warnings. `--no-install` skips
auto-installation only — the warning is still printed, which is the right behaviour in CI.

### `ubean analyze`

Report the client JS budget from the Vite client manifest. Run after `ubean build`.

```bash
ubean analyze
```

| Option          | Description                                                                           | Default                       |
| --------------- | ------------------------------------------------------------------------------------- | ----------------------------- |
| `--cwd`         | Project root                                                                          | `process.cwd()`               |
| `--write`       | Write `.ubean/bundle-baseline.json` (`--no-write` to disable)                         | `true`                        |
| `--out`         | Baseline JSON output path                                                             | `.ubean/bundle-baseline.json` |
| `--check`       | Committed baseline JSON to compare against (fails if gzip grows past `--maxIncrease`) | —                             |
| `--maxIncrease` | Allowed relative gzip growth when using `--check`                                     | `0.05`                        |

Requires a client Vite manifest; it errors out (exit code 1) if no build output is found. It reports
total and entry gzip sizes plus the largest JS chunks. `--check` compares against a committed baseline
and fails when total or entry gzip size exceeds the allowed relative increase.

```bash
ubean build && ubean analyze
ubean analyze --no-write
ubean analyze --check benchmarks/bundle-baseline.json --no-write
```

### `ubean env`

Manage `.env` files.

```bash
ubean env <add|remove|list|init>
```

| Subcommand   | Arguments       | Options                                                      |
| ------------ | --------------- | ------------------------------------------------------------ |
| `env add`    | `<key> <value>` | `--file` (default `.env`), `--public`, `-f/--force`, `--dry` |
| `env remove` | `<key>`         | `--file`, `--dry`                                            |
| `env list`   | —               | `--file`, `--public` (show only public variables)            |
| `env init`   | —               | `-f/--force`, `--dry`                                        |

`--public` prefixes the key with `UBEAN_PUBLIC_` unless it already starts with `UBEAN_PUBLIC_` /
`VITE_` / `PUBLIC_`. `env list` marks keys with those prefixes as `[public]`. `env init` creates
`.env` and `.env.example` from a template.

```bash
ubean env init
ubean env add DATABASE_URL postgres://localhost/app
ubean env add API_URL https://api.example.com --public
ubean env list --public
```

### `ubean config`

Manage `ubean.config.ts`.

```bash
ubean config <init|show|example|path>
```

| Subcommand       | Options                                                                                                               | Description                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `config init`    | `--preset` (default `standard`; any registered preset name — `vercel-edge`, `aws`, `azure`, …), `-f/--force`, `--dry` | Create a default `ubean.config.ts`              |
| `config show`    | —                                                                                                                     | Show the current config file location/content   |
| `config example` | —                                                                                                                     | Show a full example configuration               |
| `config path`    | —                                                                                                                     | Print the resolved config path (exit 1 if none) |

There are no `--json` or `--env` flags.

```bash
ubean config init --preset node
ubean config init --dry
ubean config path
```

### `ubean devtools`

Manage DevTools configuration and information. This command neither opens a browser nor starts a
server — DevTools itself runs inside the dev server.

```bash
ubean devtools <info|path>
```

| Subcommand      | Options                   | Description                                                 |
| --------------- | ------------------------- | ----------------------------------------------------------- |
| `devtools info` | —                         | Show DevTools information (access, config, features)        |
| `devtools path` | `--port` (default `9527`) | Print the DevTools URL: `http://localhost:<port>/_devtools` |

```bash
ubean devtools path
ubean devtools path --port 3000
```

In the browser, DevTools opens by visiting the URL from the dev server banner (default `/_devtools`)
while the dev server runs; it redirects to the devframe hub shell, which hosts the panel as an iframe
devframe.

## Scaffolding

Scaffold commands create, delete, recover, and list files. Shared conventions:

| Type         | Base directory    | Extension            |
| ------------ | ----------------- | -------------------- |
| page / reuse | `src/pages/`      | `.vue` / `.reuse.ts` |
| api          | `src/routes/`     | `.ts`                |
| layout       | `src/layouts/`    | `.vue`               |
| middleware   | `src/middleware/` | `.ts`                |
| cron         | `src/crons/`      | `.ts`                |
| plugin       | `src/plugins/`    | `.ts`                |

Cron files land in `src/crons/`, matching the scanner default (`DEFAULT_DIRS.crons = 'crons'`).
Numeric filename prefixes control registration order (`01.cleanup.ts`).

Shared semantics:

- `add` skips existing files unless `-f/--force` is passed (a `.bak` backup is created before
  overwriting).
- `delete` creates a `.bak` backup by default; `-f/--force` deletes permanently without backup.
- `recovery` restores the most recent `.bak` backup; `--dry` only checks whether recovery is possible.
- `--dry` prints the action without writing files.
- Component names derive from the route path: dynamic segments become PascalCase (`[id]` → `Id`),
  `[...slug]` → `AllSlug`, `[[page]]` → `PageOptional`.

### `ubean page`

Generic scaffold entry for all types.

```bash
ubean page <add|add-reuse|delete|recovery|list>
```

| Subcommand              | Argument                                                   | Options                                                                                                                                                  |
| ----------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page add <path>`       | route path (e.g. `users/[id]`, `api/users`, `crons/daily`) | `--type` (page/api/layout/middleware/cron/plugin, default `page`), `--method` (default `GET`), `--schedule` (default `* * * * *`), `-f/--force`, `--dry` |
| `page add-reuse <path>` | route path                                                 | `-f/--force`, `--dry`                                                                                                                                    |
| `page delete <path>`    | route path                                                 | `--type` (… + `reuse`), `-f/--force`, `--dry`                                                                                                            |
| `page recovery <path>`  | route path                                                 | `--type`, `--dry`                                                                                                                                        |
| `page list`             | —                                                          | `--type`                                                                                                                                                 |

`--type` for `add` does **not** include `reuse` — use `page add-reuse` instead.

```bash
ubean page add about
ubean page add "users/[id]"
ubean page add api/users --type api --method POST
ubean page add daily-cleanup --type cron --schedule "0 0 * * *"
ubean page add dashboard --dry
```

### `ubean api` / `layout` / `middleware` / `cron` / `plugin`

Dedicated commands, each with the subcommands `add`, `delete`, `recovery`, and `list`.

| Command                | Argument | Extra options                      | Shared options        |
| ---------------------- | -------- | ---------------------------------- | --------------------- |
| `ubean api add`        | `<path>` | `--method` (default `GET`)         | `-f/--force`, `--dry` |
| `ubean cron add`       | `<path>` | `--schedule` (default `* * * * *`) | `-f/--force`, `--dry` |
| `ubean layout add`     | `<path>` | —                                  | `-f/--force`, `--dry` |
| `ubean middleware add` | `<path>` | —                                  | `-f/--force`, `--dry` |
| `ubean plugin add`     | `<path>` | —                                  | `-f/--force`, `--dry` |

`delete <path>` takes `-f/--force` (permanent delete, no backup) and `--dry`; `recovery <path>` takes
`--dry`; `list` takes no options.

```bash
ubean api add users/[id] --method DELETE
ubean layout add admin
ubean middleware add auth
ubean cron add daily-cleanup --schedule "0 0 * * *"
ubean plugin add my-plugin
ubean api list
ubean api delete users/[id]
ubean api recovery users/[id]
```

### `ubean scaffold`

Machine-readable scaffold catalog for studio and IDE integrations.

```bash
ubean scaffold describe
```

`describe` prints the scaffold JSON manifest to stdout. It contains `contractVersion` and a `types`
array, each entry with `type`, `cli`, `baseDir`, `extensions`, and `args`.

```bash
ubean scaffold describe
ubean scaffold describe | jq '.types[].type'
```

## Library API

Import from `@ubean/cli` — no side effects, no CLI startup.

```ts
import {
  scaffold,
  deleteScaffold,
  recoverScaffold,
  listScaffoldableFiles,
  getScaffoldManifest,
  SCAFFOLD_CONTRACT_VERSION,
  createFsOps
} from '@ubean/cli';

const result = await scaffold({
  cwd: process.cwd(),
  type: 'api', // 'page' | 'api' | 'layout' | 'middleware' | 'reuse' | 'cron' | 'plugin'
  path: 'users/[id]',
  method: 'POST',
  force: false,
  dry: false // baseDir?: string overrides the default directory for this type
});
// → { created, deleted, restored, skipped, errors }
```

| Export                                         | Description                                                                        |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| `scaffold(options)` / `ScaffoldOptions`        | Create files; `ScaffoldResult` = `{ created, deleted, restored, skipped, errors }` |
| `deleteScaffold(options)`                      | Delete with a `.bak` backup unless `force`                                         |
| `recoverScaffold(options)`                     | Restore from the most recent `.bak`                                                |
| `listScaffoldableFiles(cwd, type, baseDir?)`   | List existing files of a type                                                      |
| `ScaffoldType`                                 | `'page' \| 'api' \| 'layout' \| 'middleware' \| 'reuse' \| 'cron' \| 'plugin'`     |
| `createFsOps(cwd)` / `FsOps`                   | Filesystem helpers bound to a project root (see below)                             |
| `toKebabCase` / `toPascalCase` / `toCamelCase` | Name casing used by the templates                                                  |

Template rendering, exported for tools that generate their own files:

```ts
import { renderTemplate, renderApiTemplate, API_TEMPLATE } from '@ubean/cli';

renderTemplate('Hello {{name}}', { variables: { name: 'ubean' } });
```

`renderPageTemplate`, `renderApiTemplate`, `renderMiddlewareTemplate`, `renderLayoutTemplate`,
`renderCronTemplate`, `renderPluginTemplate` each take their data interface (`PageTemplateData`,
`ApiTemplateData`, `MiddlewareTemplateData`, `LayoutTemplateData`, `CronTemplateData`,
`PluginTemplateData`); the raw `PAGE_TEMPLATE` / `API_TEMPLATE` / `MIDDLEWARE_TEMPLATE` /
`LAYOUT_TEMPLATE` / `CRON_TEMPLATE` / `PLUGIN_TEMPLATE` strings are exported too, along with
`TemplateVariables` and `TemplateOptions`.

`FsOps` (from `createFsOps(cwd)`) bundles `resolvePath`, `ensureDir`, `exists`, `readFile`,
`writeFile`, `appendFile`, `remove`, `copyFile`, `copyDir`, `readDir`, `readJson`, `writeJson`,
`createBackup`, `restoreBackup`, `removeBackup`, and `listFiles`. `FsOpOptions` (re-exported as
`FsOpsOptions`) and `BackupOptions` configure it.

## Scaffold Contract

`getScaffoldManifest()` returns the catalog that `ubean scaffold describe` prints — the integration
point for studio and IDE plugins.

```ts
import { getScaffoldManifest, SCAFFOLD_CONTRACT_VERSION } from '@ubean/cli';

const manifest = getScaffoldManifest();
// {
//   contractVersion: 1,
//   types: [{ type, cli, baseDir, extensions, args: [{ name, required, description, default? }] }]
// }
```

`SCAFFOLD_CONTRACT_VERSION` is `1` and is typed as the literal, so the manifest's own
`contractVersion` field is checked against it. Each `ScaffoldTypeManifest` records whether a dedicated
CLI command exists (`cli: true` for api/layout/middleware/cron/plugin; **`false` for `reuse`**, which
is library-only. Reuse routes are created with `scaffold({ type: 'reuse' })` or `ubean page add-reuse`).

## Bundle Budget Helpers

The `ubean analyze` implementation is exportable, so CI scripts can report or gate without spawning
the CLI.

```ts
import {
  findClientManifest,
  readViteManifest,
  summarizeBundle,
  compareBundleBaseline,
  writeBundleBaseline
} from '@ubean/cli';

const manifest = findClientManifest(process.cwd());
const baseline = summarizeBundle(outDir, readViteManifest(manifest.path));
const violations = compareBundleBaseline(baseline, committedBaseline, { maxIncrease: 0.05 });
```

| Export                                                | Description                                                          |
| ----------------------------------------------------- | -------------------------------------------------------------------- |
| `findClientManifest(cwd)`                             | Locate the client Vite manifest                                      |
| `readViteManifest(manifestPath)`                      | Parse it → `Record<string, ManifestChunk>`                           |
| `summarizeBundle(outDir, manifest)`                   | → `BundleBaseline` (total + entry gzip)                              |
| `compareBundleBaseline(current, committed, options?)` | → budget violations; `options` carries the allowed relative increase |
| `writeBundleBaseline(filePath, baseline)`             | Persist a baseline                                                   |

`BundleBaseline`, `BundleBudgetEntry`, and `ManifestChunk` are exported from the main entry. The
reported figures are gzip sizes; the relative-growth ceiling and the absolute `--max-total-kb` /
`--max-entry-kb` / `--max-chunk-kb` ceilings are separate gates.

## Global Flags

```bash
ubean --help
ubean <command> --help
ubean --version
```

`--debug` enables verbose logging (timestamps, call sites, log levels) and works whether it is placed
before or after the subcommand:

```bash
ubean --debug dev
ubean dev --debug
```

The CLI does **not** read `UBEAN_PORT` / `UBEAN_HOST` — use `--port` / `--host` or the `dev` /
`preview` fields in `ubean.config.ts`.

| Variable                    | Used by           | Description                                                     | Default   |
| --------------------------- | ----------------- | --------------------------------------------------------------- | --------- |
| `PORT`                      | production server | Server port in the generated production server entry            | `9527`    |
| `HOST`                      | production server | Server host in the generated production server entry            | `0.0.0.0` |
| `CI` / `NONINTERACTIVE`     | init              | Forces non-interactive mode                                     | —         |
| `UBEAN_KEEP_SSR`            | build (SSG mode)  | Keeps the temporary `dist/server` bundle instead of deleting it | —         |
| `UBEAN_SKIP_DEP_CHECK`      | dependency check  | Skips the project dependency check                              | —         |
| `LOG_LEVEL` / `TSLOG_LEVEL` | logging           | Logger minimum level (silly/trace/debug/info/warn/error/fatal)  | `info`    |
| `TSLOG_TYPE`                | logging           | Logger output format (json/pretty/hidden)                       | —         |

Exit codes: `0` success, `1` general error. `config path` also exits `1` when no config file exists.

## Type Safety

- `ScaffoldType` is a string-literal union, so `scaffold({ type })` and `--type` values are checked at
  compile time rather than at file-write time.
- `FsOps` is `ReturnType<typeof createFsOps>`, i.e. the helpers' shapes are derived from the factory
  rather than hand-declared — they cannot drift.
- The template renderers are typed per template (`PageTemplateData`, `ApiTemplateData`, …), so a
  missing variable is a type error, not a `{{placeholder}}` left in the output.
- `ScaffoldManifest` / `ScaffoldTypeManifest` / `ScaffoldArgManifest` describe the JSON the CLI emits;
  `SCAFFOLD_CONTRACT_VERSION` is a literal type (`1`), not `number`, so `contractVersion` in the
  manifest is pinned.
- Library exports are all declared in `dist/index.d.ts`; the executable entry ships an empty
  declaration file (`cli.d.ts`) precisely because it has no API surface.

## Architecture Notes

- **The CLI does not own the dev/build/preview lifecycles.** ADR-0012 moved them into the Vite plugin:
  `ubeanPlugin()` registers `client` and `ubean` environments plus `builder.buildApp` in its `config`
  hook, so `vite dev | build | preview` is the complete toolchain and the CLI commands are thin
  aliases. Both paths produce item-for-item identical output
  (`packages/cli/test/build-contracts.test.ts`).
- **Two entry points with different side-effect contracts.** The main entry is a library; `./cli` runs
  `runMain(main)` at module top level and must only ever be imported by a binary. This is why
  `bin/ubean-next.mjs` is a bare `import '../dist/cli.mjs';`.
- **Projects without a user `vite.config.ts` are still supported.** The CLI injects the builtin plugin
  in that case; the plugin does not register itself twice. When `UBEAN_BUILD_DRIVEN_BY_CLI` is set, the
  plugin must not register its own `buildApp`, or the same build is orchestrated twice.
- **Codegen ownership is negotiated through environment variables.** `ubean dev` / `build` /
  `prepare` set `UBEAN_CODEGEN_BY_CLI=1` (and the build path sets
  `UBEAN_BUILD_DRIVEN_BY_CLI=1`), which makes the Vite plugin yield — without it, a bare `vite build`
  would produce no `.ubean/*.d.ts` at all and user type-checks would fail.
- **`env-runner` must stay in this package.** It is not a dependency of `@ubean/build`; adding it there
  triggers pnpm peer-variant drift, which appears as `Plugin` type identity mismatches.
- **The `ubean-next` binary name is temporary.** The user-facing command is `ubean`; renaming the
  package's own `bin` entry is pending.
- **Cron scaffolding targets `src/crons/`** to match the scanner's `DEFAULT_DIRS.crons`, not
  `src/tasks/` or any other plausible name.
- **There is deliberately no in-config rollback for the lifecycle migration.** `experimental.viteBuilder`
  was deleted with the legacy two-`viteBuild` orchestration; rollback is a version rollback only.
- **Test suites run serially in this package.** Several suites build into the same shared example
  directory (`examples/ubean-test`'s `dist/` and `.ubean/`) — building and previewing the same output
  directory concurrently fails — so the package's Vitest config disables file parallelism. The fix is
  per-suite directory isolation, not rewriting example sources.
