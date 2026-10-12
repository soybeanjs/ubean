# @ubean/image

**[English](./README.md) | 中文**

ubean 的图片优化 —— 与 provider 无关的 `resolveImage` 内核、输出响应式 `srcset` 的 `<UbeanImg>` / `<UbeanPicture>` 组件、命名预设，以及 dev 端的 IPX 变换处理器。

```ts
import { resolveImage } from '@ubean/image';

const image = resolveImage('/photos/hero.jpg', { width: 800, format: 'webp', quality: 75 });
// → { url: '/_ipx/w_800,fm_webp,q_75/photos/hero.jpg', format: 'webp', width: 800 }
```

## 目录

- [包定位](#包定位)
- [安装](#安装)
- [快速开始](#快速开始)
- [组件](#组件)
- [Provider](#provider)
- [预设与 srcset](#预设与-srcset)
- [IPX 处理器](#ipx-处理器)
- [类型安全](#类型安全)
- [架构说明](#架构说明)

## 包定位

`@ubean/image` 拥有 **图片 URL 解析：modifiers → provider → URL/srcset**，外加消费它的组件：

| 层                     | 职责                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `@ubean/image`（本包） | modifier 模型、provider 抽象、URL / srcset 构建器、`<UbeanImg>` / `<UbeanPicture>`、预设、占位图生成、IPX 解析与服务辅助 |
| `@ubean/build`         | 提供安装 dev `/_ipx` 中间件并注入运行时配置的 Vite 插件                                                                  |
| `@ubean/config`        | 持有内置模块开关（`image: boolean \| BuiltinModuleOptions`），默认关闭                                                   |
| `@ubean/integrations`  | UI / PWA / Electron 集成 —— 与图片变换无关，不共享图片流水线                                                             |
| 外部图片服务           | 生产环境的真实像素变换。本包只构建 URL，不附带生产变换引擎                                                               |

**包含：**

- `useImage()` —— 从组件或组合式函数中解析图片、srcset、密度 srcset、占位图与 `<img>` 属性
- `resolveImage` / `getImageContext` / `configureImageRuntime` —— 运行时 context 与解析器
- `defineImagePreset(name, options)` —— 命名 modifier 组合，通过 `preset="…"` 应用
- Provider：`ipxProvider`、`staticProvider`、`cloudinaryProvider`、`imgixProvider`，以及 `builtinProviders`
- URL 构建器：`createIPXUrl`、`createStaticUrl`、`createSrcSet`、`createDensitySrcSet`、`srcSetToString`、`getPlaceholder`、`buildImgAttributes`、`createImageHash`、`detectFormat`、`isRemoteUrl`、`isDataUrl`、`validateDomain`、`resolveAlias`
- IPX 处理器：`parseIpxModifiers`、`serveIpxRequest`、`createIpxHonoHandler`、`resolveLocalImage`、`ipxContentType`
- `@ubean/image/vite` 处的 Vite 插件：`ubeanImagePlugin`

**不包含**（由邻近包负责）：

- 真实的图片转码 —— dev 处理器只识别 IPX 风格变换 URL；生产需要真实图片服务
- 远程图片 provider 的 CDN 配置或缓存失效
- 媒体库 / 资源上传（二进制存储归 `@ubean/server` 的 storage）
- 面向 SEO 的 OG 图生成（`@ubean/seo` 的 `ImageResponse`）

**运行时依赖白名单（主入口）：`defu`、`ohash`、`ufo`。** 不含 `vite`、不含 `vue`、不含 `node:fs` —— 插件位于 `@ubean/image/vite` 之后，组件需要 `vue` peer。

**optional peer：** `vue` —— `<UbeanImg>` / `<UbeanPicture>` 需要它；`vite` —— `@ubean/image/vite` 需要它。缺少 `vue` 时编程式解析器与 URL 构建器仍可用；缺少 `vite` 时不安装 dev `/_ipx` 中间件，本地不做任何变换。

## 安装

```bash
pnpm add @ubean/image
# optional peers (loaded lazily, only when enabled):
pnpm add -D vue # for <UbeanImg> / <UbeanPicture>
pnpm add -D vite # for the Vite plugin (already present in a Vite app)
```

## 快速开始

**1. 启用模块**（`ubean.config.ts`）—— 它默认关闭：

```ts
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  image: true
});
```

**2. 用组件渲染图片**：

```vue
<!-- src/components/Hero.vue -->
<script setup lang="ts">
import { UbeanImg } from '@ubean/image';
</script>

<template>
  <UbeanImg src="/photos/hero.jpg" alt="Hero" :width="800" :height="450" format="webp" sizes="100vw sm:50vw" />
</template>
```

**3. 需要在逻辑里拿到 URL 时手动解析**：

```ts
import { resolveImage } from '@ubean/image';

resolveImage('/photos/hero.jpg', { width: 640, fit: 'cover' });
// → { url: '/_ipx/w_640,f_cover/photos/hero.jpg', width: 640 }
```

## 组件

`UbeanImg` 渲染单个 `<img>`；`UbeanPicture` 渲染 `<picture>`，为每个请求的格式生成一个 `<source>`，并带 `<img>` 回退。两者走同一条 provider 流水线，因此预设或 provider 覆盖的效果完全一致。

`UbeanImg` 的 props（仅 `src` 必填）：

| Prop               | 类型                 | 默认值   | 用途                                                |
| ------------------ | -------------------- | -------- | --------------------------------------------------- |
| `src`              | `string`             | 必填     | 本地路径、远程 URL 或别名                           |
| `alt`              | `string`             | `''`     | 替代文本                                            |
| `title`            | `string`             | —        | `title` 属性                                        |
| `width` / `height` | `number \| string`   | —        | 预留尺寸                                            |
| `sizes`            | `string`             | —        | 用于响应式选择的 `sizes` 属性                       |
| `srcset`           | `string`             | —        | 显式 `srcset`，跳过自动生成                         |
| `loading`          | `'lazy' \| 'eager'`  | `'lazy'` | 原生加载提示                                        |
| `crossorigin`      | `string`             | —        | `crossorigin` 属性                                  |
| `referrerpolicy`   | `string`             | —        | `referrerpolicy` 属性                               |
| `placeholder`      | `string \| boolean`  | —        | 加载期间的占位 URL / 开关                           |
| `format`           | `ImageFormat`        | 配置值   | 输出格式（`webp`、`avif` 等）                       |
| `quality`          | `number`             | 配置值   | 编码质量                                            |
| `fit`              | `ImageFit`           | —        | `cover` / `contain` / `fill` / `inside` / `outside` |
| `position`         | `ImagePosition`      | —        | 裁剪锚点                                            |
| `background`       | `string`             | —        | 透明区域的填充色                                    |
| `blur`             | `number`             | —        | 模糊半径                                            |
| `preset`           | `string`             | —        | 要应用的命名预设                                    |
| `provider`         | `string`             | 配置值   | 针对这张图的 provider 覆盖                          |
| `densities`        | `string \| number[]` | 配置值   | 密度 srcset 的密度描述符                            |
| `preload`          | `boolean`            | 配置值   | 输出 preload link                                   |
| `noModule`         | `boolean`            | —        | 旧式回退处理                                        |
| `sizesList`        | `ImageSize[]`        | —        | 断点驱动的 sizes 列表                               |

组件内部维护 `isLoaded` / `isError` 状态，在浏览器加载完成后把 `displaySrc` 从占位图换成解析后的 URL，并用 `IntersectionObserver` 做懒加载。

## Provider

Provider 的结构是 `{ name, getImage, validateDomains?, supportsAlias? }`，返回 `ResolvedImage`（`{ url, format?, width?, height?, sizes?, srcset? }`）。内置四个：

| Provider             | URL 形态                                        | 适用场景                                   |
| -------------------- | ----------------------------------------------- | ------------------------------------------ |
| `ipxProvider`        | `/_ipx/<modifiers>/<path>`                      | 默认值。dev 变换 + 任何兼容 IPX 的边缘环境 |
| `staticProvider`     | `/<static.baseURL>/<path>` 加静态 modifier 映射 | 已预生成派生文件、运行时不做变换           |
| `cloudinaryProvider` | Cloudinary fetch / transform URL                | 由 Cloudinary 账号支撑图片                 |
| `imgixProvider`      | imgix transform URL                             | 由 imgix source 支撑图片                   |

```ts
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  image: {
    provider: 'cloudinary',
    domains: ['images.example.com'],
    cloudinary: { baseURL: 'https://res.cloudinary.com/demo/image/fetch' }
  }
});
```

- `builtinProviders` 是运行时注入 context 的注册表。
- `domains` 把关远程源：`validateDomain(src, domains)` 拒绝 host 不在白名单内的远程 URL，因此配置错误的远程图片会显式报错，而不是泄漏一个原始 URL。
- `alias` 把短前缀映射到真实路径（`resolveAlias`），适合资源根目录场景。
- 当构建步骤已经产出缩放文件时，`staticProvider` 与 `static.dir` / `static.baseURL` 选项配合使用。

## 预设与 srcset

`defineImagePreset(name, options)` 注册一组 modifier；组件上的 `preset="…"` 或 `resolveImage` 中的 `{ preset: '…' }` 会应用它。显式选项始终优先于预设 —— 解析器先复制预设，再覆盖调用方选项。

```ts
import {
  createDensitySrcSet,
  createSrcSet,
  defineImagePreset,
  resolveImage,
  srcSetToString,
  useImage
} from '@ubean/image';

defineImagePreset('card', { width: 480, format: 'webp', fit: 'cover' });

resolveImage('/photos/hero.jpg', { preset: 'card' });

const { srcset, densitySrcset, getPlaceholder, getImgAttributes } = useImage();

srcSetToString(createSrcSet('/photos/hero.jpg', [320, 640, 1280], { format: 'webp' }));
// → '/_ipx/w_320,fm_webp/photos/hero.jpg 320w, … 640w, … 1280w'

srcset('/photos/hero.jpg', [320, 640, 1280], { format: 'webp' });
densitySrcset('/photos/hero.jpg', [1, 2], { format: 'webp' });
getPlaceholder('/photos/hero.jpg', { blur: 8 });
getImgAttributes('/photos/hero.jpg', { alt: 'Hero', sizes: '100vw' });
```

- `createSrcSet(src, sizes, modifiers, ctx, formats?)` 产出宽度描述符；`createDensitySrcSet(src, densities, modifiers, ctx, formats?)` 产出 `x` 描述符。`useImage()` 已预绑定 context，所以 `srcset` / `densitySrcset` 就是同一批函数的 `ctx` 已供给版本。
- 主入口的 `resolveImage` 就是组件使用的同一个解析器，因此无论你渲染组件还是手写 HTML，URL 输出都一致。
- `format` 默认为配置的列表（开箱即用是 `['webp', 'avif']`）；`UbeanPicture` 为每个条目输出一个 `<source>`。
- `placeholder` 接受数字（宽度），`getPlaceholder` 产出极小的内联图片 URL —— 配合 `placeholder` prop 可避免布局抖动。

## IPX 处理器

dev server 通过 `serveIpxRequest` 响应 IPX 风格的变换 URL：

```ts
import { createIpxHonoHandler, parseIpxModifiers, serveIpxRequest } from '@ubean/image';

parseIpxModifiers('w_800,fm_webp,q_75,fv,grayscale');
// → { width: 800, format: 'webp', quality: 75, flip: 'v', grayscale: true }

const result = await serveIpxRequest('/_ipx/w_640/photos/hero.jpg', {
  rootDir: process.cwd(),
  staticDir: 'public',
  isDev: true
});
// → { status, headers, body? }
```

modifier 语法 —— 逗号分隔的 token：

- 裸标记：`fh` / `fv`（水平 / 垂直翻转，可组合为 `hv`）、`grayscale`、`negate`、`trim`、`enlarge`。
- 键值对：`w`（宽）、`h`（高）、`f`（fit）、`p`（position，URL 解码）、`fm`（格式）、`q`（质量）、`blur`、`sharpen`、`rot`（旋转）、`bg`（背景）。`_` 表示无 modifier。

`createIpxHonoHandler(options)` 把同一套逻辑包成 Hono handler，供自定义服务端入口使用；`resolveLocalImage(root, staticDir, src)` 在磁盘上定位源文件。`ServeIpxResult` 为 `{ status, headers, body?: Buffer | Uint8Array | string, redirect? }`。

**生产注意事项：** 变换流水线只存在于 dev。生产部署要么把 `provider` 指向真实图片服务（兼容 IPX 的边缘、Cloudinary、imgix 等），要么切换到 `staticProvider` 并配合预生成文件。本包在生产不做任何运行时转码。

## 类型安全

- 选项：`UbeanImageOptions`（模块输入）与 `ImageModuleOptions`（解析后，每个字段必填）、`CreateImageOptions`（`configureImageRuntime` 接受的运行时注入子集）。
- Modifier 与选项：`ImageModifiers`（`width`、`height`、`size`、`fit`、`position`、`format`、`quality`、`background`、`blur`、`sharpen`、`rotate`、`flip: 'h' | 'v' | 'hv'`、`trim`、`enlarge`、`grayscale`、`negate`、`brightness`、`contrast`、`saturation`）、`ImageOptions`（modifier + `src`、`alt`、`title`、`loading`、`crossorigin`、`referrerpolicy`、`placeholder`、`sizes`、`srcset`、`preset`、`provider`、`densities`）。
- 枚举：`ImageFormat`（`'webp' | 'avif' | 'jpeg' | 'jpg' | 'png' | 'gif' | 'svg'`）、`ImageFit`、`ImagePosition`。
- Provider 契约：`ImageProvider`、`ProviderGetImage`、`ImageCTX`、`ResolvedImage`、`ImageSrcsetItem`、`ImageSize`。
- IPX：`ServeIpxOptions`、`ServeIpxResult`。
- `ImageSrcsetItem` 携带 `{ url, width?, density?, format? }`，因此自定义 srcset 消费方无需重新解析生成的字符串。

## 架构说明

- **一个解析器，三个消费方。** `<UbeanImg>`、`<UbeanPicture>` 与 `useImage()` 都调用同一个 `resolveImage`，因此 loader 里构建的 URL 与组件渲染的 URL 一致。
- **provider 边界就是接缝。** 新增一家服务只需实现 `getImage` 并注册进 `providers`；组件与 URL 构建器都不变。
- **modifier 是数据，不是字符串。** `ImageModifiers` 是普通对象，由各 provider 自行序列化 —— IPX 序列化为路径段，Cloudinary / imgix 序列化为查询参数（`createIPXUrl` / `createStaticUrl` 展示了两种内置序列化）。
- **解析是惰性的。** `getImageContext()` 在首次使用时构建默认 context，`configureImageRuntime` 之后可替换它，因此 Vite 插件能在任何组件解析之前注入真实配置。
- **转码只在 dev 且是显式的。** `/_ipx` 中间件仅在 dev 安装；生产正确性取决于是否有意选择 provider —— 这也是本模块默认关闭、且从不猜测部署目标的原因。
- **`UbeanImg` / `UbeanPicture` 是稳定名称**；源码中的底层组件名为 `NuxtImg` / `NuxtPicture`，`Ubean*` 别名由包入口导出。
