---
title: UI 组件库
description: 通过 @ubean/integrations/ui 集成的 @vean/ui UI 组件库。
translatedFrom: e8e2dd8287b6
sections: ["82094b02","e3b0c442","cae21a09","87339f35","c10c8730","90185c55","37f210b4","8c2eb6c6","f23f092c","bc0032f2","63bfd61a","f188bd51","fc378b7d","b5ca49fb","4ae887be","7c5d50ca","9adcf45a","6247a8b4","0d381085","2d3bc74b","3e8cd364","bc5287aa","930d3aef","f4825344","659a188b","033b24d2","c19b2854","f50ae296","38a8b234","0d19ab46","e01bf520","c1288afd","f7f6bce1"]
---

# UI 组件库（@vean/ui）

`@ubean/integrations/ui` 是 ubean 的**内置 UI 集成**，它接入了 [`@vean/ui`](https://www.npmjs.com/package/@vean/ui) —— 一个 shadcn 风格的 Vue 组件库。该模块只是一层很薄的编排，负责把 `@vean/ui` 的组件 resolver 与（可选的）预构建样式接进 ubean 的 Vite 流水线。组件库本身仍直接从 `@vean/ui` 导入使用。

## 特性

- 一行启用：在 `ubean.config.ts` 中写 `ui: true`
- `UiResolver` 自动注册 —— `S*` 组件（`SButton`、`SInput`、`SConfigProvider`…）首次使用时自动导入，无需手写 `import`
- 两种样式模式：
  - **预构建 CSS**（默认）：`@vean/ui/styles.css` 自动注入客户端入口 —— 零 CSS 配置
  - **UnoCSS 模式**（`css: false`）：使用 `@vean/unocss` preset 实现原子化样式与主题
- 通过 `UiOptions` 获得类型安全配置
- dev 阶段 `optimizeDeps` 预打包，首屏加载更快

## 安装

`@ubean/integrations/ui` 是内置集成（`@ubean/integrations` 的子路径）。在项目中作为依赖安装：

```bash
pnpm add @ubean/integrations/ui @vean/ui
```

> `@vean/ui` 是 peer dependency —— 版本由你控制。`@ubean/integrations/ui` 要求 `@vean/ui@>=0.50.0`。

### UnoCSS 模式（可选）

如果选择 `css: false`（UnoCSS 模式），还需安装 preset：

```bash
pnpm add -D @vean/unocss
```

## 配置

### 最小配置（预构建 CSS）

最简配置使用默认设置 —— `UiResolver` + `styles.css`：

```typescript
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  ui: true
});
```

这样做可以获得：
- 各处的 `S*` 组件都自动导入（无需手写 import）
- 预构建的 `@vean/ui/styles.css` 被注入客户端 bundle

### UnoCSS 模式

若想要原子化样式并对主题完全掌控，关闭 CSS 自动注入，改用 UnoCSS preset：

```typescript
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  ui: { css: false }
});
```

然后用 shadcn preset 配置 UnoCSS：

```typescript
// uno.config.ts
import { defineConfig, presetUno } from 'unocss';
import { presetUi } from '@vean/unocss';

export default defineConfig({
  presets: [
    presetUno(),
    presetUi({
      // 在这里定制主题色 token（由 CSS 变量驱动）
      // color: { primary: 'hsl(var(--primary))' }
    })
  ],
  // 推荐：开启 reset + global + ui 生成样式
  // （完整选项见 @vean/unocss 文档）
});
```

### 关闭模块

显式关闭该模块（等同于不写这个字段）：

```typescript
export default defineConfig({
  ui: false
});

// 或
export default defineConfig({
  ui: { disabled: true }
});
```

## 用法

### 自动导入的组件

使用 `ui: true` 时，`@vean/ui` 的所有 `S*` 组件都会自动导入 —— 在模板里直接用即可：

```vue
<template>
  <SConfigProvider>
    <SButton variant="default">Click me</SButton>
    <SInput v-model="value" placeholder="Type..." />
  </SConfigProvider>
</template>

<script setup lang="ts">
const value = ref('');
</script>
```

不需要写 `import { SButton } from '@vean/ui'` —— `UiResolver` 在编译期把 `S*` 名称解析到 `@vean/ui` 的导出，并注册进 `components.d.ts`。

### 显式导入（必要时）

在编程式使用，或希望显式导入的场景：

```typescript
import { SButton, useToast } from '@vean/ui';
```

### 可用组件

`@vean/ui` 提供数量持续增长的 shadcn 风格组件。常见的包括：

- **表单**：`SInput`、`STextarea`、`SSelect`、`SCheckbox`、`SRadioGroup`、`SSwitch`、`SSlider`、`SDatePicker`
- **布局**：`SCard`、`SSeparator`、`STabs`、`SAccordion`、`SResizable`
- **反馈**：`SAlert`、`SToast`、`SDialog`、`SSheet`、`SPopover`、`STooltip`、`SSkeleton`
- **导航**：`SNavigationMenu`、`SCommand`、`SBreadcrumb`、`SPagination`
- **数据**：`STable`、`SDataTable`、`STree`
- **其它**：`SButton`、`SBadge`、`SAvatar`、`SDropdownMenu`、`SContextMenu`

完整列表与各组件 props 见 [`@vean/ui` 文档](https://www.npmjs.com/package/@vean/ui)。

## 工作原理

`@ubean/integrations/ui` 是一层薄封装。当设置了 `ui: true` 时：

1. **模块系统加载** `@ubean/integrations/ui`，并调用 `ubeanUiPlugin(options)`（其中 `options` 来自 `extractBuiltinOptions(config.ui)` —— 对象原样透传，只剥离模块系统专用的 `disabled` 标记；`true` 则得到 `{}`）。

2. **`ubeanUiPlugin` 注册**：把 `UiResolver()`（来自 `@vean/ui/resolver`）注册进 ubean 的模块扩展注册表（位于 `@ubean/build-core`）。

3. **`ubeanVite` 读取**该注册表来构造 `unplugin-vue-components`，并把所有已注册的 resolver 合并进 `resolvers` 数组。这样任意 `.vue` / `.md` 文件中的 `S*` 组件都能被解析。

4. **CSS 注入**（当 `css !== false` 时）：`ubeanUiPlugin` 调用 `registerCssImport('@vean/ui/styles.css')`。`virtual:ubean-client-entry` 虚拟模块会在客户端入口前面加上 `import '@vean/ui/styles.css';`，因此预构建样式表会自动随客户端 bundle 一起发布。

5. **dev `optimizeDeps`**：`ubeanUiPlugin` 把 `@vean/ui` 加入 Vite 的 `optimizeDeps.include`，确保组件库被预打包，从而 dev 首屏加载更快。

> 注册表模式让 `@ubean/vite` 与具体组件库解耦 —— 未来其他内置 UI 集成可以复用同一套机制。

## 编程式 API

```typescript
import { ubeanUiPlugin, defineUiConfig } from '@ubean/integrations/ui';
import type { UiOptions } from '@ubean/integrations/ui';
```

### `ubeanUiPlugin(options?: UiOptions): Plugin[]`

返回一组 Vite 插件。通常由模块系统自动调用；只有在 `ubean.config.ts` 之外集成时才需要手动调用。

### `defineUiConfig(options: UiOptions): UiOptions`

用于编写 `UiOptions` 的类型安全辅助函数，带自动补全。原样返回入参。

### `UiOptions`

```typescript
export interface UiOptions {
  /** 模块是否启用（默认 true） */
  enabled?: boolean;
  /**
   * 是否自动注入 `@vean/ui/styles.css`（默认 true）。
   *
   * - `true`（默认）：自动注入预构建 CSS，零 CSS 配置
   * - `false`：UnoCSS 模式 —— 由你自己配置 `@vean/unocss`
   */
  css?: boolean;
}
```

> 通过 `ubean.config.ts` 配置时，框架读取的是 `ui: true | UiModuleConfig`（`UiModuleConfig` 额外带一个可选的 `disabled` 字段）。模块系统会在把选项传给 `ubeanUiPlugin` 之前剥离 `disabled`，因此 `enabled` 与 `disabled` 是等价的相反表达 —— 哪个在你的配置里读起来更自然就用哪个。

## 主题

### 预构建 CSS 模式

预构建的 `styles.css` 自带一套由 CSS 变量驱动的 shadcn 风格默认样式。要定制主题，在你的全局样式表中覆盖这些 CSS 变量：

```css
/* src/assets/main.css */
:root {
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  /* ... 其它 token */
}

.dark {
  --primary: 210 40% 98%;
  --primary-foreground: 222.2 47.4% 11.2%;
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
}
```

完整的变量列表请参考 `@vean/ui` 的主题 token。

### UnoCSS 模式

使用 `css: false` 时，主题由 `@vean/unocss` preset 处理。该 preset 会为所有 shadcn 组件生成工具类，并遵循同一套 CSS 变量。在 `uno.config.ts` 中配置主题 token：

```typescript
// uno.config.ts
import { defineConfig, presetUno } from 'unocss';
import { presetUi } from '@vean/unocss';

export default defineConfig({
  presets: [presetUno(), presetUi()],
  theme: {
    colors: {
      primary: 'hsl(var(--primary))',
      // ... 映射到你的 CSS 变量
    }
  }
});
```

## SSR 注意事项

`@vean/ui` 是 SSR 安全的 —— 组件在 ubean 的 SSR 过程中能正确渲染。预构建的 `styles.css` 只注入客户端入口（不进 SSR bundle），因此服务端渲染出的 HTML 使用内联样式或基于 class 的样式，客户端再以完整样式表完成水合。

使用 UnoCSS 模式时，请确保 `@vean/unocss` 生成的样式同时进入客户端与 SSR 构建（UnoCSS 的 Vite 插件会自动处理这一点）。

## 最佳实践

1. **先用预构建 CSS**：`ui: true`（默认）搭建最快。只有当需要原子化主题，或想通过摇树优化减小 CSS 体积时，再切到 UnoCSS 模式。

2. **用 `SConfigProvider` 包裹应用**：它为所有 `S*` 组件提供主题、语言等上下文。放在根布局里：

   ```vue
   <!-- src/layouts/default.vue -->
   <template>
     <SConfigProvider>
       <slot />
     </SConfigProvider>
   </template>
   ```

3. **样式模式只选一种**：在预构建 CSS 与 UnoCSS 之间选定一种并在整个项目中保持一致。混用会导致样式声明重复、主题不一致。

4. **通过 CSS 变量定制，而非覆盖样式**：两种模式都遵循 shadcn 的 CSS 变量体系。请在 `:root` / `.dark` 中覆盖变量，而不是写组件级 CSS —— 这样组件库升级时你的样式依然可移植。

5. **使用 `@vean/ui` 的 Icon 组件**：`SIcon`（或 `@vean/ui` 的 `<Icon />`）支持任意 Iconify 图标。如果你同时启用了 `@ubean/icon`，两者可以共存 —— `@ubean/icon` 负责本地 SVG 图标集，`@vean/ui` 的 Icon 则通过 `@iconify/vue` 覆盖完整的 Iconify 目录。

6. **保持 `@vean/ui` 版本对齐**：在 `package.json` 中把 `@vean/ui` 锁定到已知可用的版本。该库仍在活跃开发中 —— 1.0 之前的次版本之间可能出现破坏性变更。

## 故障排查

### 组件没有自动导入

- 确认 `ubean.config.ts` 中设置了 `ui: true`（或 `ui: { css: ... }`）
- 运行 `ubean prepare` 重新生成 `.ubean/components.d.ts`
- 确认 `@ubean/integrations/ui` 与 `@vean/ui` 都已安装（不能只装一个）
- 确认组件名以 `S` 开头（例如 `SButton` 而不是 `Button`）

### 预构建 CSS 模式下样式缺失

- 确认 `css` 没有被设为 `false`（默认为 `true`）
- 检查客户端入口虚拟模块的输出：运行 `ubean dev`，在 Vite 中查看已加载的模块 —— 应能看到 `@vean/ui/styles.css`
- 若使用了自定义 Vite 配置，确认 `ubeanUiPlugin` 的输出没有被过滤掉

### UnoCSS 类名没有生成

- 确认 `@vean/unocss` 已安装并加入 `uno.config.ts` 的 presets
- 若该 preset 提供 `generated: { reset: true, global: true, ui: true }` 选项，请将其开启
- 检查 `uno.config.ts` 的 `content` / `include` 匹配范围是否覆盖你的 `.vue` 文件

### `S*` 组件报类型错误

- 运行 `ubean prepare` 重新生成类型声明
- 确认 `tsconfig.json` 包含了 `.ubean/components.d.ts`
- 若使用显式导入，请确保从 `@vean/ui`（而不是 `@ubean/integrations/ui`）导入

## 示例

### 带校验的表单

```vue
<!-- src/pages/contact.vue -->
<script setup lang="ts">
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(2, 'Name too short'),
  email: z.string().email('Invalid email')
});

const form = reactive({ name: '', email: '' });
const errors = ref<Record<string, string>>({});

function submit() {
  const result = schema.safeParse(form);
  if (!result.success) {
    errors.value = Object.fromEntries(
      result.error.issues.map(i => [i.path[0] as string, i.message])
    );
    return;
  }
  // 提交…
}
</script>

<template>
  <form @submit.prevent="submit" class="flex flex-col gap-4 max-w-sm">
    <div>
      <SInput v-model="form.name" placeholder="Name" />
      <p v-if="errors.name" class="text-red-500 text-sm">{{ errors.name }}</p>
    </div>
    <div>
      <SInput v-model="form.email" type="email" placeholder="Email" />
      <p v-if="errors.email" class="text-red-500 text-sm">{{ errors.email }}</p>
    </div>
    <SButton type="submit">Submit</SButton>
  </form>
</template>
```

### 带触发器的对话框

```vue
<!-- src/components/UserDeleteDialog.vue -->
<script setup lang="ts">
const props = defineProps<{ userId: string }>();
const open = ref(false);

async function confirmDelete() {
  await fetch(`/api/users/${props.userId}`, { method: 'DELETE' });
  open.value = false;
}
</script>

<template>
  <SDialog v-model:open="open">
    <SDialogTrigger as-child>
      <SButton variant="destructive">Delete</SButton>
    </SDialogTrigger>
    <SDialogContent>
      <SDialogHeader>
        <SDialogTitle>Delete user?</SDialogTitle>
        <SDialogDescription>
          This action cannot be undone.
        </SDialogDescription>
      </SDialogHeader>
      <SDialogFooter>
        <SButton variant="outline" @click="open = false">Cancel</SButton>
        <SButton variant="destructive" @click="confirmDelete">Confirm</SButton>
      </SDialogFooter>
    </SDialogContent>
  </SDialog>
</template>
```

## 资源

- [`@vean/ui` on npm](https://www.npmjs.com/package/@vean/ui)
- [`@vean/unocss` on npm](https://www.npmjs.com/package/@vean/unocss)
- [shadcn/ui (reference design)](https://ui.shadcn.com/)
- [Iconify](https://iconify.design/) — 用于 `SIcon` 的图标名
