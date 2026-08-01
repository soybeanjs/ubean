---
title: Islands Auto-Registry
---

# Islands 自动注册方案（方案 C）

> 本文档规划 `@ubean/islands` 的一项改进：通过 Vite 插件在构建/开发期自动扫描 `client:xxx` 指令用法,解析对应组件的 import 路径,生成 virtual module 作为 island 组件注册表,消除用户在 `app.ts` 中手动维护 `components` map 的负担。
>
> 状态图例：⬜ 待开始 | 🔄 进行中 | ✅ 已完成 | ⏸️ 暂缓
>
> 当前整体状态：**已完成（所有任务 ✅，含自动水合）**。文档版本：v1.1（2026-07-29）。
>
> **语法说明**：本方案撰写时使用的是旧版 `client:*` 属性语法。自 P9-29 起,推荐使用 `v-client.*` Vue 指令（`v-client.load` / `v-client.idle` / `v-client.visible` / `v-client.media` / `v-client.only`）；两种语法完全等价,由同一扫描器检测。下文示例保留原样以记录历史上下文。迁移对照表见 **[Islands → 指令参考](/zh/guide/islands#directive-reference)**。

---

## 1. 背景与问题陈述

### 1.1 当前 Islands 使用方式（v1.0 之前）

ubean 的 Islands 架构采用**组件级**指令式设计：在任意 `.vue` 页面中,通过 `client:xxx` 指令标记某个组件为 island,框架在 SSR 时将其转换为 `<ubean-island>` 自定义元素,客户端再根据指令策略择机水合。

```vue
<!-- pages/islands-test.vue -->
<template>
  <IslandCounter client:load />
  <IslandMedia client:media="(min-width: 768px)" />
</template>
```

```ts
// app.ts —— （v1.0 之前）必须手动维护 components 注册表并手动调用 hydrateIslands
import IslandCounter from './components/IslandCounter.vue';
import IslandMedia from './components/IslandMedia.vue';

const islandComponents = {
  IslandCounter,
  IslandMedia
};

export default defineApp({
  onClientReady: app => {
    hydrateIslands({
      components: islandComponents,
      appContext: app
    });
  }
});
```

> **v1.0+ 更新**：组件注册表已自动生成（方案 C），且框架自动调用 `hydrateIslands()`。现在 `app.ts` 中无需任何 islands 相关代码。

### 1.2 现状的核心痛点

| 痛点 | 说明 | 影响 |
| --- | --- | --- |
| **手动维护注册表** | 每新增一个 island 组件,除页面 import 外,还必须修改 `app.ts` 的 `components` map | 易遗漏,导致 island 静默不水合 |
| **名字字符串耦合** | SSR 输出 `data-component="IslandCounter"`,client 端 map 的 key 必须与组件名完全一致 | 重命名组件时,SSR 端 tag 名变了但 `app.ts` 的 key 未同步 → 运行时找不到组件 |
| **重复声明** | 组件在页面 `<script setup>` import 一次,在 `app.ts` 又 import 一次并注册 | 冗余,违反 DRY |
| **无 tree-shaking** | 所有 island 组件都打进 client bundle,即便某 island 只在一个页面用 | bundle 体积膨胀 |
| **错误难诊断** | 组件名不匹配时,框架 `resolveComponent` 返回 `null`,island 静默不水合,无任何警告 | 调试困难 |

### 1.3 现有实现的机制回顾

当前 Islands 的关键文件与职责：

| 文件 | 职责 |
| --- | --- |
| [packages/islands/src/vite.ts](../packages/islands/src/vite.ts) | Vite 插件：SSR 时扫描 `<Comp client:xxx />`,转换为 `<ubean-island data-component="Comp" ...>` |
| [packages/islands/src/runtime.ts](../packages/islands/src/runtime.ts) | 客户端 runtime：`collectIslands` 扫描 DOM,`hydrateIslands` 按指令策略水合,`resolveComponent` 按名查找 |
| [packages/islands/src/bootstrap.ts](../packages/islands/src/bootstrap.ts) | 注入到 HTML 的 bootstrap 脚本：DOM 就绪后按指令设置 `data-hydrating` 属性触发水合 |
| [examples/ubean-test/src/app.ts](../examples/ubean-test/src/app.ts) | 示例项目的手动注册入口 |

**关键约束**：SSR 端的 `transformTemplate`（[vite.ts#L160](../packages/islands/src/vite.ts#L160)）在转换模板时,只保留了组件的**名字字符串**（`data-component="IslandCounter"`）,不保留组件的文件路径或模块引用。这是当前必须手动维护注册表的根因。

---

## 2. 参考项目对比：void 的 import attributes 方案

### 2.1 void 的设计

void（[github: earendil-works/void](https://github.com/earendil-works/void)）采用**页面级** + **import attributes** 的 Islands 设计：

```vue
<!-- pages/blog/index.island.vue -->
<script setup>
import Counter from './_Counter.vue' with { island: 'load' };
import PostForm from './_PostForm.vue' with { island: 'visible' };
</script>

<template>
  <Counter />
  <PostForm />
</template>
```

**核心特征**：

1. **页面级 Islands**：`.island.vue` 后缀让整个页面成为 island page,该页面**没有 router、没有 Inertia 协议**,页面间导航是 full page load
2. **import attributes 即注册表**：`with { island: 'load' }` 同时承担两个职责：
   - 标记该 import 为 island（SSR 时渲染为静态 HTML + `<island>` 标记）
   - 让 bundler 自动将该模块纳入 client bundle（import 语句本身即注册）
3. **零手动注册**：bundler 根据 import attributes 自动生成 client 端的组件映射,用户无需维护任何 map

### 2.2 void 与 ubean 的架构差异

| 维度 | void | ubean |
| --- | --- | --- |
| **Islands 粒度** | 页面级（`.island.vue` 整页无 router） | 组件级（页面是带 router 的 SPA,特定组件逃逸为 island） |
| **标记位置** | import 语句（`with { island: 'load' }`） | 模板标签（`<Comp client:load />`） |
| **注册机制** | bundler 自动（import graph 即 registry） | 手动 `components` map |
| **页面 router** | island page 无 router,full page load 导航 | 页面始终有 router/pinia/i18n,island 是独立 Vue 实例 |
| **同组件多用途** | 同一组件要么是 island 要么不是（由 import 决定） | 同一组件可在 A 处当 island、B 处当普通组件（由使用处指令决定） |
| **导航体验** | island page 之间是 full page load,无 SPA 过渡 | 全 SPA 体验,island 只影响特定组件的水合时机 |

### 2.3 为何不直接照搬 void

| 原因 | 说明 |
| --- | --- |
| **架构前提不同** | void 的 import attributes 设计依附于「页面级无 router」前提；ubean 是组件级 islands,页面始终是 SPA,直接搬来会破坏 SPA 体验 |
| **指令语法已是既定事实** | ubean 的 `client:xxx` 指令语法已落地,示例项目、文档、AGENTS.md 均以此为标准；改为 import attributes 是破坏性变更 |
| **灵活性损失** | void 的方案下,同一组件不能在不同位置用不同指令（一个 import 只能有一个 `island` 值）；ubean 现有设计允许 `<Comp client:load />` 和 `<Comp client:idle />` 共存 |
| **import attributes 兼容性** | 需要 `"module": "ESNext"` 的 tsconfig 配置,对部分用户有迁移门槛 |
| **AGENTS.md 教训 #15** | 「不要复制参考项目代码 —— 学习架构模式后重新实现」；应借鉴「自动注册」理念,而非照搬语法 |

---

## 3. 方案 C：指令扫描 + 自动生成 registry

### 3.1 核心思路

**保留现有 `client:xxx` 指令语法不变,在 Vite 插件层面自动收集 island 组件并生成 virtual module 作为注册表,使 `hydrateIslands()` 的 `components` 参数从「必填」变为「可选」。同时框架在客户端入口自动调用 `hydrateIslands()`（双重 rAF 时机），并在 SPA 导航后自动水合，用户无需在 `onClientReady` 中手动调用。**

工作流程：

```
开发/构建期:
  1. ubeanIslandsPlugin.transform() 扫描 .vue 文件模板
  2. 发现 <IslandCounter client:load /> → 记录组件名 "IslandCounter"
  3. 同文件解析 <script setup> 的 import 语句 → 得到 IslandCounter 的文件路径
  4. 将组件标签替换为 <ubean-island v-once> 自定义元素（v-once 防止 Vue re-render 覆盖）
  5. 聚合所有文件的「组件名 → 文件路径」映射到 plugin 的 module graph
  6. 新增 virtual module "virtual:ubean-islands-registry"
     - 导入所有收集到的 island 组件
     - 导出 { name: component } 形式的 registry

运行时（客户端）:
  7. 客户端入口（virtual:ubean-app）在 app.mount() 后通过双重 rAF 自动调用 hydrateIslands()
  8. hydrateIslands() 默认从 virtual module 获取 registry
  9. SPA 导航后通过 router.afterEach 自动水合新页面的 islands
 10. 用户仍可在 onClientReady 中显式传 components 参数补充手动注册组件（escape hatch）
```

### 3.2 用户侧体验对比

#### 当前（手动注册）

```ts
// app.ts
import IslandCounter from './components/IslandCounter.vue';
import IslandClock from './components/IslandClock.vue';
import IslandMedia from './components/IslandMedia.vue';
import IslandOnly from './components/IslandOnly.vue';
import IslandVisibility from './components/IslandVisibility.vue';

const islandComponents = {
  IslandCounter, IslandClock, IslandVisibility, IslandMedia, IslandOnly
};

export default defineApp({
  onClientReady: app => {
    hydrateIslands({
      components: islandComponents,
      appContext: app
    });
  }
});
```

#### 方案 C 后（零配置 + 自动水合）

```ts
// app.ts —— 无需任何 islands 相关代码
export default defineApp({
  // islands 自动注册 + 自动水合，无需 onClientReady
});
```

> **自动水合机制**：客户端入口（`virtual:ubean-app`）在 `app.mount()` 后通过双重 `requestAnimationFrame` 自动调用 `hydrateIslands()`，并在 SPA 导航后通过 `router.afterEach` 自动水合新页面的 islands。仅在需要手动注册（全局组件、动态 import 等 escape hatch 场景）时才在 `onClientReady` 中额外调用 `hydrateIslands({ components })`。

页面侧用法完全不变：

```vue
<!-- pages/islands-test.vue —— 零改动 -->
<template>
  <IslandCounter client:load />
  <IslandMedia client:media="(min-width: 768px)" />
</template>
```

### 3.3 详细设计

#### 3.3.1 Vite 插件扩展

在 [packages/islands/src/vite.ts](../packages/islands/src/vite.ts) 的 `ubeanIslandsPlugin` 中扩展 `transform` hook,新增 island 组件收集逻辑。

**新增数据结构**：

```ts
interface IslandComponentEntry {
  /** 组件名,即 <IslandCounter client:load /> 中的 "IslandCounter" */
  name: string;
  /** 组件文件的绝对路径,来自 <script setup> 的 import 语句解析 */
  importPath: string;
  /** 发现该 island 的源文件路径,用于调试 */
  sourceFile: string;
}

/** Plugin 内部的 island 组件收集表:组件名 → 条目 */
type IslandComponentMap = Map<string, IslandComponentEntry>;
```

**扩展后的 transform hook 伪代码**：

```ts
export function ubeanIslandsPlugin(_options: UbeanIslandsPluginOptions = {}): Plugin {
  let viteConfig: ViteResolvedConfig;
  let enabled = true;
  // 新增:island 组件收集表
  const islandComponents: IslandComponentMap = new Map();
  // 新增:virtual module 的请求 ID
  const VIRTUAL_REGISTRY_ID = 'virtual:ubean-islands-registry';
  const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_REGISTRY_ID;

  return {
    name: 'ubean:islands',
    enforce: 'pre',

    configResolved(config) {
      viteConfig = config;
      enabled = _options.enabled !== false;
    },

    resolveId(id) {
      if (id === VIRTUAL_REGISTRY_ID) return RESOLVED_VIRTUAL_ID;
    },

    load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return null;
      // 生成 virtual module 内容:导入所有 island 组件并导出 registry
      return generateRegistryModule(islandComponents);
    },

    transform(code, id) {
      if (!enabled) return null;
      if (!isVueSfc(id)) return null;
      if (!DIRECTIVE_RE.test(code)) return null;

      // 1. 现有的模板转换逻辑(不变)
      const filePath = /* ... */;
      const result = transformVueSfcIslands(code, filePath);

      // 2. 新增:收集 island 组件名 + 解析 import 路径
      const collected = collectIslandComponents(code, filePath);
      for (const entry of collected) {
        islandComponents.set(entry.name, entry);
      }

      // 3. 如果有新增组件,触发 virtual module 失效
      if (collected.length > 0 && viteConfig.command === 'serve') {
        // dev 模式下让 virtual module 重新加载
        const server = viteConfig.server;
        if (server) {
          const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID);
          if (mod) server.moduleGraph.invalidateModule(mod);
        }
      }

      return result;
    }
  };
}
```

#### 3.3.2 组件名 → import 路径的解析

新增 `collectIslandComponents` 函数,负责从 `.vue` 文件中提取 island 组件名及其 import 路径。

```ts
import { parse } from '@vue/compiler-sfc';

/**
 * 从 Vue SFC 源码中收集 island 组件信息。
 *
 * 步骤:
 * 1. 用 @vue/compiler-sfc 解析 SFC,提取 <script setup> 内容
 * 2. 用正则或 oxc-parser 解析 import 语句,建立 { 局部名 → import 路径 } 映射
 * 3. 扫描模板中的 <Comp client:xxx /> 指令,得到组件名集合
 * 4. 交集:既在 import 映射中、又在 island 指令集合中的组件
 * 5. 将相对 import 路径解析为绝对路径
 */
function collectIslandComponents(code: string, sourceFile: string): IslandComponentEntry[] {
  const { descriptor } = parse(code, { filename: sourceFile });
  if (!descriptor.template) return [];

  // 步骤 1:解析 <script setup> 的 import 语句
  const importMap = parseScriptImports(descriptor.scriptSetup?.content ?? '');
  // importMap: Map<string, string>  例如 { "IslandCounter" => "../components/IslandCounter.vue" }

  // 步骤 2:扫描模板中的 island 指令,得到组件名集合
  const islandNames = scanIslandDirectiveNames(descriptor.template.content);
  // islandNames: Set<string>  例如 { "IslandCounter", "IslandMedia" }

  // 步骤 3:交集 + 解析为绝对路径
  const entries: IslandComponentEntry[] = [];
  for (const name of islandNames) {
    const importPath = importMap.get(name);
    if (!importPath) {
      // 组件可能是全局注册的,或来自 node_modules —— 记录警告,留待用户手动注册
      console.warn(
        `[ubean:islands] Component "${name}" used with client:xxx directive ` +
        `in ${sourceFile} has no corresponding import in <script setup>. ` +
        `It will not be auto-registered. Add it manually via hydrateIslands({ components: {...} }).`
      );
      continue;
    }
    const absolutePath = resolveImportPath(importPath, sourceFile);
    entries.push({ name, importPath: absolutePath, sourceFile });
  }
  return entries;
}
```

**import 语句解析的两种实现选择**：

| 实现 | 优点 | 缺点 |
| --- | --- | --- |
| **正则匹配** | 零依赖,简单 | 无法处理复杂 import(多行、动态 import、re-export) |
| **oxc-parser** | 健壮,与 ubean 其他包一致(`@ubean/build` 已用) | 增加包体积(但 ubean 已依赖) |

**推荐**：使用 oxc-parser 或 `@vue/compiler-sfc` 的 `compileScript`,与 ubean 现有工具链一致。

#### 3.3.3 Virtual Module 生成

新增 `generateRegistryModule` 函数,根据收集到的组件 map 生成 virtual module 代码。

```ts
/**
 * 生成 virtual:ubean-islands-registry 模块内容。
 *
 * 输出示例:
 *   import __island_0 from '/src/components/IslandCounter.vue';
 *   import __island_1 from '/src/components/IslandMedia.vue';
 *   export const islands = {
 *     IslandCounter: __island_0,
 *     IslandMedia: __island_1
 *   };
 */
function generateRegistryModule(components: IslandComponentMap): string {
  if (components.size === 0) {
    return 'export const islands = {};';
  }

  const imports: string[] = [];
  const entries: string[] = [];

  let idx = 0;
  for (const [name, entry] of components) {
    const varName = `__island_${idx++}`;
    imports.push(`import ${varName} from ${JSON.stringify(entry.importPath)};`);
    entries.push(`  ${JSON.stringify(name)}: ${varName}`);
  }

  return [
    ...imports,
    '',
    'export const islands = {',
    ...entries,
    '};'
  ].join('\n');
}
```

#### 3.3.4 Runtime 层改造

修改 [packages/islands/src/runtime.ts](../packages/islands/src/runtime.ts) 的 `hydrateIslands` 函数,使 `components` 参数变为可选,并默认从 virtual module 导入。

**问题**：runtime.ts 当前是「无依赖」的纯浏览器代码（手写了 DOM/MutationObserver 接口类型,避免引入 Vue 类型）。如果直接 `import { islands } from 'virtual:ubean-islands-registry'`,会让 runtime 强依赖 Vite 环境。

**解决方案**：分层处理：

1. **runtime.ts 保持纯净**：`hydrateIslands` 的 `components` 参数仍为可选,但**不**直接 import virtual module
2. **新增桥接模块**：在 `@ubean/runtime/vue`（客户端入口）中提供 `hydrateIslands` 的包装版本,自动从 virtual module 导入 registry

```ts
// packages/runtime/src/vue/islands.ts（新增桥接模块）
import { hydrateIslands as _hydrateIslands } from '@ubean/islands/runtime';
import { islands as autoIslands } from 'virtual:ubean-islands-registry';

export function hydrateIslands(options: Omit<HydrateIslandsOptions, 'components'> & {
  components?: Record<string, Component>;
} = {}) {
  const { components: manual = {}, ...rest } = options;
  // 手动注册优先,自动注册兜底
  const components = { ...autoIslands, ...manual };
  return _hydrateIslands({ components, ...rest });
}
```

3. **用户侧导入路径调整**：

```ts
// app.ts
// 改前:从 ubean/runtime/vue 导入 hydrateIslands
import { hydrateIslands } from 'ubean/runtime/vue';

// 改后:不变(ubean/runtime/vue 内部 re-export 桥接模块)
import { hydrateIslands } from 'ubean/runtime/vue';
// 但现在 components 参数可选了
```

#### 3.3.5 dev 模式的热更新

dev 模式下,用户可能新增 island 组件用法,需要 virtual module 实时更新。

```ts
// 在 transform hook 中,发现新的 island 组件时
if (viteConfig.command === 'serve' && collected.length > 0) {
  const server = viteConfig.server;
  if (server) {
    // 失效 virtual module,触发重新加载
    const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID);
    if (mod) {
      server.moduleGraph.invalidateModule(mod);
      // 通知依赖该 virtual module 的模块重新加载
      server.ws.send({ type: 'full-reload' });
    }
  }
}
```

**优化点**：可以用 HMR boundary 精确更新,而非 full-reload,但首版可用 full-reload 保证正确性。

#### 3.3.6 SSR 端无影响

SSR 端**无需改动**：`transformVueSfcIslands` 仍然只输出 `<ubean-island data-component="...">`,组件名仍是字符串。变化只在客户端 registry 的生成方式。

#### 3.3.7 与现有 `components` 参数的兼容

```ts
// runtime.ts 的 resolveComponent 逻辑不变
function resolveComponent(
  name: string,
  components: Record<string, Component | (() => Promise<Component>)>,
  getComponent?: (name: string) => Component | Promise<Component> | null
): Component | Promise<Component> | null {
  if (components[name]) return components[name];   // 优先查注册表
  if (getComponent) return getComponent(name);
  return null;
}
```

桥接模块合并自动注册与手动注册：

```ts
const components = { ...autoIslands, ...manual };
// 手动注册覆盖自动注册,允许用户对特定组件做特殊处理
```

### 3.4 边缘场景处理

| 场景 | 处理方式 |
| --- | --- |
| **组件名与 import 局部名不一致**（`import Foo from './Bar.vue'` 后 `<Foo client:load />`） | 以模板中使用的标签名（`Foo`）为准,在 import 映射中按局部名 `Foo` 查找 |
| **动态组件**（`<component :is="dynamicName" client:load />`） | 无法静态分析 → 记录警告,留待用户手动注册 |
| **全局注册的组件**（`app.component('IslandCounter', ...)`） | import 映射查不到 → 记录警告,用户需手动传 `components` |
| **`node_modules` 中的组件**（`import Foo from 'some-lib'`） | 正常工作,import 路径是 bare specifier,Vite 能解析 |
| **`defineAsyncComponent` 包装**（`const Foo = defineAsyncComponent(() => import('./Foo.vue'))`） | 首版不自动识别 → 记录警告,用户手动注册；后续可增强解析 |
| **同一组件在多文件作为 island 使用** | map 去重,以首次发现的 import 路径为准；若不同文件 import 路径不同,记录警告 |
| **同文件多次使用同组件为 island**（`<Foo client:load />` + `<Foo client:idle />`） | 正常工作,组件名相同,只注册一次,指令由 SSR 端各自序列化 |
| **dev 模式新增 island 用法** | transform hook 重新扫描 → 更新 map → 失效 virtual module → HMR |
| **构建模式（production build）** | 所有 .vue 文件在构建期被 transform 一次,registry 一次性生成完毕 |

### 3.5 错误诊断增强

当前 `resolveComponent` 返回 `null` 时静默失败。方案 C 同时增强诊断：

```ts
// runtime.ts 的 hydrateIsland 中
function resolveComponent(
  name: string,
  components: Record<string, Component | (() => Promise<Component>)>,
  getComponent?: (name: string) => Component | Promise<Component> | null
): Component | Promise<Component> | null {
  if (components[name]) return components[name];
  if (getComponent) return getComponent(name);

  // 新增:诊断警告
  console.warn(
    `[ubean:islands] Island component "${name}" not found in registry.\n` +
    `Possible causes:\n` +
    `  1. Component is globally registered or dynamically imported — pass it via hydrateIslands({ components: { ${name}: YourComp } })\n` +
    `  2. Component name mismatch between template tag and import\n` +
    `Registered components: ${Object.keys(components).join(', ') || '(none)'}`
  );
  return null;
}
```

---

## 4. 实施计划

### 4.1 任务拆解

| ID | 任务 | 说明 | 状态 |
| --- | --- | --- | --- |
| IS-01 | 扩展 `@ubean/islands` Vite 插件 | 新增 `collectIslandComponents`、`generateRegistryModule`、virtual module `load`/`resolveId` hook | ✅ |
| IS-02 | 选择并集成 import 语句解析器 | 评估 `@vue/compiler-sfc` `compileScript` vs oxc-parser,与 `@ubean/build` 现有依赖对齐 | ✅ |
| IS-03 | 新增 `@ubean/runtime/vue` 桥接模块 | `hydrateIslands` 包装,自动合并 auto registry + 手动 registry | ✅ |
| IS-04 | dev 模式 HMR 支持 | virtual module 失效 + 热更新通知 | ✅ |
| IS-05 | 错误诊断增强 | `resolveComponent` 失败时输出警告 + 已注册组件列表 | ✅ |
| IS-06 | 更新 `examples/ubean-test` | 移除 `app.ts` 中的手动 `components` map,验证零注册可用 | ✅ |
| IS-07 | 单元测试 | `collectIslandComponents`、`generateRegistryModule`、桥接模块合并逻辑 | ✅ |
| IS-08 | 集成测试 | dev 模式新增 island → HMR 生效；production build → registry 正确生成 | ✅ |
| IS-09 | 文档更新 | 更新 [skills/ubean/docs/guide/islands.md](../skills/ubean/docs/guide/islands.md)（若存在）、AGENTS.md 相关段落、本文档状态 | ✅ |
| IS-10 | 类型声明 | `virtual:ubean-islands-registry` 的 TypeScript 类型声明（`src/vite-env.d.ts` 或 `@ubean/islands/types`） | ✅ |

### 4.2 依赖关系

```
IS-02 ──► IS-01 ──► IS-03 ──► IS-06
              │           │
              ▼           ▼
             IS-04       IS-07
              │           │
              ▼           ▼
             IS-08 ◄──── IS-05
              │
              ▼
             IS-09, IS-10
```

### 4.3 兼容性与迁移

**向后兼容性**：✅ 完全兼容

- `components` 参数从「必填」变「可选」,老代码无需任何改动
- 手动注册的组件与自动注册的组件合并（手动优先）
- 现有 `<Comp client:xxx />` 语法零改动
- 现有 SSR 转换逻辑零改动

**迁移路径**：

1. 升级 `@ubean/islands` 到含方案 C 的版本
2. （可选）删除 `app.ts` 中的 `components` map 和相关 import
3. 验证 islands 仍正常水合

**渐进式采用**：用户可选择：
- 完全依赖自动注册（删除手动 map）
- 完全依赖手动注册（不使用自动注册,行为与当前一致）
- 混合模式（大部分靠自动注册,边缘场景手动补充）

---

## 5. 取舍与备选方案

### 5.1 方案 C 的优势

| 优势 | 说明 |
| --- | --- |
| **零手动注册** | 消除 `app.ts` 中重复的 import + 注册,避免遗漏 |
| **零破坏性变更** | 保留 `client:xxx` 指令语法,`components` 参数变为可选 |
| **自动 tree-shaking** | 只有真正用了 `client:xxx` 的组件才进 registry,未使用的 island 组件不打包 |
| **保留灵活性** | 同一组件可在 A 处当 island、B 处当普通组件；不同处可用不同指令 |
| **契合 ubean 架构** | 利用已有 virtual module 模式（`virtual:ubean-pages`、`virtual:ubean-routes` 等） |
| **诊断友好** | 自动注册 + 增强警告,大幅降低「island 静默不水合」的排查成本 |
| **escape hatch 保留** | `components` 参数仍可手动传,处理 `node_modules`、全局注册、动态 import 等边缘场景 |

### 5.2 方案 C 的代价

| 代价 | 说明 | 缓解 |
| --- | --- | --- |
| **实现复杂度** | 需解析 `<script setup>` import 语句,处理各种 import 形式 | 复用 `@vue/compiler-sfc` 或 oxc-parser,ubean 已有依赖 |
| **静态分析局限** | 无法处理动态组件、全局注册、`defineAsyncComponent` | 记录警告 + escape hatch 手动注册 |
| **dev HMR 复杂度** | 新增 island 用法需触发 virtual module 重建 | 首版用 full-reload,后续优化为精确 HMR |
| **包体积** | `@ubean/islands` 增加 SFC 解析依赖 | `@vue/compiler-sfc` 已是 ubean 间接依赖；或用 oxc-parser 共享 `@ubean/build` 的依赖 |

### 5.3 备选方案对比

| 方案 | 思路 | 优点 | 缺点 | 结论 |
| --- | --- | --- | --- | --- |
| **A. 照搬 void（import attributes）** | `import Foo from './Foo.vue' with { island: 'load' }` | 零注册、bundler 自动收集 | 破坏现有指令语法、丢失组件级灵活性、import attributes 兼容性门槛 | ❌ 不采用 |
| **B. 约定式 glob 注册** | `components/islands/` 目录或 `.island.vue` 后缀的组件自动注册 | 实现简单、零注册 | 需约定目录/后缀、glob 引入所有匹配文件（依赖 tree-shaking）、无法处理 `node_modules` 组件 | ⚠️ 可作为补充,非首选 |
| **C. 指令扫描 + 自动 registry（本方案）** | 扫描 `client:xxx` 用法 + 解析 import 路径,生成 virtual module | 零注册、零破坏、自动 tree-shake、保留灵活性 | 实现复杂、静态分析局限 | ✅ 采用 |
| **D. 组件路径注入 data-* 属性** | SSR 时在 `<ubean-island>` 上额外存 `data-import-path`,client 端动态 `import()` | 零注册、无需 virtual module | HTML 暴露文件路径（安全问题）、bundler 无法静态分析动态 import 路径 → 无法 chunk | ❌ 不采用 |

### 5.4 方案 B 作为补充

方案 C 可与方案 B 共存：方案 C 处理「有明确 import 的 island 组件」,方案 B 处理「约定目录下的备选 island 组件」。但首版只实施方案 C,避免过度设计。

---

## 6. 开放问题（已全部解决）

| # | 问题 | 最终决策 | 说明 |
| --- | --- | --- | --- |
| Q1 | import 语句解析用 `@vue/compiler-sfc` 的 `compileScript` 还是 oxc-parser? | **正则匹配** | 最终选择零依赖的正则实现,支持 default import、`default as` 别名、混合 import,无需引入额外包,`@ubean/islands` 包体积零增长 |
| Q2 | virtual module 命名:`virtual:ubean-islands-registry` 还是 `ubean:islands`? | **`virtual:ubean-islands-registry`** | 遵循 AGENTS.md §8 教训 #7:用 `virtual:ubean-` 前缀 |
| Q3 | 桥接模块放在 `@ubean/runtime/vue` 还是 `@ubean/islands/runtime`? | **`ubean/runtime/vue`** | 客户端入口,避免 runtime.ts 引入 Vite 依赖;`ubean` 主包的 `runtime/vue` 子路径覆盖 `@ubean/runtime` 的 `hydrateIslands` |
| Q4 | 同一组件在不同文件 import 路径不同时如何处理? | **警告 + 首次发现优先** | `updateRegistry` 检测到 import 路径不一致时输出警告,以首次发现的路径为准 |
| Q5 | 是否需要支持 `.tsx`/`.jsx` 中的 island 指令? | **首版只支持 `.vue`** | ubean 是 Vue 专属框架,`.vue` SFC 是唯一页面格式 |
| Q6 | production build 时如何确保 registry 完整? | **build 期 transform 全量扫描** | 所有 `.vue` 文件在 build 期被 transform 一次,registry 在 `load` hook 时一次性生成完毕 |

---

## 7. 验收标准（已全部通过）

| # | 标准 | 验证方式 | 结果 |
| --- | --- | --- | --- |
| AC-1 | `examples/ubean-test` 删除 `app.ts` 中的 `components` map 后,islands 仍正常水合 | 手动测试 + 集成测试 | ✅ |
| AC-2 | 新增 island 组件用法时,dev 模式自动识别,无需修改 `app.ts` | 手动测试 | ✅ |
| AC-3 | production build 的 client bundle 只包含实际使用的 island 组件 | bundle 分析 | ✅ |
| AC-4 | 手动传 `components` 参数时,与自动注册正确合并（手动优先） | 单元测试 | ✅ |
| AC-5 | 组件名不匹配时,console 输出清晰的诊断警告 | 手动测试 | ✅ |
| AC-6 | 现有测试全部通过,无回归 | `pnpm test` | ✅ 33 tests passing |
| AC-7 | 类型检查通过 | `pnpm typecheck` | ✅ |

---

## 8. 参考资料

- [packages/islands/src/vite.ts](../packages/islands/src/vite.ts) — 当前 Vite 插件实现
- [packages/islands/src/runtime.ts](../packages/islands/src/runtime.ts) — 当前客户端 runtime
- [packages/islands/src/bootstrap.ts](../packages/islands/src/bootstrap.ts) — Bootstrap 脚本
- [examples/ubean-test/src/app.ts](../examples/ubean-test/src/app.ts) — 当前手动注册示例
- [examples/ubean-test/src/pages/islands-test.vue](../examples/ubean-test/src/pages/islands-test.vue) — Islands 测试页面
- [skills/void/docs/guide/pages-routing/islands.md](file:///Users/soybean/Web/Projects/OpenSource/void/skills/void/docs/guide/pages-routing/islands.md) — void Islands 文档（参考）
- [AGENTS.md](../AGENTS.md) §8 教训 #7、#15 — 虚拟模块前缀与参考项目处理约定
