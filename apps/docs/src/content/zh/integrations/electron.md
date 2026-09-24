---
title: Electron
description: 使用内置的 @ubean/integrations/electron 集成构建 Electron 桌面应用。
translatedFrom: 8a30f8cd46bb
sections: ["c6635ad1","e3b0c442","2971830a","458fcc3a","9f9a418c","37f210b4","2a4cc00f","98872d2b","8981ae7f","9504519b","0c73144c","8deb2877","89ca0bdd","9f9a879c","59c3d8b7","4218a60e","9328cd8c","5cd85299","5d36db6f"]
---

# Electron（桌面应用）

`@ubean/integrations/electron` 是 ubean 的**内置桌面应用集成**，它封装了 [`vite-plugin-electron`](https://github.com/electron-vite/vite-plugin-electron)，配好合理的默认值即可接入 Electron。它负责协调 main/preload/renderer 三者的构建，处理 Hot Restart、Hot Reload 与 HMR，并在构建完成后自动启动桌面应用。

## 特性

- 一行启用：在 `ubean.config.ts` 中写 `electron: true`
- 默认 main/preload 入口（`electron/main.ts`、`electron/preload.ts`）—— 零配置即可开始
- 启用时自动关闭 SSR（桌面应用不需要 SSR，除非显式声明）
- 完整透传 vite-plugin-electron 的能力：Hot Restart、Hot Reload、HMR、自动启动
- 通过 `ElectronOptions` / `ElectronMainOptions` / `ElectronPreloadOptions` 获得类型安全配置
- 可为 main/preload 构建注入自定义 Vite 配置

## 安装

`@ubean/integrations/electron` 是内置集成（`@ubean/integrations` 的子路径）。在项目中作为开发依赖安装：

```bash
pnpm add -D @ubean/integrations/electron electron
```

> `electron` 是 peer dependency —— 版本由你控制。`@ubean/integrations/electron` 支持 Electron `^28` 到 `^37`。

## 配置

### 最小配置（使用默认值）

最简配置直接使用默认入口，并自动关闭 SSR：

```typescript
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  electron: true
});
```

这隐含以下约定：
- 主进程入口：`electron/main.ts`
- preload 脚本入口：`electron/preload.ts`
- SSR：关闭（被覆盖为 `false`）

### 自定义入口

文件布局与默认约定不同时，覆盖默认值即可：

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

### 搭配自定义 Vite 配置

向 main/preload 构建传入额外的 Vite 配置：

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

### 保留 SSR

如果确实需要在 Electron 的同时保留 SSR（少见），显式设置 `ssr: true`：

```typescript
export default defineConfig({
  ssr: true, // 覆盖 electron 的自动关闭
  electron: true
});
```

## 项目结构

一个典型的 ubean + Electron 项目：

```
my-app/
├── electron/                  # Electron 入口文件（与默认约定一致）
│   ├── main.ts               # 主进程入口
│   └── preload.ts            # preload 脚本入口
├── src/                       # ubean 应用源码
│   ├── pages/
│   ├── routes/
│   ├── layouts/
│   └── ...
├── ubean.config.ts           # 框架配置（electron: true）
├── package.json
└── electron-builder.yml      # 打包配置（可选，用于分发）
```

## 主进程示例

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

  // 开发态加载 Vite dev server
  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    // 生产态加载构建出的 index.html
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

## preload 脚本示例

```typescript
// electron/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

// 向渲染进程暴露带类型的 API
contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  onMenuAction: (callback: (action: string) => void) =>
    ipcRenderer.on('menu:action', (_event, action) => callback(action))
});
```

## 渲染进程用法

在 Vue 组件中访问暴露出来的 API：

```vue
<script setup lang="ts">
// 为全局 API 声明类型
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

## 工作原理

`@ubean/integrations/electron` 是对 `vite-plugin-electron/simple` 的薄封装。该插件会：

1. **构建主进程**（`electron/main.ts` → `dist/main/index.js`），目标为 Node.js
2. **构建 preload 脚本**（`electron/preload.ts` → `dist/preload/index.js`），使用 Electron 渲染进程上下文
3. **与渲染进程构建协同** —— 你的 ubean 应用的客户端构建产物即渲染进程
4. **自动启动 Electron** —— dev 模式下构建完成后执行 `electron .`
5. **提供 HMR** —— main/preload 的改动触发 Hot Restart；渲染进程的改动走标准 Vite HMR

## SSR 行为

设置了 `electron: true` 且未显式配置 `ssr` 时，ubean 会自动把 `ssr` 设为 `false`。原因在于：

- 桌面应用在本地渲染 —— 服务端渲染带不来收益
- 关闭 SSR 可简化构建（不必再管理 SSR bundle）
- 渲染进程从 Vite dev server（开发态）或构建出的静态文件（生产态）加载

若希望保留 SSR（例如同时作为 Web 服务运行的混合应用），显式设置 `ssr: true`。

## 编程式 API

```typescript
import {
  ubeanElectronPlugin,
  defineElectronConfig,
  DEFAULT_MAIN_ENTRY,
  DEFAULT_PRELOAD_INPUT
} from '@ubean/integrations/electron';

import type {
  ElectronOptions,
  ElectronMainOptions,
  ElectronPreloadOptions,
  ElectronRendererOptions
} from '@ubean/integrations/electron';

// 直接使用默认值
const defaultEntry = DEFAULT_MAIN_ENTRY;       // 'electron/main.ts'
const defaultPreload = DEFAULT_PRELOAD_INPUT;   // 'electron/preload.ts'

// 类型安全的配置辅助函数
const config = defineElectronConfig({
  main: { entry: 'electron/main.ts' },
  preload: { input: 'electron/preload.ts' }
});
```

> 通常不需要直接调用 `ubeanElectronPlugin` —— 当 `ubean.config.ts` 中设置了 `electron: true` 时，模块系统会自动加载它。只有在自定义 Vite 配置中手动集成时才需要用到这套 API。

## 打包

`@ubean/integrations/electron` 只负责构建流水线，不负责把应用打成可分发的安装包。打包请使用 [`electron-builder`](https://www.electron.build/)：

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

## 最佳实践

1. **使用默认入口**：除非有充分理由，否则就用 `electron/main.ts` 和 `electron/preload.ts` —— 这样项目结构更可预期。

2. **启用 contextIsolation**：BrowserWindow 的 webPreferences 中始终设置 `contextIsolation: true` 与 `nodeIntegration: false`，只通过 `contextBridge` 暴露必要的能力。

3. **保持主进程精简**：主进程只应处理窗口生命周期、IPC 与原生系统集成。业务逻辑放在渲染进程或 ubean 的服务端运行时里。

4. **外部化原生模块**：若使用 `better-sqlite3`、`node-pty` 这类原生模块，请在主进程的 Vite 配置中把它们标记为 external，并用 `electron-rebuild` 针对 Electron 重新编译。

5. **只在需要时启用 SSR**：桌面应用几乎不需要 SSR，交给 `@ubean/integrations/electron` 自动关闭即可。

6. **为 preload 桥接声明类型**：始终为 `window.electronAPI` 声明类型，这样 main 与 renderer 之间才有端到端的类型安全。
