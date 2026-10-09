---
title: Electron
description: 使用内置的 @ubean/integrations/electron 集成构建 Electron 桌面应用。
translatedFrom: 387781227438
sections: ["c6635ad1","e3b0c442","2971830a","458fcc3a","9f9a418c","37f210b4","2a4cc00f","98872d2b","8981ae7f","9504519b","0c73144c","8deb2877","89ca0bdd","9f9a879c","6de452a8","a27a733e","4218a60e","49dfd2e7","5cd85299","5d36db6f"]
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

`@ubean/integrations/electron`是一个薄薄的包裹`vite-plugin-electron/simple`。插件：

1. **构建主进程**（`electron/main.ts` → `dist/main/index.js`）与Node.js目标
2. **构建预加载脚本**（`electron/preload.ts` → `dist/preload/index.js`），并带有Electron渲染器上下文
3. **与渲染器构建协调** —— 你的 ubean 应用客户端构建就是渲染器
4. **构建完成后通过`electron .`自动启动Electron**
5. **提供 HMR** —— 主进程/预加载脚本的改动触发 Hot Restart；渲染器改动走标准 Vite HMR
6. **移除 `vite-plugin-electron` 写入的项目根目录占位 `index.html`**

### 多出来的根 `index.html`

`vite-plugin-electron` 通过三个来源判断 Vite 是否有入口：`build.rollupOptions.input`、`build.lib`，或项目根目录下已存在的 `index.html`。ubean 三者都不提供 —— 它的入口是**按环境**声明的（`environments.client.build.rollupOptions.input`），而且 dev 下的客户端入口是虚拟模块（`virtual:ubean-client-entry`）。于是每次 `ubean dev`，插件都会往项目根目录写一份 178 字节的占位 `index.html`。

这个文件从来没被用到：`GET /` 由 ubean 的 SSR 管道响应，`GET /index.html` 返回 404。它唯一出现的地方是 `git status`。

而且这个过程是**静默**的 —— 插件自己打的 `No entry found, writing mock ...` 被 ubean 的日志闸门归入信息类输出，默认隐藏，不会有任何提示告诉你它发生了。并且 `vite-plugin-electron` 只在优雅退出时清理：硬杀（`SIGKILL`、崩溃、从 IDE 停任务）会把占位文件留下，而它与下一次运行要写入的内容逐字节相同，因此会一直存活。

ubean 会替你删掉它。一个注册在 `vite-plugin-electron` 之后的插件会在 `configResolved` 里删除该文件，但**只在内容与官方 mock 逐字节相同时**才删 —— 你自己写的根 `index.html` 永远不会被碰。dev server 不依赖这个文件，任何时候手动删除都可以。

## SSR 行为

当设置了 `electron: true` 且未显式配置 `ssr` 时，ubean 会自动设 `ssr: false`。原因：

- 桌面应用在本地渲染，服务端渲染没有收益
- 关掉 SSR 能简化构建（不用管理 SSR bundle）
- 渲染器从 Vite dev server（dev）或构建出的静态文件（生产）加载

若要保持 SSR 开启（例如同时作为 Web 服务运行的混合应用），显式设置 `ssr: true`。

## 编程式 API

```typescript
import {
  ubeanElectronPlugin,
  defineElectronConfig,
  DEFAULT_MAIN_ENTRY,
  DEFAULT_PRELOAD_INPUT,
  createElectronIndexHtmlCleanupPlugin,
  isVitePluginElectronMock,
  ELECTRON_INDEX_CLEANUP_PLUGIN_NAME
} from '@ubean/integrations/electron';

import type {
  ElectronOptions,
  ElectronMainOptions,
  ElectronPreloadOptions,
  ElectronRendererOptions
} from '@ubean/integrations/electron';

// Use defaults directly
const defaultEntry = DEFAULT_MAIN_ENTRY;       // 'electron/main.ts'
const defaultPreload = DEFAULT_PRELOAD_INPUT;   // 'electron/preload.ts'

// Type-safe config helper
const config = defineElectronConfig({
  main: { entry: 'electron/main.ts' },
  preload: { input: 'electron/preload.ts' }
});
```

`ubeanElectronPlugin()` 已经自动附加了清理插件；只有在你手动把封装集成进自定义 Vite 配置时，才需要下面这几个导出：

| 导出 | 用途 |
| --- | --- |
| `createElectronIndexHtmlCleanupPlugin()` | `apply: 'serve'` 插件，负责删除该占位文件。 |
| `isVitePluginElectronMock(content)` | 判断字符串是否为 `vite-plugin-electron` 的占位内容，可用于你自己的清理逻辑。 |
| `VITE_PLUGIN_ELECTRON_MOCK_INDEX_HTML` | 占位内容原文，用于逐字节比对。 |
| `ELECTRON_INDEX_CLEANUP_PLUGIN_NAME` | `'ubean:electron:index-html-cleanup'`，用于在插件列表中定位它。 |

> 通常你不需要直接调用 `ubeanElectronPlugin` —— 模块系统会在 `ubean.config.ts` 设置 `electron: true` 时自动加载它。只有手动集成自定义 Vite 配置时才用这个 API。

## 打包

`@ubean/integrations/electron` 负责构建流程，但不打包应用进行分发。使用 [`electron-builder`](https://www.electron.build/) 进行打包：

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

1. **使用默认条目**：除非有充分理由偏离，否则坚持使用`electron/main.ts`和`electron/preload.ts`——这样能保持项目结构的可预测性。

2. **启用上下文隔离**：始终在浏览器窗口的 webPreferences 中设置 `contextIsolation: true` 和 `nodeIntegration: false`。只通过 `contextBridge` 暴露所需的内容。

3. **保持主进程精简**：主进程应仅处理窗口生命周期、IPC和原生操作系统集成。业务逻辑应属于渲染器或Ubean的服务器运行时。

4. **外部原生模块**：如果你使用`better-sqlite3`或`node-pty`等原生模块，请在主进程的Vite配置中标记为外部，然后用`electron-rebuild`重建它们用于Electron。

5. **只有在需要时才启用SSR**：桌面应用几乎不需要SSR。让`@ubean/integrations/electron`自动禁用SSR。

6. **输入预加载桥**：始终为`window.electronAPI`声明类型，以实现主渲染器和渲染器之间的端到端类型安全。
