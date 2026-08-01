---
title: 群岛架构
description: 了解 ubean 的群岛架构与部分水合指令的使用方式。
status: translated-stub
---

# 群岛架构

本页面尚未翻译完成，请暂参考 [English version](/guide/islands)。

翻译完成后此提示将被移除。

## 从旧语法迁移

以下指令式语法已**移除**，改为显式函数调用 API：

| 已移除的语法 | 替代方案 | 适用场景 |
| --- | --- | --- |
| `<Comp server:defer />` 编译时指令 | `defineServerIsland(Component, options?)` 运行时包装器 | Server Islands |
| `<Comp client:load />` / `client:idle` / `client:visible` / `client:media` / `client:only` 属性语法 | `v-client.*` Vue 指令（模板）或 `defineIsland(Component, strategy, options?)`（编程式） | Client Islands |

**模板迁移** —— 将属性改写为指令形式（`media` 字符串字面量需加引号）：

```vue
<!-- 迁移前（已移除） -->
<Counter client:load />
<MobileNav client:media="(max-width: 768px)" />

<!-- 迁移后 -->
<Counter v-client.load />
<MobileNav v-client.media="'(max-width: 768px)'" />
```

**Server Island 迁移** —— 用 `defineServerIsland()` 替代 `server:defer` 指令：

```vue
<!-- 迁移前（已移除） -->
<template>
  <AsyncChart server:defer />
</template>

<!-- 迁移后 -->
<script setup lang="ts">
import { defineServerIsland } from 'ubean';
import AsyncChart from '~/components/AsyncChart.vue';
const Chart = defineServerIsland(AsyncChart);
</script>

<template>
  <Chart />
</template>
```

> `defineServerIsland(Component, options?)` 将异步组件包裹在 `<Suspense>` 中，设置 `inheritAttrs: false`，并将 attrs 和 slots 转发给内部组件。`ServerIslandOptions = { fallback?: Component | string }`，省略时使用 `<ubean-defer-fallback>` 占位符。
>
> `defineIsland(Component, strategy, options?)` 是 `v-client.*` 指令的编程式等价物，`strategy` 取值 `'load' | 'idle' | 'visible' | 'media' | 'only'`，`options` 为 `{ mediaQuery?: string, props?: Record<string, unknown> }`。
