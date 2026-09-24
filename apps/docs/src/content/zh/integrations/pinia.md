---
title: Pinia
description: 通过内置的 @ubean/integrations/pinia 集成使用 Pinia 状态管理。
translatedFrom: 736a2e06cafa
sections: ["589f8092","e3b0c442","29736812","54d9a1e4","bb8ea5f1","37f210b4","e5df4d24","b114995a","1cbe6fed","63bfd61a","5e26f4d5","ddf45265","a3ab4229","f9616990","3fc4b054","9a639767","4779b1ac","203e42e7","6087b529","d17ff600","90c315c9","dd04f506","6f1c1ad9","659a188b","095a13b4","41c93cd1","2ad18bba","30678943","0d19ab46","2ee66e7d","a291b330","fbf1c818"]
---

# Pinia 状态管理（@ubean/integrations/pinia）

`@ubean/integrations/pinia` 是 ubean 的**内置状态管理集成**，它把 [Pinia](https://pinia.vuejs.org/)——Vue 官方状态管理库——接入框架。该模块只是一层很薄的编排，负责把 Pinia 的开发态优化与 SSR 状态水合接到 ubean 的 Vite 流水线和 SSR 协议上。Pinia 本身仍直接从 `pinia` 包导入使用。

## 特性

- 一行启用：在 `ubean.config.ts` 中写 `pinia: true`
- 开发态对 `pinia` 做 `optimizeDeps` 预打包 —— dev 首屏加载更快
- 通过 `defineApp({ serializeState, hydrateState })` 钩子实现 SSR 状态水合
- 零侵入：Pinia 的 API（`createPinia`、`defineStore`、`storeToRefs`…）直接从 `pinia` 导入
- 通过 `UbeanPiniaOptions` 获得类型安全配置
- 安全降级：取不到 `$pinia` 时序列化返回 `{}`；state 为 `null` 或没有 `pinia` 字段时，水合是空操作

## 安装

`@ubean/integrations/pinia` 是内置集成（`@ubean/integrations` 的子路径）。在项目中与 `pinia` 一起安装：

```bash
pnpm add @ubean/integrations/pinia pinia
```

> `pinia` 是 peer dependency —— 版本由你控制。`@ubean/integrations/pinia` 支持 `pinia@^2.0.0 || ^3.0.0`。

## 配置

### 最小配置

最简配置只启用开发态的预打包优化：

```typescript
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  pinia: true
});
```

然后在 `src/app.ts` 中注册 Pinia 与 SSR 水合钩子：

```typescript
// src/app.ts
import { createPinia } from 'pinia';
import { serializePiniaState, hydratePiniaState } from '@ubean/integrations';
import { defineApp } from 'ubean';

export default defineApp({
  plugins: [createPinia()],
  serializeState: serializePiniaState,
  hydrateState: hydratePiniaState
});
```

这样做可以获得：
- dev 阶段 `pinia` 已预打包，首屏加载更快
- 服务端状态被序列化进 HTML 的 `__UBEAN_STATE__` script 标签
- 客户端在 `app.mount()` 之前完成水合（因此 store 里已经是 SSR 状态）

### 关闭模块

显式关闭该模块（等同于不写这个字段）：

```typescript
export default defineConfig({
  pinia: false
});

// 或
export default defineConfig({
  pinia: { disabled: true }
});
```

### 关闭 dev 阶段的 optimizeDeps

如果你给 `pinia` 配了自定义 alias，或使用 monorepo 内的本地 `pinia` 源码，请关闭预打包：

```typescript
export default defineConfig({
  pinia: { optimizeDeps: false }
});
```

## 用法

### 定义 store

store 的定义方式与常规 Pinia 完全一致：

```typescript
// src/stores/counter.ts
import { defineStore } from 'pinia';

export const useCounterStore = defineStore('counter', {
  state: () => ({
    count: 0,
    name: 'Counter'
  }),
  getters: {
    double: state => state.count * 2,
    // 带类型推断
    doubleCount(): number {
      return this.count * 2;
    }
  },
  actions: {
    increment() {
      this.count++;
    },
    async fetchInitial() {
      const res = await fetch('/api/counter');
      this.count = await res.json();
    }
  }
});
```

Composition API 风格（setup store）同样完整支持：

```typescript
import { ref, computed } from 'vue';
import { defineStore } from 'pinia';

export const useUserStore = defineStore('user', () => {
  const name = ref('');
  const isAdmin = ref(false);

  const displayName = computed(() => name.value || 'Guest');

  async function login(email: string, password: string) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    const user = await res.json();
    name.value = user.name;
    isAdmin.value = user.role === 'admin';
  }

  return { name, isAdmin, displayName, login };
});
```

### 在组件中使用 store

```vue
<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useCounterStore } from '~/stores/counter';

const store = useCounterStore();

// 解构并保留响应性
const { count, double } = storeToRefs(store);

// action 可以直接解构
const { increment } = store;
</script>

<template>
  <div>
    <p>Count: {{ count }}</p>
    <p>Double: {{ double }}</p>
    <SButton @click="increment">Increment</SButton>
  </div>
</template>
```

### 在 API 路由 / 数据加载器中使用 store

在 ubean 的服务端 handler 里，通常不会跨请求共享 Pinia 状态 —— 每个 SSR 请求都会创建全新的应用实例。若确实需要，请在 `defineApp` 的 `onAppCreated` 中，或通过 SSR 应用实例在数据加载器内部使用 Pinia store。

请求作用域的数据请优先使用 loader/action 数据协议而非 Pinia。Pinia 最适合承载客户端共享状态（UI 状态、缓存数据、用户偏好）。

## 工作原理

`@ubean/integrations/pinia` 是一层薄封装。当设置了 `pinia: true` 时：

1. **模块系统加载** `@ubean/integrations/pinia`，并调用 `ubeanPiniaPlugin(options)`（其中 `options` 来自 `extractBuiltinOptions(config.pinia)` —— 对象原样透传，只剥离模块系统专用的 `disabled` 标记；`true` 则得到 `{}`）。

2. **dev optimizeDeps**：`ubeanPiniaPlugin` 把 `pinia` 加入 Vite 的 `optimizeDeps.include`，确保 Pinia 被预打包，从而在 dev 首屏加载更快。这避免了首次请求时的依赖扫描延迟。

3. **SSR 序列化**：当 `serializePiniaState` 被配置为 `defineApp({ serializeState })` 时，ubean 的 SSR 渲染器会在 `renderToString(app)` 完成后调用它。该函数读取 `app.config.globalProperties.$pinia.state.value`，返回 `{ pinia: ... }`。渲染器把它序列化为 JSON，并以 `<script id="__UBEAN_STATE__" type="application/json">` 注入 HTML。

4. **客户端水合**：当 `hydratePiniaState` 被配置为 `defineApp({ hydrateState })` 时，ubean 客户端入口会在 `applyAppConfig(app, config, 'client')`（该调用把 `createPinia()` 注册为插件）之后、**`app.mount()` 之前**调用它。该函数从反序列化后的 state 中读取 `pinia` 字段，并赋值给 `pinia.state.value`。

> 水合必须发生在 `mount` 之前 —— 否则 store 已经用默认状态初始化完毕，水合就成了空操作。ubean 的客户端入口保证了这一顺序。

## SSR 状态流转

```
┌─────────────────────────────────────────────────────────────────┐
│ 服务端                                                          │
│                                                                 │
│  createSSRApp(initialPage)                                      │
│  applyAppConfig → app.use(createPinia())                        │
│  router.push(url) → renderToString(app)                         │
│  serializeState(app) → { pinia: pinia.state.value }             │
│  HTML = shell.replace(STATE_MARKER, <script id=__UBEAN_STATE__>)│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼  （内嵌状态的 HTML）
┌─────────────────────────────────────────────────────────────────┐
│ 客户端                                                          │
│                                                                 │
│  createApp()                                                    │
│  applyAppConfig → app.use(createPinia())                        │
│  state = getInitialState()  // 读取 __UBEAN_STATE__             │
│  hydrateState(app, state) → pinia.state.value = state.pinia     │
│  app.mount('#app')  // store 已完成水合                         │
└─────────────────────────────────────────────────────────────────┘
```

## 编程式 API

```typescript
import { ubeanPiniaPlugin, definePiniaConfig } from '@ubean/integrations/pinia';
import { serializePiniaState, hydratePiniaState } from '@ubean/integrations';
import type { UbeanPiniaOptions, PiniaSerializedState } from '@ubean/integrations/pinia';
```

### `ubeanPiniaPlugin(options?: UbeanPiniaOptions): Plugin[]`

返回一组 Vite 插件。通常由模块系统自动调用；只有在 `ubean.config.ts` 之外集成时才需要手动调用。

### `definePiniaConfig(options: UbeanPiniaOptions): UbeanPiniaOptions`

用于编写 `UbeanPiniaOptions` 的类型安全辅助函数，带自动补全。原样返回入参。

### `serializePiniaState(app: VueApp): PiniaSerializedState`

SSR 序列化辅助函数。读取 `app.config.globalProperties.$pinia.state.value`，返回 `{ pinia: <深拷贝后的状态> }`。检测不到 `$pinia` 时（例如未注册 `createPinia()`）返回 `{}` —— 不会抛错。

### `hydratePiniaState(app: VueApp, state: Record<string, unknown> | null): void`

客户端水合辅助函数。把 `state.pinia` 赋值给 `pinia.state.value`。`state` 为 `null` 或没有 `pinia` 字段时是空操作。在应用上检测不到 `$pinia` 时会向控制台告警（这是配置错误：配置了 `hydrateState` 却没注册 `createPinia()`）。

### `UbeanPiniaOptions`

```typescript
export interface UbeanPiniaOptions {
  /** 插件是否启用（默认 true）。注意：在 ubean.config.ts 中
   * 模块系统的选项是 `disabled?: boolean`（语义相反）。 */
  enabled?: boolean;
  /**
   * 是否把 `pinia` 加入 Vite 的 `optimizeDeps.include`（默认 true）。
   *
   * dev 阶段预打包可避免首次请求时的依赖扫描延迟。
   * 若使用自定义 `pinia` alias 或 monorepo 内的本地 pinia 源码，请关闭。
   */
  optimizeDeps?: boolean;
}
```

### `PiniaSerializedState`

```typescript
export interface PiniaSerializedState {
  /** Pinia 根状态（pinia.state.value） */
  pinia?: Record<string, unknown>;
  /** 允许扩展自定义字段 */
  [key: string]: unknown;
}
```

> 通过 `ubean.config.ts` 配置时，框架读取的是 `pinia: true | UbeanPiniaOptions`。模块系统会把选项直接传给 `ubeanPiniaPlugin`。

## 最佳实践

1. **`pinia: true` 必须与 app.ts 里的钩子配套**：`pinia: true` 只开启 dev 预打包。SSR 状态水合需要在 `defineApp` 中配置 `serializePiniaState` / `hydratePiniaState`。否则 SSR 渲染出的 store 会在客户端水合时被重置为默认值。

2. **每个应用一个 Pinia 实例**：在 `defineApp({ plugins: [createPinia()] })` 中只调用一次 `createPinia()`。状态水合假定应用上只有一个 `$pinia`。

3. **服务端 Pinia 状态保持在单请求作用域内**：每个 SSR 请求都会创建全新的 Vue 应用（进而全新的 Pinia）。请让 Pinia 实例只属于该请求 —— 挂在模块作用域的实例会在请求之间泄漏状态。

4. **请求作用域的数据用数据加载器（loader）**：随请求变化的数据（例如用户相关数据、路由参数）请优先使用 ubean 的页面 loader/action 协议。Pinia 更适合需要跨路由存活的客户端共享状态（UI 状态、缓存数据、用户偏好）。

5. **在 mount 之前水合**：ubean 客户端入口保证 `hydrateState` 在 `app.mount()` 之前执行。如果你自定义了入口，请保留这一顺序 —— 否则 store 会用默认值初始化，水合结果丢失。

6. **Pinia 与群岛（islands）**：Pinia 状态存在于主 Vue 应用中。islands（`v-client.load`、`v-client.idle` 等）是独立的 Vue 子树，不会自动共享主应用的 Pinia 实例。如果某个 island 需要 Pinia，请在它自己的应用上安装，或通过 props 传入状态。

## 故障排查

### 水合之后 store 被重置为默认值

- 确认 `serializePiniaState` 与 `hydratePiniaState` 都已在 `defineApp` 中配置
- 检查 `createPinia()` 是否写在 `defineApp({ plugins: [...] })` 里（而不是事后通过 `onAppCreated` 注册）
- 查看渲染出的 HTML 中是否含 `<script id="__UBEAN_STATE__" type="application/json">` —— 它应包含序列化后的状态
- 确认 `hydrateState` 在 `app.mount()` 之前执行（默认客户端入口已保证）

### 告警：“hydrateState was called but no $pinia was detected on the app”

这说明 `hydratePiniaState` 被调用了，但 `createPinia()` 没有作为插件注册。修复方式：

```typescript
// src/app.ts
import { createPinia } from 'pinia';
import { hydratePiniaState } from '@ubean/integrations';

export default defineApp({
  plugins: [createPinia()], // <-- 这一行必需
  hydrateState: hydratePiniaState
});
```

### dev 阶段 Pinia 没有被预打包

- 确认 `ubean.config.ts` 中设置了 `pinia: true`（或 `pinia: { ... }`）
- 运行 `ubean dev`，查看 Vite 的 optimizeDeps 输出 —— `pinia` 应出现在 `optimizeDeps.include` 中
- 若使用了自定义 Vite 配置，确认 `ubeanPiniaPlugin` 的输出没有被过滤掉

### `@ubean/integrations` 报类型错误

- 运行 `ubean prepare` 重新生成类型声明
- 确认 `tsconfig.json` 包含了 `@ubean/integrations/pinia` 的类型
- 运行时辅助函数请确保从 `@ubean/integrations`（而不是 `@ubean/integrations/pinia`）导入

## 示例

### 带 SSR 的计数器

```vue
<!-- src/pages/counter.vue -->
<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useCounterStore } from '~/stores/counter';

const store = useCounterStore();
const { count, double } = storeToRefs(store);
</script>

<template>
  <div class="flex flex-col items-center gap-4">
    <h1>Counter</h1>
    <p class="text-4xl font-bold">{{ count }}</p>
    <p class="text-sm text-gray-500">Double: {{ double }}</p>
    <div class="flex gap-2">
      <SButton variant="outline" @click="store.count--">-</SButton>
      <SButton @click="store.increment()">+</SButton>
    </div>
  </div>
</template>
```

```typescript
// src/stores/counter.ts
import { defineStore } from 'pinia';

export const useCounterStore = defineStore('counter', {
  state: () => ({ count: 0 }),
  getters: {
    double: state => state.count * 2
  },
  actions: {
    increment() {
      this.count++;
    }
  }
});
```

计数状态可以跨导航与 SSR 水合存活 —— 无需额外配置。

### 主题切换

```typescript
// src/stores/theme.ts
import { defineStore } from 'pinia';

export const useThemeStore = defineStore('theme', {
  state: () => ({
    mode: 'light' as 'light' | 'dark'
  }),
  actions: {
    toggle() {
      this.mode = this.mode === 'light' ? 'dark' : 'light';
    }
  }
});
```

```vue
<!-- src/layouts/default.vue -->
<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useThemeStore } from '~/stores/theme';

const theme = useThemeStore();
const { mode } = storeToRefs(theme);
</script>

<template>
  <div :class="mode">
    <header>
      <SButton variant="ghost" size="sm" @click="theme.toggle()">
        {{ mode === 'light' ? '🌙' : '☀️' }}
      </SButton>
    </header>
    <main><slot /></main>
  </div>
</template>
```

## 资源

- [Pinia Documentation](https://pinia.vuejs.org/)
- [Pinia SSR Guide](https://pinia.vuejs.org/ssr/)
- [Pinia on GitHub](https://github.com/vuejs/pinia)
- [Vue 3 Documentation](https://vuejs.org/)
