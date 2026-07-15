# Quick Start

Get started with ubean in minutes.

## Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0 (recommended)

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
│   ├── layouts/          # Layout components (xx.vue or xx/index.vue)
│   ├── middleware/       # Middleware (numeric prefix ordering)
│   ├── components/       # Auto-imported Vue components
│   ├── composables/      # Auto-imported composables
│   ├── locales/          # i18n messages (en.json, zh.json, etc.)
│   ├── crons/            # Cron jobs (defineScheduled)
│   ├── queues/           # Queue workers (defineQueue)
│   └── plugins/          # Runtime plugins
├── public/               # Static assets
├── .ubean/                # Auto-generated types
├── ubean.config.ts       # Framework config (defineConfig)
├── app.ts                # Vue app config (defineApp)
├── env.ts                # Environment schema (defineEnv)
└── package.json
```

## Development

Start the development server (Vite middleware mode):

```bash
cd my-app
pnpm install
pnpm dev
```

Visit `http://localhost:5173` to see your application.

## Building for Production

```bash
pnpm build
```

The build output will be in the `.output` directory.

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
    "prepare": "ubean prepare",
    "typecheck": "vue-tsc --noEmit"
  }
}
```

## Next Steps

- [Pages and Routing](/docs/guide/pages-routing/overview)
- [API Routes](/docs/guide/api-routes)
- [Internationalization](/docs/guide/i18n)
- [Islands Architecture](/docs/guide/islands)
