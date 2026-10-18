# ubean

**[English](./README.md) | 中文**

基于 Vite-Plus 的 Vue 专属全栈元框架 —— 单个 npm 包，把全部 `@ubean/*` 子包聚合在各自的子路径入口之后。

```ts
import { defineConfig } from 'ubean';
import { defineHandler } from 'ubean/server';

export default defineConfig({
  ssr: true,
  build: { preset: 'node' }
});

export const GET = defineHandler(async c => c.json({ ok: true }));
```

## 目录

- [ubean](#ubean)
  - [文档](#文档)
  - [包定位](#包定位)
  - [安装](#安装)
  - [快速开始](#快速开始)
  - [子路径入口](#子路径入口)
  - [导入语境规则](#导入语境规则)
  - [体积陷阱](#体积陷阱)
  - [类型安全](#类型安全)
  - [架构说明](#架构说明)

## 文档

完整文档：**<https://ubean.soybeanjs.dev/zh>** · [快速开始](https://ubean.soybeanjs.dev/zh/guide/quickstart/) · [API 参考](https://ubean.soybeanjs.dev/zh/reference/api/ubean/)

本 README 只覆盖包表面（子路径入口与导入语境）。路由、loader、actions、islands、i18n、集成等指南在文档站。

## 包定位

| 分层             | 职责                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| `ubean`（`.`）   | 同构 barrel：shared、SEO、页面数据协议、markdown、Vue 客户端内核、islands 运行时、logger、`defineConfig` |
| `ubean/client`   | 唯一的客户端入口：客户端内核重导出、Server Actions 运行时、islands 桥接                                  |
| `ubean/server`   | 服务端运行时：应用工厂、路由、cache/db/queue/cron/ws/sse、`validator` / `describeRoute`                  |
| `ubean/build`    | 构建时：预渲染/SSG、平台预设、配置加载、codegen 预设、扫描器、Vite 插件本体                              |
| `ubean/vite`     | 默认 Vite 插件组合（build + vue + islands + server actions）                                             |
| `ubean/i18n`     | 服务端 i18n（重导出 `@ubean/i18n` 并附路由中间件）                                                       |
| `ubean/ssr`      | Vue SSR 渲染器（`createVueRenderer`）                                                                    |
| `ubean/scaffold` | 脚手架库与机器可读 catalog                                                                               |

**包含：**

- 全部 `@ubean/*` —— 23 个子包在上述子路径之后重导出，一个依赖即可获得整个框架。
- CLI 可执行文件，通过 `bin/ubean.mjs` 暴露为 `ubean`。
- 同构主入口上的 `defineConfig`，可从配置文件、客户端或共享代码安全导入。

**不包含**（刻意为之）：

- 不支持多框架。Vue 是唯一目标 —— ubean 把投入放在 Vue 的纵深，而不是跨框架的广度。
- 不含 h3/Nitro HTTP 层。HTTP 内核是 Hono；`ubean/server` 重导出 Hono 形态的 handler 与 `hono-openapi` 辅助函数。
- 不含 HTTP 客户端。浏览器侧请使用 [`@soybeanjs/fetch`](https://www.npmjs.com/package/@soybeanjs/fetch)。
- 不代理第三方 API。`vue`、`vue-router`、`vue-i18n`、`@vue/server-renderer` 的 API 一律从对应包直接导入。
- 可选扩展不在硬依赖图里。图片、内容、图标、AI、auth、字体、PWA、Electron 与 DevTools 都是独立的 opt-in 包。

**运行时依赖白名单（主入口）：** 16 个 `@ubean/*` workspace 包，加上 `hono` 与 `hono-openapi`。完整且权威的清单见 [`packages/ubean/package.json`](./package.json)。

**可选 peer：** `vue`（`^3.0.0`）—— 客户端运行时需要，仅服务端的入口不需要。

## 安装

```bash
pnpm add ubean
pnpm add vue        # peer，客户端运行时必需

# 可选扩展，只在启用时安装
pnpm add @ubean/ai
pnpm add @ubean/auth
pnpm add @ubean/integrations
pnpm add -D @ubean/devtools
```

## 快速开始

**1. 配置项目**

```ts
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  ssr: true,
  build: { preset: 'node' },
  autoImports: true,
  components: true
});
```

**2. 添加页面**

```vue
<!-- src/pages/index.vue -->
<script setup lang="ts">
definePage({ head: { title: 'Home' } });
const { data } = await useFetch('greeting', '/api/greeting');
</script>

<template>
  <h1>{{ data?.message }}</h1>
</template>
```

**3. 添加 API 路由**

```ts
// src/routes/api/greeting.ts
import { defineHandler } from 'ubean/server';

export const GET = defineHandler(async c => c.json({ message: 'hello' }));
```

然后运行 `pnpm dev`（或 `vite dev` —— dev/build/preview 生命周期由 Vite 插件接管）。

## 子路径入口

| 子路径           | 背后是什么                                                                                                    | 从哪儿导入                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `ubean`          | 同构值：共享工具、SEO、页面数据协议、markdown、Vue 客户端内核、islands 运行时、logger、`defineConfig`         | 配置文件、客户端、共享代码     |
| `ubean/vite`     | 默认 Vite 插件组合                                                                                            | `vite.config.ts`               |
| `ubean/client`   | 唯一的客户端入口 —— 客户端内核，加 `createServerHead`、Server Actions 运行时与 islands 水合桥接               | 客户端代码、SPA 入口           |
| `ubean/server`   | 应用工厂（`createUbeanApp`）、路由运行时、cache、db、queue、cron、WebSocket/SSE、`validator`、`describeRoute` | `src/server.ts`、API 路由      |
| `ubean/build`    | 预渲染/SSG、平台预设、`loadUbeanConfig`、codegen 预设、扫描器、Vite 插件本体                                  | 构建脚本、CI、`vite.config.ts` |
| `ubean/i18n`     | 服务端 i18n：基于 AsyncLocalStorage 的 `t()`、`createI18nMiddleware`                                          | 需要 `t()` 的服务端代码        |
| `ubean/ssr`      | `createVueRenderer`                                                                                           | 自定义 SSR 场景                |
| `ubean/scaffold` | `scaffold` / `getScaffoldManifest` 以及机器可读 catalog                                                       | studio / IDE 集成              |

## 导入语境规则

按代码运行的位置选择入口：

1. **同构值**（类型、`defineConfig`、SEO 辅助、markdown、Vue 客户端内核）→ `ubean`。
2. **服务端 API**（`defineHandler`、`useDatabase`、`validator`、`describeRoute`、cache、queue、cron）→ `ubean/server`。
3. **构建时 API**（`prerender`、`loadUbeanConfig`、`getAutoImportPresets`、`detectPreset`、Vite 插件本体）→ `ubean/build`。
4. **服务端 i18n**（`t()`、`createI18nMiddleware`）→ `ubean/i18n`。
5. **客户端代码** → `ubean/client`，而不是主 barrel。

在客户端代码中从主入口导入服务端符号，会把 Hono 与 `node:*` 拉进浏览器预构建。从客户端模块导入主 barrel 则会付出体积代价 —— 见下节。

## 体积陷阱

主入口是聚合 barrel：shared、SEO、pages、markdown、Vue 客户端内核、islands 与 logger。从客户端模块导入它，会把整条链路拖进客户端图。

在示例项目中实测：客户端文件里一个 `import { defineMatcher } from 'ubean'`，就让入口 chunk 从 **45.2 kB gzip 涨到 111.9 kB gzip**（+148%）。把同一个导入换成 `'ubean/client'` 后回到 **+1.5%**。

经验法则：任何会发往浏览器的代码，都从 `ubean/client` 导入。体积闸门（`pnpm analyze:check`）只看体积 —— 它无法判断导入来自哪里 —— 因此 `packages/cli/test/example-imports.test.ts` 直接断言示例的客户端图文件不会从主入口 `ubean` 导入。

## 类型安全

- `defineConfig(config?)` 返回 `UbeanConfig`；`ResolvedConfig` 是应用默认值与预设之后框架实际读取的形状。
- `PresetName` / `BuiltinPresetName` 是内置平台预设的闭合联合，因此 `build: { preset: ... }` 在编译期就会被检查。
- `PageHead`、`HttpMethod`、`PageAssetTags`、`PageRenderer`、`InternalFetchOptions` 为扫描器、构建器与运行时共享的页面协议提供类型。
- `defineApp(options)` 返回 `ResolvedAppConfig`；`DefineAppOptions` 为每个钩子提供类型，包括 `serializeState` / `hydrateState`。
- `ScaffoldManifest`、`ScaffoldTypeManifest`、`ScaffoldArgManifest` 描述 studio 工具消费的机器可读 catalog。
- 服务端与客户端都从 `@ubean/routes/runtime` 重导出，因此 `useAction` / `callAction` 共用一套类型。

## 架构说明

- **聚合器，不是单体。** `ubean` 是覆盖 23 个 `@ubean/*` 子包的纯重导出层。你导入的每个符号都解析到拥有它的子包。
- **子路径就是契约。** `exports` 映射定义了八个入口；它们之间的边界正是让客户端图不含服务端与构建期依赖的原因。
- **Hono 是 HTTP 内核。** 路由 handler 就是 Hono handler，`validator` / `describeRoute` 来自 `hono-openapi`，应用工厂返回 Hono 应用。
- **同构是构造出来的。** 主入口在设计上就同时安全于两种环境；不安全的东西都放在子路径之后。
- **扩展不进内核。** AI、auth、integrations 与 DevTools 是独立包，通过 `ubean.config.ts` 字段启用，从而把原生依赖与远程 SDK 挡在内核图之外。
- **Vite 拥有生命周期。** 插件注册 client 与 ubean 两个环境以及 build app，因此 `vite dev|build|preview` 本身就是完整工具链。
- **机器可读契约。** `ubean/scaffold` 暴露带版本的 catalog，外部工具（studio、IDE 插件）无需导入构建内部即可驱动文件生成。
- **接着读什么。** 文档站 <https://ubean.soybeanjs.dev/zh> 提供指南、集成与 API 参考；[根 README](../../README.zh_CN.md) 负责功能总览、平台预设与框架对比；[架构决策](../../docs/adr) 记录了 Vite 插件优先的生命周期、平台产物契约与 DevTools 托管方案。
