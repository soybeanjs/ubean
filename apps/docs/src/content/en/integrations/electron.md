---
title: Electron
---

# Electron (Desktop Apps)

`@ubean/electron` is ubean's **built-in desktop app module** that wraps [`vite-plugin-electron`](https://github.com/electron-vite/vite-plugin-electron) to provide Electron integration with sensible defaults. It handles main/preload/renderer build coordination, Hot Restart, Hot Reload, HMR, and auto-starts the desktop app on build completion.

## Features

- One-line enable: `electron: true` in `ubean.config.ts`
- Default main/preload entries (`electron/main.ts`, `electron/preload.ts`) — zero config to start
- Auto-disables SSR when enabled (desktop apps don't need SSR unless explicitly set)
- Full pass-through of vite-plugin-electron capabilities: Hot Restart, Hot Reload, HMR, auto-launch
- Type-safe configuration via `ElectronOptions` / `ElectronMainOptions` / `ElectronPreloadOptions`
- Custom Vite config injection for main/preload builds

## Installation

`@ubean/electron` is a built-in module. Install it as a dev dependency in your project:

```bash
pnpm add -D @ubean/electron electron
```

> `electron` is a peer dependency — you control its version. `@ubean/electron` supports Electron `^28` through `^37`.

## Configuration

### Minimal Setup (Defaults)

The simplest configuration uses default entries and auto-disables SSR:

```typescript
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  electron: true
});
```

This assumes:
- Main process entry: `electron/main.ts`
- Preload script entry: `electron/preload.ts`
- SSR: disabled (overridden to `false`)

### Custom Entries

Override defaults when your file layout differs:

```typescript
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  electron: {
    main: { entry: 'src/main/index.ts' },
    preload: { input: 'src/preload/index.ts' }
  }
});
```

### With Custom Vite Config

Pass additional Vite config to main/preload builds:

```typescript
import { defineConfig } from 'ubean';

export default defineConfig({
  electron: {
    main: {
      entry: 'electron/main.ts',
      vite: {
        build: { rollupOptions: { external: ['better-sqlite3'] } }
      }
    },
    preload: {
      input: 'electron/preload.ts',
      vite: {
        build: { rollupOptions: { external: ['electron'] } }
      }
    },
    renderer: {
      nodeIntegration: false
    }
  }
});
```

### Keep SSR Enabled

If you need SSR alongside Electron (rare), explicitly set `ssr: true`:

```typescript
export default defineConfig({
  ssr: true, // overrides electron's auto-disable
  electron: true
});
```

## Project Structure

A typical ubean + Electron project:

```
my-app/
├── electron/                  # Electron entry files (matches defaults)
│   ├── main.ts               # Main process entry
│   └── preload.ts            # Preload script entry
├── src/                       # ubean app source
│   ├── pages/
│   ├── routes/
│   ├── layouts/
│   └── ...
├── ubean.config.ts           # Framework config (electron: true)
├── package.json
└── electron-builder.yml      # Packaging config (optional, for distribution)
```

## Main Process Example

```typescript
// electron/main.ts
import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // In dev, load the Vite dev server
  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    // In production, load the built index.html
    win.loadFile(join(__dirname, '../dist/client/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

## Preload Script Example

```typescript
// electron/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

// Expose a typed API to the renderer
contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  onMenuAction: (callback: (action: string) => void) =>
    ipcRenderer.on('menu:action', (_event, action) => callback(action))
});
```

## Renderer Usage

Access the exposed API in your Vue components:

```vue
<script setup lang="ts">
// Type the global API
declare global {
  interface Window {
    electronAPI: {
      getVersion: () => Promise<string>;
      onMenuAction: (callback: (action: string) => void) => void;
    };
  }
}

const version = ref('');

onMounted(async () => {
  version.value = await window.electronAPI.getVersion();
});
</script>

<template>
  <div>App version: {{ version }}</div>
</template>
```

## How It Works

`@ubean/electron` is a thin wrapper around `vite-plugin-electron/simple`. The plugin:

1. **Builds the main process** (`electron/main.ts` → `dist/main/index.js`) with Node.js target
2. **Builds the preload script** (`electron/preload.ts` → `dist/preload/index.js`) with Electron renderer context
3. **Coordinates with the renderer build** — your ubean app's client build becomes the renderer
4. **Auto-starts Electron** in dev mode via `electron .` after builds complete
5. **Provides HMR** — changes to main/preload trigger Hot Restart; renderer changes use standard Vite HMR

## SSR Behavior

When `electron: true` is set and `ssr` is not explicitly configured, ubean automatically sets `ssr: false`. This is because:

- Desktop apps render locally — there's no server-side rendering benefit
- Disabling SSR simplifies the build (no SSR bundle to manage)
- The renderer loads from Vite dev server (dev) or built static files (production)

To keep SSR enabled (e.g., for a hybrid app that also runs as a web service), explicitly set `ssr: true`.

## Programmatic API

```typescript
import {
  ubeanElectronPlugin,
  defineElectronConfig,
  DEFAULT_MAIN_ENTRY,
  DEFAULT_PRELOAD_INPUT
} from '@ubean/electron';

import type {
  ElectronOptions,
  ElectronMainOptions,
  ElectronPreloadOptions,
  ElectronRendererOptions
} from '@ubean/electron';

// Use defaults directly
const defaultEntry = DEFAULT_MAIN_ENTRY;       // 'electron/main.ts'
const defaultPreload = DEFAULT_PRELOAD_INPUT;   // 'electron/preload.ts'

// Type-safe config helper
const config = defineElectronConfig({
  main: { entry: 'electron/main.ts' },
  preload: { input: 'electron/preload.ts' }
});
```

> Usually you don't need to call `ubeanElectronPlugin` directly — the module system loads it automatically when `electron: true` is set in `ubean.config.ts`. Use this API only when integrating manually in a custom Vite config.

## Packaging

`@ubean/electron` handles the build pipeline but does not package the app for distribution. Use [`electron-builder`](https://www.electron.build/) for packaging:

```bash
pnpm add -D electron-builder
```

```yaml
# electron-builder.yml
appId: com.example.myapp
directories:
  output: dist-electron
files:
  - dist/client/**/*
  - dist/main/**/*
  - dist/preload/**/*
mac:
  category: public.app-category.developer-tools
  target: dmg
win:
  target: nsis
linux:
  target: AppImage
```

```json
// package.json
{
  "scripts": {
    "build:electron": "ubean build && electron-builder"
  }
}
```

## Best Practices

1. **Use default entries**: Stick with `electron/main.ts` and `electron/preload.ts` unless you have a strong reason to deviate — it keeps the project structure predictable.

2. **Enable contextIsolation**: Always set `contextIsolation: true` and `nodeIntegration: false` in BrowserWindow webPreferences. Expose only what's needed via `contextBridge`.

3. **Keep main process lean**: The main process should only handle window lifecycle, IPC, and native OS integration. Business logic belongs in the renderer or ubean's server runtime.

4. **External native modules**: If you use native modules like `better-sqlite3` or `node-pty`, mark them as external in the main process Vite config and rebuild them for Electron with `electron-rebuild`.

5. **Don't enable SSR unless needed**: Desktop apps almost never need SSR. Let `@ubean/electron` auto-disable it.

6. **Type the preload bridge**: Always declare types for `window.electronAPI` to get end-to-end type safety between main and renderer.
