---
title: 群岛架构
description: 通过 v-client 指令实现部分水合 —— 只对页面中需要交互的部分做水合。
---

# 群岛架构

ubean 通过群岛（islands）架构支持部分水合。岛屿是需要在客户端水合的交互组件，页面其余部分保持为静态 HTML。这样发送的 JavaScript 更少，内容加载更快。

## `v-client` 指令

用 `v-client.*` Vue 指令标记需要客户端水合的组件。修饰符（`.load`、`.idle`、`.visible`、`.media`、`.only`）决定采用哪种水合策略：

```vue
<script setup lang="ts">
import { ref } from 'vue';
import Counter from '~/components/Counter.vue';

const count = ref(0);
</script>

<template>
  <Counter v-client.load :initial="0" />
</template>
```

指令要放在**组件元素**上，而不是普通 `<div>`：

```vue
<template>
  <!-- 正确：指令写在组件上 -->
  <Counter v-client.load />

  <!-- 错误：指令写在普通元素上不生效 -->
  <div v-client.load>...</div>
</template>
```

## 水合策略

### `v-client.load`

页面加载时立即水合（适合首屏可见的交互元素）：

```vue
<Counter v-client.load />
```

### `v-client.idle`

浏览器空闲时通过 `requestIdleCallback` 水合：

```vue
<HeavyChart v-client.idle />
```

### `v-client.visible`

元素滚动进入视口时水合（通过 `IntersectionObserver`）：

```vue
<Comments v-client.visible />
```

### `v-client.media`

CSS 媒体查询命中时水合。值是一个 Vue 表达式，因此字符串字面量必须加引号：

```vue
<MobileNav v-client.media="'(max-width: 768px)'" />
```

也可以传一个响应式变量：

```vue
<script setup lang="ts">
import { ref } from 'vue';
const query = ref('(max-width: 768px)');
</script>

<template>
  <MobileNav v-client.media="query" />
</template>
```

### `v-client.only`

只在客户端渲染（该组件不产出 SSR 内容）：

```vue
<ClientOnlyWidget v-client.only />
```

### `v-client.only` 与 `<ClientOnly>`

ubean 也提供 `<ClientOnly>` 组件（来自 `ubean/client` / `@ubean/vue`），用于非岛屿场景：

```vue
<template>
  <ClientOnly fallback="loading…">
    <BrowserChart />
  </ClientOnly>
</template>
```

| 使用 `v-client.only` 的场景 | 使用 `<ClientOnly>` 的场景 |
| -------------------------------------------------------------- | ----------------------------------------------------------------- |
| 组件级群岛架构（由注册表驱动水合） | 模板片段 / 普通 HTML（群岛转换只匹配首字母大写的组件标签） |
| 还需要搭配延迟策略（load/idle/visible/media） | 在同一棵组件树内渲染、需要完整应用上下文，或需要 `#fallback` slot / `fallback` prop |
| 岛屿内的内容在水合时会被替换为独立的应用实例 | 不在岛屿占位符内部（岛屿水合时会清空其内容） |

`<ClientOnly>` 是水合安全的：SSR 与客户端首帧渲染出完全相同的占位内容，真实内容在挂载后打补丁替换。

## 服务端/客户端组件（`.server.vue` / `.client.vue`）

有两个文件名约定，用于区分只属于某一个构建图的组件。Vite 插件负责解析 —— 无需改动导入，也无需指令。

- **`Foo.client.vue`** —— 只在客户端渲染。SSR 输出 `<!--client-only-->` 注释占位符（与 `<ClientOnly>` 用的是同一个），真实组件在挂载后替换它。适用于依赖浏览器 API 的组件。
- **`Foo.server.vue`** —— 只在服务端渲染。客户端构建会把该导入替换为桩实现，因此组件的实现与它的依赖都不会进入客户端产物。适用于需要服务端专属能力的内容（环境变量、数据库）。
- **`Foo.server.vue` + `Foo.client.vue` 同时存在** —— 导入基名（`import Foo from './Foo.vue'`）；该文件**不能**存在。SSR 渲染服务端那一半，挂载后由客户端那一半接管。相对路径与别名导入都可用。如果同时存在真实的 `Foo.vue`，以它为准，两半都被忽略。

### 约束

**`.server.vue` 必须是 `<template>` 形式的 SFC。** 服务端会用 `<ubean-server-only v-once>` 包裹模板，水合才能与之匹配；渲染函数形式的 SFC（或 `export { default } from …`）没有可包裹的模板，构建会以此原因失败。此前的静默替代方案实测更差：服务端输出与客户端桩在根元素上不一致，水合会**移除**服务端渲染的内容。

**`.server.vue` 会占据一个包裹元素，因此它的上下文很重要。** 客户端会在树中保留一个桩 —— 在服务端放置内容的位置渲染 `<ubean-server-only>` —— 水合时通过匹配该元素保留服务端渲染的子节点。这个包裹元素是一个普通的流式元素，所以服务端组件只能用在允许流式元素的位置：

