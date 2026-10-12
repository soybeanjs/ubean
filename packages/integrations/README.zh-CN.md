# @ubean/integrations

**[English](./README.md) | 中文**

ubean 的薄集成包 —— PWA、fonts、Electron、`@vean/ui` 与 Pinia，各自独立子路径。

```ts
import { definePwaConfig, defineGoogleFont, serializePiniaState } from '@ubean/integrations';
```

## 目录

- [@ubean/integrations](#ubeanintegrations)
  - [包定位](#包定位)
  - [安装](#安装)
  - [快速开始](#快速开始)
  - [PWA](#pwa)
  - [Fonts](#fonts)
  - [Electron](#electron)
  - [UI](#ui)
  - [Pinia](#pinia)
  - [类型安全](#类型安全)
  - [架构说明](#架构说明)

## 包定位

| 分层                            | 职责                                          |
| ------------------------------- | --------------------------------------------- |
| `@ubean/integrations`（主入口） | 五个集成的浏览器安全运行时与类型              |
| `@ubean/integrations/pwa`       | 封装 `vite-plugin-pwa` + workbox 的 Vite 插件 |
| `@ubean/integrations/fonts`     | 扫描、解析并自托管字体文件的 Vite 插件        |
| `@ubean/integrations/electron`  | 封装 `vite-plugin-electron` 的 Vite 插件      |
| `@ubean/integrations/ui`        | 注册 `@vean/ui` 解析器与样式的 Vite 插件      |
| `@ubean/integrations/pinia`     | dev 预构建插件，SSR 状态辅助函数则在主入口    |

**包含：**

- 五个独立集成合并进一个包，各自拥有子路径 —— 只启用你需要的部分。
- 主入口提供浏览器安全的运行时导出（`usePwa`、`registerSW`、`useFonts`、`serializePiniaState` 等）。
- 配置辅助函数（`definePwaConfig`、`defineGoogleFont`、`defineElectronConfig`、`defineUiConfig`、`definePiniaConfig`），让选项在书写处就获得类型检查。

**不包含**（刻意为之）：

- 不重新实现被封装工具。`vite-plugin-pwa`、`vite-plugin-electron`、`@vean/ui`、`pinia` 仍是真正的实现；本包只负责把它们接进 ubean 的模块系统。
- 不重导出组件。`@vean/ui` 组件请直接从 `@vean/ui` 导入 —— `@ubean/integrations/ui` 注册解析器，不代理该组件库。
- 不重导出 Pinia API。`createPinia` / `defineStore` 来自 `pinia`。
- 不含图片管线，也不含内容集合。它们分别是 `@ubean/image` 与 `@ubean/content`。
- 不含应用级 service worker 逻辑。PWA 提供 manifest、注册入口与缓存策略；默认不缓存业务数据。

**运行时依赖白名单（主入口）：** `@ubean/build`、`defu`、`ohash`、`vite-plugin-electron`、`vite-plugin-pwa`。

**可选 peer：** `@vean/ui`（`>=0.50.0-0`）、`electron`（`^28`–`^37`）、`pinia`（`^2 || ^3`）、`vite`（`^5 || ^6 || ^7`）、`vue`（`^3`）。各集成独立降级：缺少 peer 时对应插件只是不被加载，包的其他部分与应用继续正常工作。

## 安装

```bash
# 包本体 —— 提供全部集成
pnpm add @ubean/integrations

# peer，只为你启用的集成安装
pnpm add -D @vean/ui            # ui
pnpm add -D electron            # electron
pnpm add pinia                  # pinia
```

## 快速开始

**1. 启用需要的集成**

```ts
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  pwa: true,
  fonts: {
    families: [{ name: 'Inter', provider: 'google', weights: [400, 700] }]
  },
  ui: true,
  pinia: true
  // electron: true
});
```

每个字段都接受 `true`（使用默认值）或选项对象（完整控制）。

**2. 逐个配置**

需要显式控制时，可以直接导入 Vite 插件 —— 它们全部位于子路径，绝不出现在主入口。

```ts
import { ubeanElectronPlugin, defineElectronConfig } from '@ubean/integrations/electron';
import { ubeanFontsPlugin } from '@ubean/integrations/fonts';
import { ubeanPiniaPlugin, definePiniaConfig } from '@ubean/integrations/pinia';
import { ubeanPwaPlugin, definePwaConfig } from '@ubean/integrations/pwa';
import { ubeanUiPlugin, defineUiConfig } from '@ubean/integrations/ui';

export default defineConfig({
  plugins: [
    ubeanPwaPlugin(definePwaConfig({ registerType: 'prompt' })),
    ubeanFontsPlugin({ families: [{ name: 'Inter', provider: 'google' }] }),
    ubeanElectronPlugin(defineElectronConfig({ main: { entry: 'electron/main.ts' } })),
    ubeanUiPlugin(defineUiConfig({ css: true })),
    ubeanPiniaPlugin(definePiniaConfig({ optimizeDeps: true }))
  ]
});
```

## PWA

`@ubean/integrations/pwa` 封装 `vite-plugin-pwa` + workbox：生成 Web App Manifest 与 service worker，并在客户端注册。

```ts
import { usePwa } from '@ubean/integrations';

const { needRefresh, isOfflineReady, isInstalled, updateServiceWorker } = usePwa();
```

| 导出                                 | 说明                                                                                                                                                              |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ubeanPwaPlugin(options)`            | Vite 插件。`enabled: false` 时返回 noop 插件。                                                                                                                    |
| `definePwaConfig(options)`           | 带类型的 `PwaOptions` 辅助函数。                                                                                                                                  |
| `toVitePwaOptions(options)`          | 把 `PwaOptions` 转换为 `vite-plugin-pwa` 的选项。                                                                                                                 |
| `usePwa(options?)`                   | 响应式 `{ isInstalled, isUpdateAvailable, isOfflineReady, needRefresh, registration }`，以及 `register` / `updateServiceWorker` / `skipWaiting` / `closePrompt`。 |
| `registerSW(swUrl?, options?)`       | 手动注册 service worker（默认 `/sw.js`）。                                                                                                                        |
| `updateSW()` / `getSWRegistration()` | 对等待中的 worker 触发 `SKIP_WAITING` / 读取当前注册。                                                                                                            |

`PwaOptions` 覆盖 `manifest`（`WebAppManifest` 的 partial）、`registerType`（`'autoUpdate' | 'prompt' | 'manual'`）、`injectRegister`（`'auto' | 'script' | 'inline' | null`）、`devOptions` 以及 workbox 选项。缓存行为由 `CachingStrategy`（`'cache-first' | 'network-first' | 'stale-while-revalidate' | 'network-only' | 'cache-only'`）与 `RuntimeCachingRule` 表达。

## Fonts

`@ubean/integrations/fonts` 对标 Nuxt Fonts。构建时会扫描 CSS 与 Vue SFC 中实际用到的 `font-family` 声明，按 `local -> provider` 顺序解析，并把用到的字体以带 hash 的公开资源自托管。`@font-face` 规则、unicode range、`font-display: swap` 与 preload 提示都会自动生成；可选的字体度量回退用于降低 CLS。

```ts
import { defineGoogleFont, defineLocalFont } from '@ubean/integrations';

const families = [
  defineGoogleFont({ families: { Inter: { weights: [400, 700] } } }),
  defineLocalFont({ name: 'Brand', src: './src/assets/brand.woff2', weights: [400] })
];
```

插件暴露虚拟模块 `virtual:ubean-fonts`，导出 `preconnectLinks`、`stylesheetLinks`、`preloadLinks` 与 `fontCSS`（均为响应式），以及 `useFonts()` composable。

| 分组          | 导出                                                                                                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 运行时配置    | `configureFontsRuntime`、`getFontsConfig`、`defineFontFamily`、`getFontFamilies`、`getFontHash`                                                                      |
| 链接/CSS 生成 | `generateFontLinks`、`generateFontCSS`、`generateFontFace`、`generateFontCSSVariable`、`generateFontFallbackCSS`、`generatePreloadLink`、`generatePreconnectLink`    |
| provider URL  | `getGoogleFontsUrl`、`getBunnyFontsUrl`、`getFontshareUrl`                                                                                                           |
| CSS 解析      | `parseFontFamilyCSS`、`extractFontUrlsFromCSS`、`normalizeFontFamily`、`normalizeFontName`、`weightsToString`                                                        |
| 默认值与度量  | `defaultFontWeights`（`[400]`）、`defaultFontStyles`、`defaultFontSubsets`、`defaultFontDisplay`（`'swap'`）、`fallbackFonts`、`googleFontMetrics`、`createFontHash` |

`FontProvider` 为 `'google' | 'local' | 'bunny' | 'fontshare' | 'custom'`；`FontDisplay` 为 `'auto' | 'block' | 'swap' | 'fallback' | 'optional'`；`FontSubset` 覆盖 Google 标准子集以及 `chinese-simplified`、`chinese-traditional`、`japanese`、`korean`。

## Electron

`@ubean/integrations/electron` 封装 `vite-plugin-electron`，自带默认入口，`electron: true` 即可启动。

```ts
// ubean.config.ts
export default defineConfig({
  electron: {
    main: { entry: 'electron/main.ts' },
    preload: { input: 'electron/preload.ts' },
    renderer: { nodeIntegration: false }
  }
});
```

| 导出                            | 说明                                            |
| ------------------------------- | ----------------------------------------------- |
| `ubeanElectronPlugin(options)`  | Vite 插件（异步 —— 返回 `Promise<Plugin[]>`）。 |
| `defineElectronConfig(options)` | 带类型的 `ElectronOptions` 辅助函数。           |
| `DEFAULT_MAIN_ENTRY`            | `'electron/main.ts'`                            |
| `DEFAULT_PRELOAD_INPUT`         | `'electron/preload.ts'`                         |

`ElectronMainOptions` / `ElectronPreloadOptions` 接受 `vite` 透传配置，用于额外的打包调整。Hot Restart、Hot Reload、HMR 与自动启动由底层插件提供。

> 启用 Electron 会把 `ssr` 默认改为 `false` —— 桌面应用无需 SSR，除非你显式设置 `ssr: true`。

## UI

`@ubean/integrations/ui` 注册 `@vean/ui` 组件解析器，并默认把预构建样式注入客户端入口。

```ts
// ubean.config.ts —— 预构建 CSS（默认）
export default defineConfig({ ui: true });

// ubean.config.ts —— UnoCSS 模式，不注入 styles.css
export default defineConfig({ ui: { css: false } });
```

`S*` 组件（`SButton`、`SInput`、`SConfigProvider` 等）在首次使用时自动导入。UnoCSS 模式下需自备 `@vean/unocss` preset 并安装 `pnpm add -D @vean/unocss`。手动接线插件时可用 `ubeanUiPlugin(options)` / `defineUiConfig(options)`。

## Pinia

`@ubean/integrations/pinia` 做两件事：把 `pinia` 加入 dev 的 `optimizeDeps.include`，以及提供 `defineApp` 使用的 SSR 状态辅助函数。

```ts
import { serializePiniaState, hydratePiniaState } from '@ubean/integrations';
// src/app.ts
import { createPinia } from 'pinia';

export default defineApp({
  plugins: [createPinia()],
  serializeState: serializePiniaState,
  hydrateState: hydratePiniaState
});
```

| 导出                            | 说明                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------- |
| `ubeanPiniaPlugin(options)`     | Vite 插件。`enabled: false` 时返回 noop 插件。                                   |
| `definePiniaConfig(options)`    | 带类型的 `UbeanPiniaOptions` 辅助函数。                                          |
| `serializePiniaState(app)`      | 从 `app.config.globalProperties.$pinia` 读取根 state。未安装 Pinia 时返回 `{}`。 |
| `hydratePiniaState(app, state)` | 把此前序列化的 state 写回。`state` 为 `null` 或无 `pinia` 字段时是 no-op。       |

## 类型安全

- 每个配置辅助函数（`definePwaConfig`、`defineGoogleFont`、`defineLocalFont`、`defineFontFamily`、`defineElectronConfig`、`defineUiConfig`、`definePiniaConfig`）都是带类型的恒等函数 —— 选项在你书写处就被检查，而不是在被消费处。
- `PwaState` 与 `usePwa()` 返回的响应式 ref 共用同一形状，state 对象可以直接透传而无需重构。
- `CachingStrategy`、`DisplayMode`、`ManifestOrientation`、`FontProvider`、`FontDisplay`、`FontSubset`、`FontWeight` 均为导出的联合类型 —— 不需要魔法字符串。
- `PiniaSerializedState` 为经由 `defineApp({ serializeState, hydrateState })` 传递的对象提供类型。

## 架构说明

- **一个包，五个子路径。** 每个集成可独立启用，因此只需要字体的项目不会把 Electron 插件拉进配置图。
- **插件在子路径，运行时在主入口。** 主入口只重导出浏览器安全的运行时与类型，客户端产物因此不含构建期工具。
- **一切都是薄封装。** 行为由第三方工具拥有；本包只负责接入 ubean 的模块注册表（`registerComponentResolver`、`registerCssImport`、`optimizeDeps`）。
- **独立降级。** 缺少某个可选 peer 只会让一个集成失效。未安装 `@vean/ui` 时 `ui: true` 仅在该插件处失败。
- **SSR 辅助函数与框架无关。** `serializePiniaState` / `hydratePiniaState` 是作用于 Vue app 实例的纯函数，不导入 Pinia 内部实现。
- **字体按设计自托管。** 构建期下载字体，首次生产访问不依赖第三方字体服务。
