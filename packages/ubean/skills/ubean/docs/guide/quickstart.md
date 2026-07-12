# Quick Start

Get started with uBean in minutes.

## Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0 (recommended)

## Create a Project

### Interactive Mode

```bash
pnpm create ubean@0.0.1
```

Follow the prompts to configure your project.

### Non-Interactive Mode

```bash
pnpm create ubean@0.0.1 my-app --template starter --preset node -y
```

## Project Structure

```
my-app/
├── src/
│   ├── routes/           # API routes
│   │   └── api/          # API endpoints
│   ├── pages/            # Page components
│   ├── layouts/          # Layout components
│   ├── middleware/       # Middleware
│   ├── composables/      # Vue composables
│   ├── components/       # Vue components
│   └── locales/          # Translation files
├── ubean.config.ts       # Framework config
└── package.json
```

## Development

Start the development server:

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

## Next Steps

- [Pages and Routing](/docs/guide/pages-routing/overview)
- [API Routes](/docs/guide/api-routes)
- [Internationalization](/docs/guide/i18n)
- [Islands Architecture](/docs/guide/islands)