```html
<!-- 会报错：包裹元素在 <tr> 内不合法，解析器会把它提出表格 -->
<table>
  <tr>
    <ServerGreeting />
  </tr>
</table>

<!-- 没问题：由服务端组件自己渲染容器 -->
<ServerTable />
```

**插件会在 transform 阶段拒绝这种情况** —— 把 `.server.vue` 组件直接放在上述父级之下会导致构建失败（dev overlay / `vite build` 报错），并指出父级元素与组件名。这个失败是刻意的：它要避免的症状在生产环境中是静默的。在该检查存在之前实测过：首帧时内容出现在容器*之外*（被移到表格之前，留下一个空的 `<tr>`），水合后 Vue 报 `Hydration node mismatch` / `Hydration children mismatch` 并移除内容。

该检查覆盖表格祖先元素（`table`、`thead`、`tbody`、`tfoot`、`tr`、`colgroup`）以及 `select` / `optgroup` —— 在这些位置解析器会移走或丢弃包裹元素。它**刻意不**覆盖 `ul` / `ol` / `dl`：包裹元素在那里会留在原处（虽然是非法 HTML，但两侧 DOM 一致，水合没有问题）。

变通做法：让服务端组件自己渲染容器（整个 `<table>` / `<ul>`），或把它放进合法的子元素中（`<td>`、`<li>`）。`.client.vue` 没有这个约束 —— 注释节点在任何上下文里都合法。

## 岛屿组件

创建可复用的岛屿组件：

```vue
<!-- src/components/Counter.client.vue -->
<script setup lang="ts">
import { ref } from 'vue';

defineProps<{
  initial?: number;
}>();

const count = ref(0);
</script>

<template>
  <div>
    <button @click="count++">+</button>
    <span>{{ count }}</span>
    <button @click="count--">-</button>
  </div>
</template>
```

在页面中用 `v-client.*` 指令使用它：

```vue
<template>
  <Counter v-client.load :initial="10" />
</template>
```

## Props

传给岛屿的 props 必须可 JSON 序列化（字符串、数字、布尔值、数组、纯对象）：

```vue
<template>
  <UserProfile v-client.visible :user-id="123" :theme="'dark'" />
</template>
```

## 事件

岛屿可以向父组件 emit 事件：

```vue
<!-- 岛屿组件 -->
<script setup lang="ts">
const emit = defineEmits<{
  update: [value: number];
}>();

const count = ref(0);

function handleUpdate() {
  emit('update', count.value);
}
</script>
```

```vue
<!-- 父页面 -->
<template>
  <Counter v-client.load @update="handleUpdate" />
</template>

<script setup lang="ts">
function handleUpdate(value: number) {
  console.log('Updated:', value);
}
</script>
```

## 自动水合（零配置）

ubean 会在应用挂载后**自动水合岛屿** —— 无需手动调用 `hydrateIslands()`。框架会：

1. 构建时把 `v-client.*` 指令转换为 `<ubean-island v-once>` 自定义元素，并用 data 属性携带组件信息与序列化后的 props
2. 通过 `virtual:ubean-islands-registry`（扫描 `<script setup>` 中的导入生成）自动注册岛屿组件
3. 在 `app.mount()` 之后用双重 `requestAnimationFrame` 等待 Vue 完成一次渲染循环，然后水合所有岛屿
4. SPA 导航时（`router.afterEach`）自动水合新页面上的岛屿
5. 一段启动 IIFE 按指令策略设置 `data-hydrating`，`hydrateIslands()` 则用 `MutationObserver` 作为兜底

**岛屿要正常工作，`app.ts` 里不需要写任何代码：**

```typescript
// app.ts —— 岛屿无需任何代码
import { defineApp } from 'ubean/client';

export default defineApp({
  // 岛屿由框架自动水合
});
```

只需在 `<script setup>` 中导入组件并使用 `v-client.*` 指令 —— 其余交给 ubean：

```vue
<script setup lang="ts">
import Counter from '~/components/Counter.vue';
</script>

<template>
  <Counter v-client.load />
</template>
```

### 工作原理

1. **构建/开发扫描**：`ubeanIslandsPlugin` 扫描 `.vue` 文件中的 `v-client.*` 指令
2. **模板转换**：把岛屿组件标签替换为 `<ubean-island v-once>` 自定义元素（v-once 防止 Vue 覆盖已水合的内容）
3. **导入解析**：解析 `<script setup>` 中的导入，建立组件名到文件路径的映射
4. **虚拟模块**：生成 `virtual:ubean-islands-registry`，导出所有收集到的组件
5. **运行时桥接**：`ubean/client` 中的 `hydrateIslands` 自动导入该注册表，并与手动传入的 `components` 合并
6. **自动水合**：客户端入口在挂载后（双重 rAF）以及每次 SPA 导航后自动调用 `hydrateIslands()`
7. **HMR**：开发态新增 `v-client.*` 指令时自动更新注册表（full-reload）
8. **摇树优化**：只有实际使用 `v-client.*` 指令的组件才会进入客户端产物

### 手动注册（逃生通道）

