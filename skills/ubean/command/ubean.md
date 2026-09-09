# ubean CLI Commands

## Overview

The ubean CLI is a [citty](https://github.com/unjs/citty)-based command line tool for developing, building, and managing ubean applications. The `ubean` binary is shipped by the `ubean` package (the underlying binary in `@ubean/cli` is temporarily named `ubean-next`).

Options can be passed as `--flag value` or `--flag=value`. Boolean flags can be negated with the `--no-` prefix (e.g. `--no-ssr`, `--no-install`, `--no-write`).

## Command Reference

| Command            | Description                                                                             |
| ------------------ | --------------------------------------------------------------------------------------- |
| `ubean init`       | Initialize a new ubean project                                                          |
| `ubean dev`        | Start the ubean development server                                                      |
| `ubean build`      | Build the ubean application for production                                              |
| `ubean preview`    | Preview the production build locally                                                    |
| `ubean prepare`    | Generate type definitions and prepare the project (runs automatically before dev/build) |
| `ubean analyze`    | Report client JS budget from the Vite client manifest (run after `ubean build`)         |
| `ubean page`       | Scaffold pages, api routes, layouts, middleware, crons, and plugins                     |
| `ubean api`        | Scaffold API routes                                                                     |
| `ubean layout`     | Scaffold layout components                                                              |
| `ubean middleware` | Scaffold middleware                                                                     |
| `ubean cron`       | Scaffold scheduled cron tasks                                                           |
| `ubean plugin`     | Scaffold ubean plugins                                                                  |
| `ubean env`        | Manage environment variables                                                            |
| `ubean config`     | Manage ubean configuration                                                              |
| `ubean devtools`   | Manage DevTools configuration and information                                           |
| `ubean scaffold`   | Machine-readable scaffold catalog (studio / IDE plugins)                                |

## Project Lifecycle

### ubean init

Initialize a new ubean project.

**Usage:**

```bash
ubean init [dir]
```

**Arguments:**

| Argument | Description             | Default |
| -------- | ----------------------- | ------- |
| `[dir]`  | Directory to initialize | `.`     |

**Options:**

| Option           | Short | Description                                      | Default |
| ---------------- | ----- | ------------------------------------------------ | ------- |
| --force          | -f    | Overwrite existing files                         | false   |
| --name           | -     | Project name                                     | -       |
| --template       | -     | Project template (unify/minimal/starter/blog)    | -       |
| --preset         | -     | Target preset (standard/node/cloudflare)         | -       |
| --packageManager | -pm   | Package manager (npm/pnpm/yarn/bun)              | -       |
| --git            | -     | Initialize git repository (use --no-git to skip) | -       |
| --yes            | -y    | Skip prompts and use defaults                    | false   |

> There are no `-n`/`-t`/`-p` short aliases — only `-f`, `-y`, and `-pm`.

**Behavior:**

- Without `--yes` (and when running in a TTY), the command prompts for project name, template, preset, package manager, and git initialization.
- Without explicit flags, defaults are: template `unify`, preset `standard`, package manager `npm`, git initialization enabled.
- An invalid `--packageManager` value falls back to `npm`.
- In non-empty directories, existing files are only overwritten with `--force`. In non-interactive mode a non-empty directory aborts with an error unless `--force` is passed.
- Non-interactive mode is forced by `--yes`, a non-TTY stdin, or the `CI`/`NONINTERACTIVE` environment variables.

**Templates:**

- `unify`: Full-stack with islands/i18n/layouts/middleware (recommended, default)
- `minimal`: Just a hello world page
- `starter`: Includes pages/api/layouts
- `blog`: Markdown-based blog structure

**Presets:**

The interactive preset menu offers three choices:

- `standard`: Node.js/Bun compatible (default)
- `node`: Node.js
- `cloudflare`: Cloudflare Workers

All other platform presets must be passed explicitly via `--preset`: `cloudflare-dev`, `vercel`, `vercel-edge`, `netlify`, `bun`, `deno`, `aws`, `azure` (11 presets in total).

**Examples:**

```bash
# Interactive mode
ubean init

# Initialize into a subdirectory
ubean init my-app

# Non-interactive with explicit choices
ubean init my-app --name my-app --template starter --preset node -y

# Use a preset outside the interactive menu
ubean init my-app --preset vercel-edge -y

# Skip git initialization
ubean init my-app --no-git
```

### ubean dev

Start the ubean development server with hot reload.

**Usage:**

```bash
ubean dev
```

**Options:**

| Option       | Description                                                      | Default   |
| ------------ | ---------------------------------------------------------------- | --------- |
| --port       | Port to listen on                                                | 9527      |
| --host       | Host to listen on                                                | localhost |
| --strictPort | Exit if the port is already in use, instead of auto-incrementing | false     |
| --open       | Open browser on startup                                          | false     |
| --cwd        | Project root directory                                           | `.`       |

> There is no `--https` option and no `-p` short alias. `--port`/`--host` override the `dev.port`/`dev.host` fields in `ubean.config.ts`.

**Behavior:**

- Scans the project, generates type definitions into `.ubean/`, and starts the Hono dev server.
- Watches `api`, `pages`, `middleware`, `layouts`, `plugins`, `app`, and `routes` under `srcDir`; on change the project is rescanned, the app rebuilt, and the browser reloaded.
- In fullstack/backend modes the startup banner lists the Scalar UI (`/_scalar`) and OpenAPI schema (`/_openapi.json`) URLs, and OpenAPI types are generated asynchronously into `.ubean/`.
- In `ssg` mode, security response headers (CSP/HSTS/…) are disabled by default in dev — static output ships no framework-injected headers (the hosting platform controls them), so dev mirrors that reality. Explicitly setting `security.headers` in `ubean.config.ts` re-enables them as a CSP debugging console.
- If the DevTools module is enabled in config, the DevTools URL is shown in the banner.

**Examples:**

```bash
# Start dev server on default port 9527
ubean dev

# Start on a custom port and host
ubean dev --port 3000 --host 0.0.0.0

# Fail instead of picking the next free port
ubean dev --strictPort

# Open the browser automatically
ubean dev --open
```

### ubean build

Build the application for production.

**Usage:**

```bash
ubean build
```

**Options:**

| Option      | Description                                                                                      | Default |
| ----------- | ------------------------------------------------------------------------------------------------ | ------- |
| --preset    | Deployment preset (node, bun, deno, cloudflare, vercel, netlify, standard, ...)                  | -       |
| --mode      | App mode (fullstack, spa, ssg, backend). Overrides `ubean.config.ts` mode                        | -       |
| --ssr       | Enable SSR in fullstack mode (only effective with `--mode fullstack`). Use `--no-ssr` to disable | -       |
| --ssg       | Shortcut for `--mode ssg`                                                                        | false   |
| --minify    | Minify output (use `--no-minify` to disable)                                                     | true    |
| --sourcemap | Generate sourcemaps                                                                              | false   |
| --prerender | Pre-render static pages (SSG). Use `--no-prerender` to disable                                   | -       |
| --cwd       | Project root directory                                                                           | `.`     |

> There is no `--clean` option. `--preset` has no CLI default — it falls back to the `build.preset` field in `ubean.config.ts`, which defaults to `node`.

**Behavior:**

- Output goes to `config.build.outputDir` (default `dist/`).
- `--mode ssg` (or `--ssg`) enables full prerendering via the direct render path: a minimal static bundle renders each route without the Hono pipeline (no API routes / middleware / crons in the render bundle). `pages/404.vue` renders to `404.html` for static hosts; i18n routes are expanded per strategy (e.g. `/about` + `/zh/about`). The temporary `dist/server` bundle is removed afterwards (set the `UBEAN_KEEP_SSR` environment variable to keep it). Page `loader` is not executed in this mode (one-time warning) — use fullstack prerendering when loaders are required.
- `spa` and `backend` modes disable prerendering; fullstack with `ssr: false` also disables it. `--prerender`/`--no-prerender` override the resolved value.
- Preset `build:before`/`build:after` hooks are executed.

**Examples:**

```bash
# Build with the configured preset (default: node)
ubean build

# Build for a specific platform
ubean build --preset cloudflare
ubean build --preset vercel
ubean build --preset vercel-edge
ubean build --preset netlify
ubean build --preset bun
ubean build --preset deno

# Static site generation
ubean build --ssg

# Fullstack build without SSR, with source maps
ubean build --no-ssr --sourcemap

# Disable minification
ubean build --no-minify
```

### ubean preview

Preview the production build locally. Run `ubean build` first.

**Usage:**

```bash
ubean preview
```

**Options:**

| Option       | Description                                                      | Default   |
| ------------ | ---------------------------------------------------------------- | --------- |
| --port       | Port to listen on                                                | 9725      |
| --host       | Host to listen on                                                | localhost |
| --strictPort | Exit if the port is already in use, instead of auto-incrementing | false     |
| --cwd        | Project root directory                                           | `.`       |

> There is no `-p` short alias. The `--port`/`--host` flags override the `preview.port`/`preview.host` fields in `ubean.config.ts` (defaults 9725 / `localhost`).

**Behavior:**

- `spa`/`ssg` modes serve `dist/public/` with a built-in static file server (SPA fallback to `index.html`; SSG resolves `<path>/index.html` or `<path>.html`).
- `fullstack`/`backend` modes spawn the built `dist/server/server.mjs` (node/bun/deno presets) with `PORT` and `HOST` environment variables.
- The `cloudflare` preset is not supported for local preview; use `wrangler dev` instead. Other fetch-handler presets run `handler.mjs` with a warning.
- When the requested port is busy, the next free port is used unless `--strictPort` is set.

**Examples:**

```bash
# Preview on default port 9725
ubean preview

# Preview on a custom port
ubean preview --port 4000

# Fail instead of picking the next free port
ubean preview --strictPort
```

### ubean prepare

Generate type definitions and prepare the project. Runs automatically before `dev`/`build`.

**Usage:**

```bash
ubean prepare
```

**Options:**

| Option    | Description                                                                | Default |
| --------- | -------------------------------------------------------------------------- | ------- |
| --cwd     | Project root directory                                                     | `.`     |
| --install | Auto-install missing built-in module packages (use `--no-install` to skip) | true    |

**Behavior:**

- Scans the project and generates type definitions into `.ubean/`.
- Detects built-in extension modules enabled in config but not installed, and installs them with the project's package manager (detected from lockfiles: pnpm > yarn > bun > npm), pinned to `@^<ubean-version>`.
- There is no `--force` flag. Install failures are non-fatal and reported as warnings.
- `--no-install` skips auto-installation (useful in CI where installs are pre-managed).

**Examples:**

```bash
# Scan and generate types (auto-installs missing built-in packages)
ubean prepare

# Skip auto-installation
ubean prepare --no-install
```

### ubean analyze

Report the client JS budget from the Vite client manifest. Run after `ubean build`.

**Usage:**

```bash
ubean analyze
```

**Options:**

| Option        | Description                                                                         | Default                       |
| ------------- | ----------------------------------------------------------------------------------- | ----------------------------- |
| --cwd         | Project root                                                                        | `process.cwd()`               |
| --write       | Write `.ubean/bundle-baseline.json` (use `--no-write` to disable)                   | true                          |
| --out         | Baseline JSON output path                                                           | `.ubean/bundle-baseline.json` |
| --check       | Committed baseline JSON to compare against (fails if gzip grows past --maxIncrease) | -                             |
| --maxIncrease | Allowed relative gzip growth when using `--check`                                   | 0.05                          |

**Behavior:**

- Requires a client Vite manifest; errors out (exit code 1) if no build output is found.
- Reports total and entry gzip sizes plus the largest JS chunks.
- `--check` compares against a committed baseline JSON and fails (exit code 1) when total or entry gzip size exceeds the allowed relative increase.

**Examples:**

```bash
# Build then write .ubean/bundle-baseline.json
ubean build && ubean analyze

# Report only, without writing a baseline
ubean analyze --no-write

# Check against a committed baseline in CI
ubean analyze --check benchmarks/bundle-baseline.json --no-write
```

## Scaffolding

The scaffold commands create, delete, recover, and list files. Shared conventions:

| Type         | Base directory      | Extension            |
| ------------ | ------------------- | -------------------- |
| page / reuse | `src/pages/`        | `.vue` / `.reuse.ts` |
| api          | `src/routes/`       | `.ts`                |
| layout       | `src/layouts/`      | `.vue`               |
| middleware   | `src/middleware/`   | `.ts`                |
| cron         | `src/server/crons/` | `.ts`                |
| plugin       | `src/plugins/`      | `.ts`                |

- `add` skips existing files unless `-f/--force` is passed (which creates a `.bak` backup before overwriting).
- `delete` creates a `.bak` backup by default; `-f/--force` deletes permanently without backup.
- `recovery` restores the most recent `.bak` backup; `--dry` only checks whether recovery is possible.
- `--dry` prints the action without writing files.
- Component names are derived from the route path (dynamic segments like `[id]` become `Id`, `[...slug]` becomes `AllSlug`, `[[page]]` becomes `PageOptional`).

### ubean page

Scaffold pages, api routes, layouts, middleware, crons, and plugins (generic entry).

**Usage:**

```bash
ubean page <add|add-reuse|delete|recovery|list> [options]
```

#### page add

```bash
ubean page add <path>
```

**Arguments:**

| Argument | Description                                                 |
| -------- | ----------------------------------------------------------- |
| `<path>` | Route path (e.g., `users/[id]`, `api/users`, `crons/daily`) |

**Options:**

| Option      | Description                                       | Default     |
| ----------- | ------------------------------------------------- | ----------- |
| --type      | Type: page, api, layout, middleware, cron, plugin | page        |
| --method    | HTTP method for API routes (GET, POST, etc.)      | GET         |
| --schedule  | Cron schedule expression for cron tasks           | `* * * * *` |
| -f, --force | Overwrite existing files (creates .bak backup)    | false       |
| --dry       | Show what would be created without writing files  | false       |

> The `--type` values for `add` do not include `reuse` — use `page add-reuse` instead.

#### page add-reuse

```bash
ubean page add-reuse <path>
```

Creates a reusable page component (`.reuse.ts`) in `src/pages/`.

**Options:** `-f, --force` (default false), `--dry` (default false)

#### page delete

```bash
ubean page delete <path>
```

**Options:**

| Option      | Description                                              | Default |
| ----------- | -------------------------------------------------------- | ------- |
| --type      | Type: page, api, layout, middleware, reuse, cron, plugin | page    |
| -f, --force | Delete permanently without creating backup               | false   |
| --dry       | Show what would be deleted                               | false   |

#### page recovery

```bash
ubean page recovery <path>
```

**Options:** `--type` (page, api, layout, middleware, reuse, cron, plugin; default page), `--dry` (default false)

#### page list

```bash
ubean page list
```

**Options:** `--type` (page, api, layout, middleware, reuse, cron, plugin; default page)

**Examples:**

```bash
# Create src/pages/about.vue
ubean page add about

# Create src/pages/users/[id].vue
ubean page add "users/[id]"

# Create an API route with POST method
ubean page add api/users --type api --method POST

# Create a cron task with a custom schedule
ubean page add daily-cleanup --type cron --schedule "0 0 * * *"

# Preview without writing
ubean page add dashboard --dry
```

### ubean api / layout / middleware / cron / plugin

Dedicated scaffold commands for each type. All of them share the subcommands `add`, `delete`, `recovery`, and `list`.

**Usage:**

```bash
ubean api <add|delete|recovery|list> [options]
ubean layout <add|delete|recovery|list> [options]
ubean middleware <add|delete|recovery|list> [options]
ubean cron <add|delete|recovery|list> [options]
ubean plugin <add|delete|recovery|list> [options]
```

#### add

| Command                | Arguments | Extra options                      | Shared options         |
| ---------------------- | --------- | ---------------------------------- | ---------------------- |
| `ubean api add`        | `<path>`  | `--method` (default GET)           | `-f, --force`, `--dry` |
| `ubean cron add`       | `<path>`  | `--schedule` (default `* * * * *`) | `-f, --force`, `--dry` |
| `ubean layout add`     | `<path>`  | -                                  | `-f, --force`, `--dry` |
| `ubean middleware add` | `<path>`  | -                                  | `-f, --force`, `--dry` |
| `ubean plugin add`     | `<path>`  | -                                  | `-f, --force`, `--dry` |

#### delete / recovery / list

- `delete <path>`: `-f, --force` (permanent delete, no backup), `--dry`
- `recovery <path>`: `--dry`
- `list`: no options

**Examples:**

```bash
# API route with GET (default) and one with DELETE
ubean api add users/[id]
ubean api add users/[id] --method DELETE

# Layout for the admin area
ubean layout add admin

# Auth middleware
ubean middleware add auth

# Daily cron at midnight
ubean cron add daily-cleanup --schedule "0 0 * * *"

# Plugin scaffold
ubean plugin add my-plugin

# List, delete (with backup), and recover
ubean api list
ubean api delete users/[id]
ubean api recovery users/[id]
```

### ubean scaffold

Machine-readable scaffold catalog for studio and IDE integrations.

**Usage:**

```bash
ubean scaffold describe
```

**Subcommands:**

| Subcommand | Description                                |
| ---------- | ------------------------------------------ |
| `describe` | Print the scaffold JSON manifest to stdout |

The manifest contains `contractVersion` and a `types` array (each entry: `type`, `cli`, `baseDir`, `extensions`, `args`).

**Examples:**

```bash
# Print the JSON manifest
ubean scaffold describe

# Inspect with jq
ubean scaffold describe | jq '.types[].type'
```

## Environment & Configuration

### ubean env

Manage `.env` files.

**Usage:**

```bash
ubean env <add|remove|list|init> [options]
```

#### env add

```bash
ubean env add <key> <value>
```

**Arguments:**

| Argument  | Description                                                  |
| --------- | ------------------------------------------------------------ |
| `<key>`   | Variable name (e.g., `DATABASE_URL`, `UBEAN_PUBLIC_API_URL`) |
| `<value>` | Variable value                                               |

**Options:**

| Option      | Description                                                                                                            | Default |
| ----------- | ---------------------------------------------------------------------------------------------------------------------- | ------- |
| --file      | Environment file                                                                                                       | `.env`  |
| --public    | Mark as public (prefixes the key with `UBEAN_PUBLIC_` unless it already starts with `UBEAN_PUBLIC_`/`VITE_`/`PUBLIC_`) | false   |
| -f, --force | Overwrite existing variable without confirmation                                                                       | false   |
| --dry       | Show what would be changed                                                                                             | false   |

#### env remove

```bash
ubean env remove <key>
```

**Options:** `--file` (default `.env`), `--dry` (default false)

#### env list

```bash
ubean env list
```

**Options:** `--file` (default `.env`), `--public` (show only public variables; default false)

Variables whose key starts with `UBEAN_PUBLIC_`, `VITE_`, or `PUBLIC_` are marked `[public]`.

#### env init

```bash
ubean env init
```

Creates `.env` and `.env.example` from a template.

**Options:** `-f, --force` (overwrite existing files; default false), `--dry` (default false)

**Examples:**

```bash
# Create .env files
ubean env init

# Add a server-only variable
ubean env add DATABASE_URL postgres://localhost/app

# Add a public variable (becomes UBEAN_PUBLIC_API_URL)
ubean env add API_URL https://api.example.com --public

# Overwrite an existing value
ubean env add DATABASE_URL postgres://prod-host/app --force

# List only public variables
ubean env list --public
```

### ubean config

Manage `ubean.config.ts`.

**Usage:**

```bash
ubean config <init|show|example|path>
```

**Subcommands:**

| Subcommand | Options                                                                           | Description                                          |
| ---------- | --------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `init`     | `--preset` (standard, node, cloudflare; default standard), `-f, --force`, `--dry` | Create a default `ubean.config.ts`                   |
| `show`     | -                                                                                 | Show the current config file location and content    |
| `example`  | -                                                                                 | Show a full example configuration with all options   |
| `path`     | -                                                                                 | Print the resolved config file path (exit 1 if none) |

> There are no `--json` or `--env` flags.

**Examples:**

```bash
# Create a config file with the node preset
ubean config init --preset node

# Preview without writing
ubean config init --dry

# Show the current config
ubean config show

# Print the absolute config path
ubean config path
```

## DevTools

### ubean devtools

Manage DevTools configuration and information. This command does not open a browser or start a server — DevTools itself runs inside the dev server.

**Usage:**

```bash
ubean devtools <info|path>
```

**Subcommands:**

| Subcommand | Options                 | Description                                                         |
| ---------- | ----------------------- | ------------------------------------------------------------------- |
| `info`     | -                       | Show DevTools information (access shortcuts, config, features)      |
| `path`     | `--port` (default 9527) | Print the DevTools URL: `http://localhost:<port>/__ubean/devtools/` |

**Examples:**

```bash
# Print the DevTools URL for the default dev port
ubean devtools path

# Print the URL for a custom dev port
ubean devtools path --port 3000
```

In the browser, DevTools can be opened with `Shift+Alt+D` or by visiting `/__ubean/devtools/` while the dev server is running.

## Global Options

### ubean --help

Show help for all commands.

**Usage:**

```bash
ubean --help
ubean <command> --help
```

**Examples:**

```bash
# Show general help
ubean --help

# Show help for a specific command
ubean init --help
ubean page add --help
```

### ubean --version

Show the CLI version.

**Usage:**

```bash
ubean --version
```

### ubean --debug

Global flag that enables verbose logging (timestamps, call sites, log levels). Works whether it is placed before or after the subcommand.

```bash
ubean --debug dev
ubean dev --debug
```

## Environment Variables

The CLI itself does not read `UBEAN_PORT`/`UBEAN_HOST` — use the `--port`/`--host` flags or the `dev`/`preview` fields in `ubean.config.ts`.

| Variable                | Used by           | Description                                                             | Default |
| ----------------------- | ----------------- | ----------------------------------------------------------------------- | ------- |
| PORT                    | production server | Server port in the generated production server entry                    | 9527    |
| HOST                    | production server | Server host in the generated production server entry                    | 0.0.0.0 |
| CI                      | init              | Forces non-interactive mode                                             | -       |
| NONINTERACTIVE          | init              | Forces non-interactive mode                                             | -       |
| UBEAN_KEEP_SSR          | build (SSG mode)  | Keeps the temporary `dist/server` bundle instead of deleting it         | -       |
| LOG_LEVEL / TSLOG_LEVEL | logging           | Sets the logger minimum level (silly/trace/debug/info/warn/error/fatal) | info    |
| TSLOG_TYPE              | logging           | Logger output format (json/pretty/hidden)                               | -       |

## Exit Codes

| Code | Description   |
| ---- | ------------- |
| 0    | Success       |
| 1    | General error |
