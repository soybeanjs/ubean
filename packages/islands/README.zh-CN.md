# @ubean/islands

**[English](./README.md) | 中文**

ubean 的 Islands 架构 —— Vue 组件的局部水合，以及服务端组件协议。

`@ubean/islands` 拥有 ubean 中**局部水合**的全部内容：`v-client.*` 指令族、把指令转换为 `<ubean-island>` 元素的构建期转换、自动生成的注册表虚拟模块、客户端水合运行时、`.server.vue` / `.client.vue` 文件约定，以及用于重渲染服务端岛屿的 `POST /__server-component` 端点。

```vue
<script setup lang="ts">
import Counter from '~/components/Counter.vue';
</script>

<template>
  <Counter v-client.load :initial="0" />
</template>
```

## 目录

- [@ubean/islands](#ubeanislands)
  - [目录](#目录)
  - [包定位](#包定位)
  - [安装](#安装)
  - [快速开始](#快速开始)
  - [`v-client` 指令](#v-client-指令)
    - [`v-client.only` 与 `<ClientOnly>`](#v-clientonly-与-clientonly)
  - [指令 API](#指令-api)
  - [编程式包装器](#编程式包装器)
  - [Server / Client 组件](#server--client-组件)
    - [约束](#约束)
  - [Islands 注册表](#islands-注册表)
  - [服务端组件端点](#服务端组件端点)
  - [Vite 插件 API](#vite-插件-api)
  - [SSR 助手](#ssr-助手)
  - [类型安全](#类型安全)
  - [架构说明](#架构说明)

## 包定位

`@ubean/islands` 是**岛屿运行时 + 构建期转换**：

| 分层                     | 职责                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| `@ubean/islands`（本包） | `v-client.*` 指令、岛屿/注册表转换、水合运行时、`.server.vue` / `.client.vue`、`POST /__server-component` |
| `@ubean/vue`             | 页面路由与精简内核；`<ClientOnly>` 与页面/缓存/过渡层在那里 —— 本包只是在其上叠加岛屿水合                 |
| `@ubean/client`          | mount 之后与每次 SPA 导航后自动调用 `hydrateIslands()` —— 框架通往本运行时的桥                            |
| `@ubean/build`           | 把 `ubeanIslandsPlugin()` 接进 `ubeanPlugin()`；应用工厂挂载 `createServerComponentMiddleware()`          |

**包含：**

- `v-client.load` / `.idle` / `.visible` / `.media` / `.only` 指令族及其策略解析器
- `defineIsland`（客户端岛屿）/ `defineServerIsland`（服务端岛屿）/ `defineClientComponent` / `definePairedComponent`
- 客户端水合运行时：`hydrateIslands`、`collectIslands`、`hydrateIsland`、`hasPendingIslands`、`scheduleIslandHydration`
- 引导脚本（`getIslandsBootstrapScript`）及其清理脚本
- 服务端组件协议：`SERVER_COMPONENT_ENDPOINT`、`registerServerComponent`、`getServerComponent`、`createServerComponentMiddleware`
- Vite 插件（`/vite` 子路径）：指令扫描、`<ubean-island>` 转换、注册表虚拟模块、`.server.vue` / `.client.vue` 解析与受限父级检查
- 用于渲染占位符的 SSR 助手（`createIslandsContext`、`registerIsland`、`getIslandsScript`、`generateIslandPlaceholder`、`renderIslandPlaceholder`、`hydrationStrategyMeta`）

**不包含：**

- 页面路由、`<ClientOnly>`、页面缓存、页面过渡、`definePage` —— `@ubean/vue`
- 应用工厂、`defineApp`、mount 后的自动水合调用、数据层 —— `@ubean/client`
- 完整 SSR 渲染（流式、head 合并、延迟数据 payload）—— `@ubean/client/ssr` 与 `@ubean/pages`
- 服务端路由与 Hono 应用 —— `@ubean/app`

**运行时依赖白名单（主入口）：`vue`。** 主入口只导入 `./directive` 与 `./runtime` —— 没有 `node:*`，也没有 `vite`。`hono` 与 `pathe` 由服务端组件中间件与 Vite 插件使用，它们分别位于 `/server` 与 `/vite` 子路径之后。`vite` 是 **optional peer**，仅构建期子路径使用。

## 安装

```bash
pnpm add ubean          # 或：pnpm add @ubean/islands
# 构建期（/vite 子路径）：
pnpm add -D vite
```

## 快速开始

**1. Vite 配置** —— 插件扫描 `.vue` 文件、转换 `v-client.*` 标签并生成注册表：

```ts
// vite.config.ts
import vue from '@vitejs/plugin-vue';
import { ubeanIslandsPlugin } from '@ubean/islands/vite';

export default {
  plugins: [vue(), ubeanIslandsPlugin()]
};
```

**2. 标记交互组件** —— 指令要落在**组件元素**上，而不是普通 `<div>`：

```vue
<script setup lang="ts">
import Counter from '~/components/Counter.vue';
import HeavyChart from '~/components/HeavyChart.vue';
</script>

<template>
  <Counter v-client.load />
  <HeavyChart v-client.idle />
</template>
```

**3. 其余什么都不用做。** 在 `<script setup>` 中导入组件，框架会在 mount 后自动水合 —— `app.ts` 中无需任何代码。

完整示例见 [`apps/docs/src/content/en/guide/islands.md`](../../apps/docs/src/content/en/guide/islands.md)。

## `v-client` 指令

修饰符决定水合策略 —— 每条策略一个指令，都声明在组件标签上：

| 指令               | 策略        | 何时水合                                  |
| ------------------ | ----------- | ----------------------------------------- |
| `v-client.load`    | `'load'`    | 页面加载后立即水合                        |
| `v-client.idle`    | `'idle'`    | 浏览器空闲时（`requestIdleCallback`）     |
| `v-client.visible` | `'visible'` | 元素进入视口时（`IntersectionObserver`）  |
| `v-client.media`   | `'media'`   | 某条 CSS media query 命中时（值为该查询） |
| `v-client.only`    | `'only'`    | 仅客户端 —— 该组件不产出 SSR HTML         |

```vue
<template>
  <Counter v-client.load />
  <HeavyChart v-client.idle />
  <Comments v-client.visible />
  <MobileNav v-client.media="'(max-width: 768px)'" />
  <ClientOnlyWidget v-client.only />
</template>
```

`.media` 的值是 Vue 表达式，因此字符串字面量必须加引号。传给岛屿的 props 必须可 JSON 序列化（字符串、数字、布尔、数组、纯对象）。

### `v-client.only` 与 `<ClientOnly>`

`<ClientOnly>`（来自 `@ubean/vue` / `@ubean/client`）覆盖非岛屿场景，接受 `fallback` prop / `#fallback` slot：

| 用 `v-client.only`                              | 用 `<ClientOnly>`                                          |
| ----------------------------------------------- | ---------------------------------------------------------- |
| 组件级岛屿（由注册表驱动水合）                  | 模板片段 / 普通 HTML（岛屿转换只匹配首字母大写的组件标签） |
| 需要同时指定延后策略（load/idle/visible/media） | 同树渲染且拥有完整应用上下文                               |
| 组件内容由独立应用在 hydration 时替换           | 不能放进岛屿占位符内部（岛屿水合时会被清除）               |

## 指令 API

```ts
import {
  vClient,
  resolveClientStrategy,
  strategyToLegacyDirective,
  legacyDirectiveToStrategy
} from '@ubean/islands/directive';

vClient; // Vue 指令对象（ObjectDirective<HTMLElement, string, ClientStrategy>）
resolveClientStrategy({ load: true, media: true }); // → 'load' | 'idle' | 'visible' | 'media' | 'only'
```

- `ClientStrategy = 'load' | 'idle' | 'visible' | 'media' | 'only'`；`ClientDirective = 'client:load' | 'client:idle' | 'client:visible' | 'client:media' | 'client:only'`。
- `applyStrategy(el, strategy, mediaQuery?)` / `cleanupStrategy(el)` 是指令底层的命令式原语。
- 供工具链使用的 `data-*` 协议属性已导出：`CLIENT_DIRECTIVE_ATTR`（`data-client-directive`）、`CLIENT_MEDIA_ATTR`（`data-media`）、`CLIENT_ONLY_ATTR`（`data-client-only`）。
- `/directive` 子路径浏览器安全且无构建期依赖 —— `@ubean/client` 导入的正是它。

## 编程式包装器

```ts
import { defineIsland, defineServerIsland } from '@ubean/islands';
import AsyncChart from '~/components/AsyncChart.vue';
import Counter from '~/components/Counter.vue';

// 客户端岛屿；strategy: 'load' | 'idle' | 'visible' | 'media' | 'only'
const CounterIsland = defineIsland(Counter, 'load');

// 'media' 必须提供 mediaQuery；props 可预先绑定
const MobileNavIsland = defineIsland(MobileNav, 'media', {
  mediaQuery: '(max-width: 768px)',
  props: { theme: 'dark' }
});

// 服务端岛屿 —— 把异步组件包进带 fallback 的 <Suspense>
const Chart = defineServerIsland(AsyncChart, { fallback: '<div class="skeleton">Loading…</div>' });
```

- `IslandOptions = { mediaQuery?: string, props?: Record<string, unknown> }`。
- `ServerIslandOptions = { fallback?: Component | string, rerenderOnPropsChange?: boolean }`。省略时使用 `<ubean-defer-fallback>` 占位元素。
- 开启 `rerenderOnPropsChange: true` 后，客户端在 mount 后请求一次服务端渲染的 HTML，并在 props 变化时重复请求，用返回值替换容器内容；SSR 侧会把组件注册进全局注册表以便端点查找。Vite 插件会注入组件绝对路径作为第三个参数 —— 没有该参数时该选项退化为 `false`。
- `defineClientComponent(component)` 与 `definePairedComponent(ServerComp, ClientComp)` 分别是 `.client.vue` 与 `.server.vue` + `.client.vue` 约定的运行时半边；两者通常由插件生成，无需手写。

## Server / Client 组件

两个文件名约定，用于只属于单一构建图的组件。插件负责解析 —— 无需改导入，也无需指令。

- **`Foo.client.vue`** —— 只在客户端渲染。SSR 输出 `<!--client-only-->` 注释占位符，真实组件在 mount 后替换它。适用于需要浏览器 API 的组件。
- **`Foo.server.vue`** —— 只在服务端渲染。客户端构建把该导入换成 stub，因此实现与其依赖都不会进入客户端产物。适用于服务端专属访问（环境变量、数据库）。
- **`Foo.server.vue` + `Foo.client.vue` 成对存在** —— 导入基础名（`import Foo from './Foo.vue'`）；该文件必须**不存在**。SSR 渲染服务端半边，客户端半边在 mount 后接管。

### 约束

**`.server.vue` 必须是 `<template>` 形式的 SFC。** 服务端会把模板包进 `<ubean-server-only v-once>` 以便水合匹配；render 函数式 SFC（或 `export { default } from …`）没有可包裹的模板，构建会以该原因失败。

**`.server.vue` 会占据一个包裹元素，因此上下文很重要。** 客户端在树中保留一个 stub，水合通过匹配该元素来保留服务端渲染的子节点。该包裹元素是普通的流式元素，所以服务端组件只能用在允许流式元素的位置：

```html
<!-- 会出错：包裹元素在 <tr> 中不合法，解析器会把它提到 table 之外 -->
<table>
  <tr>
    <ServerGreeting />
  </tr>
</table>

<!-- 正确：由服务端组件自己渲染容器 -->
<ServerTable />
```

**插件在转换阶段就会拒绝这种写法**（dev overlay / `vite build` 报错），并指出父元素与组件名。这个失败是刻意的：它要防止的症状在生产环境是**静默**的 —— 水合前内容出现在容器**之外**，之后 Vue 报 `Hydration node mismatch` / `Hydration children mismatch` 并把内容移除。

检查覆盖表格祖先（`table`、`thead`、`tbody`、`tfoot`、`tr`、`colgroup`）以及 `select` / `optgroup`。它刻意**不**覆盖 `ul` / `ol` / `dl`：在那里包裹元素不会被移动，两侧 DOM 一致，水合正常。

解法：让服务端组件自己渲染容器（整个 `<table>` / `<ul>`），或把它放进允许的子元素（`<td>`、`<li>`）。`.client.vue` 没有此约束 —— 注释节点在任何上下文都合法。

## Islands 注册表

`virtual:ubean-islands-registry` 由插件从每个使用了 `v-client.*` 指令的文件的 `<script setup>` 导入生成：

```ts
declare module 'virtual:ubean-islands-registry' {
  export const islands: Record<string, Component | (() => Promise<Component>)>;
}
```

- key 是**模板标签名**；value 是惰性 loader，因此岛屿组件永远不会进入入口 chunk。
- 未扫描到任何内容时该模块导出 `{}`。
- `ISLANDS_REGISTRY_VIRTUAL_ID`（来自 `/vite`）是虚拟模块 id；`/virtual-registration` 子路径是**纯类型**（`"import": null`）—— 它的存在只为让编辑器在不引入插件的情况下解析该模块类型。
- 仅通过全局注册、`defineAsyncComponent` 或动态导入触达的组件无法自动注册；请通过 `hydrateIslands({ components })` 手动传入（手动项优先）。
- 只有真正与 `v-client.*` 指令一起使用的组件才会进入客户端产物。

端到端流程：**扫描** `.vue` 文件 → 把岛屿标签**转换**为 `<ubean-island v-once>`（props 序列化进 data 属性）→ **解析**导入路径 → **生成**注册表虚拟模块 → 在 `@ubean/client` 中通过 `hydrateIslands` **桥接** → mount 之后（双重 `requestAnimationFrame`）以及每次 SPA 导航后**自动水合**。

## 服务端组件端点

`createServerComponentMiddleware()` 处理 `POST /__server-component` —— 客户端岛屿包装器需要最新服务端 HTML 时请求的端点：

```ts
import { SERVER_COMPONENT_ENDPOINT, createServerComponentMiddleware } from '@ubean/islands/server';

SERVER_COMPONENT_ENDPOINT; // '/__server-component'
app.use('*', createServerComponentMiddleware());
```

- 请求体：`{ "path": "/abs/path/Foo.server.vue", "props": { … } }`。
- 响应：`200` HTML / `400` 缺少 path / `404` 组件未注册 / `500` 渲染失败；每个响应都带 `Cache-Control: no-store`。
- `registerServerComponent(path, component)` / `getServerComponent(path)` 是 SSR 渲染器与中间件共用的注册表读写口。
- 注册表刻意挂在 **`globalThis`** 上：dev 下 SSR 图会把本包 runtime 内联，而 `@ubean/app` 通过 Node 解析 `@ubean/islands/server`，模块级 `Map` 会让两个实例拿到不同的注册表 —— 中间件会对已注册的组件返回 404（守卫见 `packages/islands/test/server-component-registry-singleton.test.ts`）。
- `isServerComponentRequest(c)` / `isServerComponentResponse(response)` 与 `SERVER_COMPONENT_RESPONSE_HEADER`（`x-ubean-server-component`）让请求日志或代理层能识别这些调用。

## Vite 插件 API

```ts
import { ubeanIslandsPlugin } from '@ubean/islands/vite';

export default {
  plugins: [ubeanIslandsPlugin({ enabled: true })]
};
```

`UbeanIslandsPluginOptions = { enabled?: boolean }`。该子路径还暴露转换的构建块供高级集成使用：`isServerComponentFile`、`isClientComponentFile`、`hasServerComponentTemplate`、`wrapServerComponentTemplate`、`findRestrictedServerComponentUsage`、`injectServerComponentPath`、`transformVueSfcIslands`、`collectIslandComponents`、`generateRegistryModule`、`parseScriptImports`、`resolveIslandImportPath`、`scanIslandDirectiveNames`，以及虚拟 id `ISLANDS_REGISTRY_VIRTUAL_ID`、`SERVER_COMPONENT_STUB_VIRTUAL_ID`、`CLIENT_COMPONENT_PLACEHOLDER_VIRTUAL_ID`。

插件刻意**不**从主入口 re-export —— 它会拉入 `node:fs` / `node:path`，绝不能进入浏览器产物。

## SSR 助手

```ts
import { createIslandsContext, registerIsland, getIslandsScript, renderIslandPlaceholder } from '@ubean/islands';

const ctx = createIslandsContext();
const id = registerIsland(ctx, 'Counter', 'client:load', { initial: 10 });
const html = renderIslandPlaceholder({ component: 'Counter', directive: 'client:load', props: { initial: 10 } });
const script = getIslandsScript([...ctx.islands.values()]);
```

- `getIslandsBootstrapScript()` 产出按策略标记待水合岛屿的 IIFE；`getIslandsClearScript()` 是它的对应物。
- `hydrationStrategyMeta` 把每条指令映射到其策略元数据。
- 这些面向自定义 SSR 管线；框架自带渲染器已经调用过它们。

## 类型安全

- `ClientStrategy` / `ClientDirective` / `ClientDirectiveBinding` / `VClientDirective` 描述指令；`IslandStrategy` / `IslandOptions` / `ServerIslandOptions` 描述包装器。
- `IslandRecord` / `IslandHydrateOptions` / `HydrateIslandsOptions` / `IslandHydrationScheduler` 描述水合运行时；`IslandsContext` / `IslandDefinition` / `IslandSsrOptions` 描述 SSR 助手。
- `declare module 'virtual:ubean-islands-registry'` 随包发布，虚拟模块无需额外配置即可获得类型。

## 架构说明

- **两层，一件事**：`v-client.*` 指令是编写面；注册表加水合运行时是机制。正常应用里你永远不会手写 `hydrateIslands()`。
- **主入口浏览器安全**：`dist/index.js` 只导入 `./directive` 与 `./runtime`。Vite 插件（`/vite`）与 Hono 中间件（`/server`）是独立子路径。
- **注册表挂在 `globalThis`**：因为 dev 会加载两份模块实例（见上文）；模块作用域的 `Map` 会静默把注册表一分为二。
- **转换对 HTML 解析刻意克制**：只拒绝解析器确实会移动或丢弃包裹元素的父级；`ul` / `ol` / `dl` 被放过以避免误报。
- **转换是渐进增强的**：插件在构建期报错，而不是让水合在生产环境静默移除内容。
- **归属**：`@ubean/build` 接线插件；`@ubean/client` 拥有自动水合调用；`@ubean/islands` 拥有机制。
