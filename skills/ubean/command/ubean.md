# ubean CLI Commands

## Overview

The ubean CLI provides commands for developing, building, and managing ubean applications.

## Command Reference

### ubean init

Initialize a new ubean project.

**Usage:**

```bash
ubean init [options]
```

**Options:**

| Option     | Short | Description                  | Default                |
| ---------- | ----- | ---------------------------- | ---------------------- |
| --name     | -n    | Project name                 | Current directory name |
| --template | -t    | Project template             | starter                |
| --preset   | -p    | Platform preset              | standard               |
| --pm       | -     | Package manager              | auto-detect            |
| --yes      | -y    | Skip interactive prompts     | false                  |
| --force    | -f    | Overwrite existing directory | false                  |
| --git      | -     | Initialize git repository    | false                  |

**Templates:**

- `starter`: Full project with pages, API, and layouts
- `minimal`: Minimal project with just a homepage
- `blog`: Blog project with markdown support

**Presets:**

- `standard`: Generic fetch handler for any platform (default)
- `node`: Node.js HTTP server (alias `node-server`)
- `cloudflare`: Cloudflare Workers (alias `cf`/`wrangler`)
- `vercel`: Vercel Serverless Functions (aliases `vercel-serverless`/`vercel-node`)
- `vercel-edge`: Vercel Edge Functions
- `netlify`: Netlify Serverless Functions (aliases `netlify-functions`/`netlify-node`)
- `bun`: Bun runtime with native TypeScript (alias `bun-runtime`)
- `deno`: Deno runtime with KV/cron/Queue (aliases `deno-deploy`/`deno-runtime`)

> Preset can also be auto-detected from `vercel.json`/`netlify.toml`/`deno.json`/`wrangler.toml` config files, `VERCEL`/`NETLIFY` environment variables, `globalThis.Deno`/`globalThis.Bun` runtime globals, or `package.json` dependencies.

**Examples:**

```bash
# Interactive mode
ubean init

# Non-interactive mode
ubean init --name my-app --template starter --preset node -y

# Create blog template
ubean init -n my-blog -t blog -y
```

### ubean dev

Start the development server with hot module replacement.

**Usage:**

```bash
ubean dev [options]
```

**Options:**

| Option  | Short | Description           | Default   |
| ------- | ----- | --------------------- | --------- |
| --port  | -p    | Server port           | 5173      |
| --host  | -     | Host to listen on     | localhost |
| --https | -     | Enable HTTPS          | false     |
| --open  | -     | Open browser on start | false     |

**Examples:**

```bash
# Start dev server on default port
ubean dev

# Start on custom port
ubean dev --port 9527 --host 0.0.0.0

# Open browser automatically
ubean dev --open
```

### ubean build

Build the application for production.

**Usage:**

```bash
ubean build [options]
```

**Options:**

| Option      | Short | Description               | Default  |
| ----------- | ----- | ------------------------- | -------- |
| --preset    | -p    | Build preset              | standard |
| --clean     | -     | Clean output before build | false    |
| --sourcemap | -     | Generate source maps      | false    |

**Examples:**

```bash
# Build with default preset
ubean build

# Build for Cloudflare
ubean build --preset cloudflare

# Build for Vercel
ubean build --preset vercel

# Build for Vercel Edge
ubean build --preset vercel-edge

# Build for Netlify
ubean build --preset netlify

# Build for Bun
ubean build --preset bun

# Build for Deno
ubean build --preset deno

# Build with source maps
ubean build --sourcemap
```

### ubean preview

Preview the production build locally.

**Usage:**

```bash
ubean preview [options]
```

**Options:**

| Option | Short | Description       | Default   |
| ------ | ----- | ----------------- | --------- |
| --port | -p    | Preview port      | 4173      |
| --host | -     | Host to listen on | localhost |

**Examples:**

```bash
# Preview on default port
ubean preview

# Preview on custom port
ubean preview --port 9527
```

### ubean config

Show resolved configuration.

**Usage:**

```bash
ubean config [options]
```

**Options:**

| Option | Short | Description                | Default |
| ------ | ----- | -------------------------- | ------- |
| --json | -     | Output as JSON             | false   |
| --env  | -     | Show environment variables | false   |

**Examples:**

```bash
# Show config in human-readable format
ubean config

# Show config as JSON
ubean config --json

# Show environment variables
ubean config --env
```

### ubean page

Scaffold a new page component.

**Usage:**

```bash
ubean page <name>
```

**Arguments:**

| Argument | Description                            |
| -------- | -------------------------------------- |
| `<name>` | Page name (e.g., "about", "blog/post") |

**Examples:**

```bash
# Create simple page
ubean page about

# Create nested page
ubean page "blog/post"

# Create with layout
ubean page dashboard --layout admin
```

### ubean devtools

Open the DevTools panel.

**Usage:**

```bash
ubean devtools
```

**Examples:**

```bash
# Open DevTools
ubean devtools
```

## Help Command

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

# Show help for specific command
ubean init --help
ubean dev --help
```

## Version Command

### ubean --version

Show current version.

**Usage:**

```bash
ubean --version
```

## Environment Variables

### Development

| Variable   | Description     | Default     |
| ---------- | --------------- | ----------- |
| UBEAN_PORT | Dev server port | 5173        |
| UBEAN_HOST | Dev server host | localhost   |
| NODE_ENV   | Environment     | development |

### Production

| Variable | Description | Default    |
| -------- | ----------- | ---------- |
| PORT     | Server port | 9527       |
| NODE_ENV | Environment | production |

## Exit Codes

| Code | Description       |
| ---- | ----------------- |
| 0    | Success           |
| 1    | General error     |
| 2    | Invalid arguments |
| 3    | Build failed      |
| 4    | Server error      |