对于自动注册不生效的边缘情况（全局注册的组件、`defineAsyncComponent`、动态 import），可以在 `onClientReady` 中调用 `hydrateIslands` 手动传入 `components`。**手动注册的优先级高于**自动注册：

```typescript
// app.ts —— 混合模式（自动 + 手动）
import { defineApp, hydrateIslands } from 'ubean/client';
import DynamicIsland from '~/components/DynamicIsland.vue';

export default defineApp({
  onClientReady: app => {
    // 框架会自动水合已注册的岛屿；在这里补充手动组件
    hydrateIslands({
      appContext: app,
      components: {
        // 该组件不是静态导入的，自动注册表找不到它
        DynamicIsland
      }
    });
  }
});
```

> **注意**：在 `onClientReady` 中手动调用 `hydrateIslands()` 时，它会在框架自动调用之外再执行一次。已水合的岛屿会通过 `data-hydrated` 属性被跳过，因此不会重复水合。手动组件会与自动注册的组件合并。

### 诊断

当注册表中找不到某个岛屿组件时，ubean 会在控制台输出一条有用的警告：

```
[ubean:islands] Island component "MyComp" not found in registry.
Possible causes:
  1. Component is globally registered or dynamically imported — pass it via hydrateIslands({ components: { MyComp: YourComp } })
  2. Component name mismatch between template tag and import
  3. Component is auto-imported by unplugin-vue-components (no static import → not in auto-registry)
Registered components: Counter, Chart, Comments
```

如果某个组件使用了 `v-client.*` 指令但没有静态导入，构建时会给出警告：

```
[ubean:islands] Component "GloballyRegistered" used with v-client.xxx directive in /src/pages/test.vue
has no corresponding static import in <script setup>. It will not be auto-registered.
Add it manually via hydrateIslands({ components: { GloballyRegistered: YourComp } }).
```

## 编程式岛屿：`defineIsland()`

对于编程式场景（例如模板指令不便于使用的动态组件解析），可以使用 `defineIsland(Component, strategy, options?)` 运行时包装器。它应用与 `v-client.*` 指令相同的水合策略。

```typescript
import { defineIsland } from 'ubean';
import Counter from '~/components/Counter.vue';

// strategy: 'load' | 'idle' | 'visible' | 'media' | 'only'
const CounterIsland = defineIsland(Counter, 'load');

// 'media' 策略需要 mediaQuery 选项
const MobileNavIsland = defineIsland(MobileNav, 'media', {
  mediaQuery: '(max-width: 768px)'
});

// 预设 props
const ProfileIsland = defineIsland(UserProfile, 'visible', {
  props: { theme: 'dark' }
});
```

| 参数 | 类型 | 说明 |
| ---------- | ------------------------------------------------- | -------------------------------------------------------- |
| Component  | Component                                         | 要包装为岛屿的 Vue 组件 |
| strategy   | `'load' \| 'idle' \| 'visible' \| 'media' \| 'only'` | 水合策略（对应 `v-client.*` 修饰符） |
| options    | `{ mediaQuery?: string, props?: Record<string, unknown> }` | `'media'` 策略必须提供 `mediaQuery`；`props` 用于预设 props |

## 服务端岛屿：`defineServerIsland()`

服务端岛屿使用 `defineServerIsland(Component, options?)` 运行时包装器。它把一个异步组件包进带 fallback 的 `<Suspense>`，设置 `inheritAttrs: false`，并把 attrs 与 slots 转发给内部组件。

```typescript
import { defineServerIsland } from 'ubean';
import AsyncChart from '~/components/AsyncChart.vue';

// 默认 fallback（<ubean-defer-fallback> 占位符）
const Chart = defineServerIsland(AsyncChart);

// 自定义 fallback（string | Component）
const ChartWithFallback = defineServerIsland(AsyncChart, {
  fallback: '<div class="skeleton">Loading…</div>'
});
```

`ServerIslandOptions = { fallback?: Component | string }` —— 省略时使用 `<ubean-defer-fallback>` 占位符。预渲染阶段只渲染 fallback（静态外壳）；流式 SSR 时，解析完成的异步组件通过 Suspense 边界流式输出。

## 性能建议

1. **控制岛屿数量**：只水合确实需要交互的部分
2. **用 `v-client.visible`**：延迟首屏之外的内容
3. **用 `v-client.idle`**：延迟非关键岛屿
4. **保持岛屿小巧**：把大组件拆成更小的岛屿
5. **预留空间**：为待水合内容预留空间，避免布局抖动
6. **无岛屿的静态页面**：不含任何 `v-client.*` 指令、也没有客户端交互的页面完全省去岛屿水合开销

## 最佳实践

1. **识别交互部分**：只把真正需要交互的组件标记为岛屿
2. **选对策略**：让指令修饰符与用户交互模式相匹配
3. **测试水合**：验证岛屿水合正常且控制台无报错
4. **关注性能**：用 DevTools 检查水合耗时
5. **避免在岛屿中写只适用于 SSR 的代码**：岛屿在服务端与客户端都会运行（`v-client.only` 除外）
