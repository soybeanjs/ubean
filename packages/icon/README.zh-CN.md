# @ubean/icon

**[English](./README.md) | 中文**

ubean 的 Iconify 集成 —— 构建时扫描、可摇树优化的图标引擎，支持 SVG 与 CSS 两种渲染模式、自定义集合，以及 API 回退。

```vue
<script setup lang="ts">
import { Icon } from '@ubean/icon';
</script>

<template>
  <Icon name="mdi:home" size="1.25em" />
  <Icon name="mdi:bell" flip="horizontal" :rotate="90" />
  <Icon name="mdi:loading" mode="css" />
</template>
```

## 目录

- [包定位](#包定位)
- [安装](#安装)
- [快速开始](#快速开始)
- [Icon 组件](#icon-组件)
- [Iconify 集合](#iconify-集合)
- [自定义与本地集合](#自定义与本地集合)
- [运行时加载](#运行时加载)
- [dev 服务路由](#dev-服务路由)
- [类型安全](#类型安全)
- [架构说明](#架构说明)

## 包定位

`@ubean/icon` 是**图标引擎**：把图标名解析为数据、生成 SVG / CSS 输出，并拥有集合注册能力：

| 层                    | 职责                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `@ubean/icon`（本包） | `Icon` 组件、名称解析、集合注册与 loader、SVG 生成、CSS 模式、SFC 图标扫描、`/_iconify` dev 路由、API 回退 |
| `@ubean/build`        | 提供插件挂载的 Vite 流水线；模块启用时从 `@ubean/icon/vite` 加载图标插件                                   |
| `@vean/ui`（`SIcon`） | 绑定设计系统的带样式 UI 图标组件；使用同样的 Iconify 命名，但是带主题尺寸与颜色的另一个组件                |
| `@ubean/config`       | 持有内置模块开关（`icon: boolean \| UbeanIconOptions`），默认关闭                                          |

**包含：**

- `<Icon>`（内部组件名 `UbeanIcon`），支持 `svg` 与 `css` 渲染模式、翻转 / 旋转变换与内联尺寸
- `useIcon(name)` —— 编程式访问，同时返回异步与同步的 SVG getter
- 运行时集合 API：`registerCollection`、`registerCollectionLoader`、`loadCollection`、`getLoadedCollection`、`listLoadedCollections`、`clearCollections`
- 图标解析：`getIcon`、`getIconSync`、`getIconData`、`resolveIconData`、`resolveAlias`、`parseIconName`、`normalizeIconName`
- 渲染辅助：`generateSvg`、`buildIconCssIcon`、`escapeHtml`、`parseSvgToIconData`、`createCollectionFromSvgMap`
- 编写辅助：`defineIconCollection`、`defineIconCollectionLoader`
- 扫描：`scanVueSfcForIcons`、`getScannedIcons`
- API 回退：`fetchIconFromApi`
- `@ubean/icon/vite` 处的 Vite 插件：`ubeanIconPlugin`、`addIconCollection`

**不包含**（由邻近包负责）：

- 面向设计系统的带主题 / 带样式图标（`@vean/ui` 的 `SIcon`）
- 图标名自动补全或浏览集合的 CLI —— 请改为安装 `@iconify-json/<collection>` 包
- Iconify API 的运行时 HTTP 缓存 / CDN 行为（那是 API 自身的职责）
- UnoCSS 图标预设（CSS class 形式的图标由 `@vean/unocss` 或 `unocss` 预设处理）

**运行时依赖白名单（主入口）：`defu`、`pathe`。** 入口承载浏览器组件，从不导入 `node:fs`；Vite 插件正因如此才位于 `@ubean/icon/vite` 之后。

**optional peer：** `vue` —— `Icon` 组件需要它；`vite` —— `@ubean/icon/vite` 插件需要它。缺少 `vite` 时仅退化为编程式 API；缺少 `vue` 时失去组件，但运行时与构建时扫描仍然可用。

## 安装

```bash
pnpm add @ubean/icon
# optional peers (loaded lazily, only when enabled):
pnpm add -D vue # for the <Icon> component
pnpm add -D vite # for the Vite plugin (already present in a Vite app)
# 安装特定 Iconify 集合 —— 优于整份数据集：
pnpm add -D @iconify-json/mdi
```

## 快速开始

**1. 启用模块**（`ubean.config.ts`）—— 它默认关闭：

```ts
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  icon: true
});
```

**2. 在任意组件里使用 `<Icon>`** —— 手动导入（或交给组件自动导入解析）：

```vue
<!-- src/components/Header.vue -->
<script setup lang="ts">
import { Icon } from '@ubean/icon';
</script>

<template>
  <Icon name="mdi:home" size="1.25em" />
</template>
```

**3. 需要在代码里拿到原始 SVG 时**，用编程式 API 检查同一个图标：

```ts
import { getIconSync, useIcon } from '@ubean/icon';

const { getSvg, getSvgSync } = useIcon('mdi:home');

const svg = getSvgSync(); // string | null —— 集合加载完成前为 null
const svgAsync = await getSvg(); // 会等待集合 loader
const direct = getIconSync('mdi:home');
```

## Icon 组件

`Icon` 覆盖常见场景且不依赖任何样式库。除 `name` 外所有 prop 都可选：

| Prop        | 类型                                   | 默认值  | 用途                                   |
| ----------- | -------------------------------------- | ------- | -------------------------------------- |
| `name`      | `string`                               | 必填    | Iconify 名称，`collection:icon`        |
| `size`      | `string \| number`                     | `'1em'` | 宽 / 高；数字按 px 处理                |
| `color`     | `string`                               | —       | 任意 CSS 颜色                          |
| `className` | `string`                               | —       | 渲染节点上的额外 class                 |
| `ariaLabel` | `string`                               | —       | 无障碍标签；会设置 `role="img"`        |
| `title`     | `string`                               | —       | SVG 内的 `<title>` 内容                |
| `mode`      | `'svg' \| 'css'`                       | `'svg'` | 内联 SVG 或 CSS mask / background 渲染 |
| `flip`      | `'horizontal' \| 'vertical' \| 'both'` | —       | 镜像图标                               |
| `rotate`    | `number \| string`                     | —       | 旋转；数字按角度处理                   |
| `inline`    | `boolean`                              | —       | 让图标与文本内联对齐                   |

集合加载期间组件不渲染 SVG 并保留内部 loading 状态；若名称无法解析，它进入 error 状态而不是抛错。

## Iconify 集合

只安装用到的集合，然后在模块选项里列出：

```ts
// ubean.config.ts
import { defineConfig } from 'ubean';
import type { IconifyCollection } from '@ubean/icon';

export default defineConfig({
  icon: {
    collections: {
      // 直接给 JSON 数据或惰性 loader —— 两种形态都接受
      mdi: () => import('@iconify-json/mdi/icons.json').then(m => m.default as IconifyCollection)
    },
    fallbackToApi: true,
    iconifyApiEnabled: true,
    iconApiEndpoint: 'https://api.iconify.design',
    ssr: true
  }
});
```

插件选项参考：`collections`（`Record<string, IconifyCollection | (() => Promise<IconifyCollection>)>`）、`customCollections`（对象形式，见下节）、`fallbackToApi`、`iconifyApiEnabled`、`iconApiEndpoint`、`ssr`、`cssSelectorPrefix`（默认 `'i-'`）、`cssWherePseudo`（默认 `true`）。插件默认值为 `fallbackToApi: true`、`iconApiEndpoint: 'https://api.iconify.design'`、`ssr: true`、`cssSelectorPrefix: 'i-'`、`cssWherePseudo: true`、`iconifyApiEnabled: true`。

常见前缀：`mdi`（Material Design Icons）、`fa`（Font Awesome）、`simple-icons`、`tabler`、`lucide`、`carbon`、`bi`（Bootstrap Icons）、`heroicons`。

## 自定义与本地集合

`customCollections` 是**以集合名为 key 的对象**，不是数组。每个值可以是目录简写，也可以是配置对象：

```ts
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  icon: {
    customCollections: {
      // 简写：只给目录
      'my-icons': 'assets/icons',
      // 完整形式
      brand: {
        dir: 'assets/brand',
        prefix: 'brand',
        normalizeIconName: name => name.toLowerCase()
      }
    }
  }
});
```

- 嵌套子目录会被展开为连字符名称（`brand/logos/github.svg` → `brand:logos-github`）。
- `parseSvgToIconData()` 从原始 SVG 中提取 `body` 与 `width` / `height` / `viewBox`，这正是一条自定义集合数据的组成。
- 插件在构建时扫描 `.vue` 文件中的图标使用名（`scanVueSfcForIcons`）；`getScannedIcons()` 可从 `@ubean/icon/vite` 取出结果。
- `addIconCollection(pluginOptions, prefix, collection)` 在构建时注册集合，返回 `{ setCollection, clear }`。

也可以用两个定义函数手写集合：

```ts
import { defineIconCollection, defineIconCollectionLoader, type IconifyCollection } from '@ubean/icon';

const brand: IconifyCollection = {
  prefix: 'brand',
  icons: { logo: { body: '<path d="…" />' } }
};

defineIconCollection(brand);

defineIconCollectionLoader('brand', async () => {
  const res = await fetch('/icons/brand.json');
  return res.json();
});
```

## 运行时加载

运行时注册是构建时未知图标的逃生通道：

```ts
import {
  getIcon,
  getIconData,
  listLoadedCollections,
  loadCollection,
  registerCollection,
  registerCollectionLoader
} from '@ubean/icon';

registerCollection({ prefix: 'brand', icons: { logo: { body: '<path d="…" />' } } });

registerCollectionLoader('brand', async () => {
  const res = await fetch('/icons/brand.json');
  return res.json();
});

await loadCollection('brand');

const svg = await getIcon('brand:logo');
const data = getIconData('brand:logo'); // { body, width?, height?, viewBox? }
listLoadedCollections();
```

`configureIconRuntime(options)` 安装运行时选项（插件在 build start 时使用），`getIconConfig()` 读回它们。`fetchIconFromApi(name)` 是最后兜底的单次 API 查询。

## dev 服务路由

框架在 dev 下提供 `/_iconify`：本地 SVG / 集合命中时直接返回，只有未命中才落到 Iconify API。因此本地已安装的集合可离线工作，而未安装的图标在 `iconifyApiEnabled` 开启时仍能解析 —— 若 `fallbackToApi: false`，未命中会变成解析错误。

注意与 CSP 的配合：封禁 `https://api.iconify.design` 的 Content-Security-Policy 会打断 API 回退路径，请在 `connect-src` 放行该端点（[`examples/ubean-test/ubean.config.ts`](../../examples/ubean-test/ubean.config.ts) 就是这样做的），或关掉 `iconifyApiEnabled`。

## 类型安全

- 组件 props：`UbeanIconProps`；模块选项：`UbeanIconOptions`、解析后的 `ResolvedUbeanIconOptions`（除 `collections` / `customCollections` 外每个字段都必填）。
- 图标数据：`IconifyCollection`（`prefix`、`icons`，可选 `aliases` / `width` / `height`）、`IconifyIconData`（`body` 加可选尺寸 / 变换提示）、`IconifyAlias`（`parent` + 部分数据）、`ResolvedIconData`。
- Loader：`IconCollectionLoader`（`{ prefix, load }`）、`CustomCollectionDirConfig`（`{ dir, prefix?, normalizeIconName? }`）、`ResolvedCustomCollection`。
- 扫描：`ScannedIconUsage`（`{ name, collection, icon }`）。
- `IconifyCollection` 是 `@iconify-json/*` 包所带 JSON 的结构性子集，因此打包好的集合可直接传入，无需转换。

## 架构说明

- **Vite 插件刻意不从主入口再导出。** `./vite` 会拉入 `node:fs`，而主入口同时承载浏览器 `Icon` 组件 —— 从 `@ubean/icon/vite` 导入构建时 API，才能把 `node:fs` 挡在客户端图之外。
- **逐个安装集合。** 特定的 `@iconify-json/<collection>` 包配合 `scanVueSfcForIcons` 才能做到按图标摇树；打包整份 `@iconify/json` 数据集会破坏这一点，并让构建体积膨胀数 MB。
- **两种渲染模式，一套名称空间。** `mode: 'svg'` 给出可样式化的内联 SVG（支持 `currentColor`）；`mode: 'css'` 输出由生成 CSS 驱动的经典 `i-<prefix>-<icon>` class，前缀可配置。两者都接受同样的翻转 / 旋转变换。
- **解析是分层的：** 已注册的内存集合 → 集合 loader → Iconify API（开启时）。每一层都是可选的，且 `getIconSync` 在 loader / API 层返回 `null` 而不是阻塞。
- **`SIcon` 属于另一个包。** `@vean/ui` 的 `SIcon` 是带主题的 UI 组件；两者都用 `collection:icon` 命名，因此同一个项目可以基础设施用 `Icon`、设计系统内用 `SIcon`，不会有命名冲突。
