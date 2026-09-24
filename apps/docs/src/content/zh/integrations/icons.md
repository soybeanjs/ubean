---
title: 图标
description: 两套图标体系：@ubean/icon 图标集与 @vean/ui 的 SIcon。
translatedFrom: 98981f04ca39
sections: ["e51fdb3f","e3b0c442","04660a00","b67b2a7b","05904025","5d96a16c","e91028f3","15a4f852","4e5145a2","26eec2a9","e66e4b89","ca1e43ef","f345b0c2","b4dae2dd","0985af8e","d8c77bc2","80636a73","7432a915","211dfbee","19ade832","86cf40f4","ef93623a","57dc605b","089f78f6","8474f6fa","4adc8b6e"]
---

# 图标

ubean 提供两套用途不同的图标体系：

## 1. @ubean/icon（内置图标系统）

`@ubean/icon` 是 ubean 的**内置图标插件**，在构建时与运行时提供 Iconify 集成能力。它负责图标集扫描、SVG 生成与运行时图标渲染。

### 特性

- 支持 Iconify 图标集（多个集合，10 万+ 图标）
- SVG 与 CSS 两种渲染模式
- Vite 插件支持 SFC 图标扫描与预加载
- 支持注册自定义图标集（对象形式的配置）
- 运行时图标加载，并以 API 作为回退（`/_iconify` dev 路由）
- 图标可摇树优化
- 支持翻转/旋转变换

### 安装与配置

`@ubean/icon` 是内置模块，**默认关闭**。在 `ubean.config.ts` 中启用：

```typescript
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  icon: true // 用默认值启用内置图标系统
});
```

### 带自定义选项启用

`icon` 配置字段接受 `true`（使用默认值）或选项对象 —— 对象中的字段（如 `customCollections`）会透传给 `ubeanIconPlugin` 这个 Vite 插件（`@ubean/icon/vite`）；只有模块系统专用的 `disabled` 标记会被剥离：

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { ubeanIconPlugin } from '@ubean/icon/vite';

export default defineConfig({
  plugins: [
    ubeanIconPlugin({
      collections: {
        mdi: () => import('@iconify-json/mdi').then(m => m.icons) // 懒加载图标集
      },
      customCollections: {
        brand: './src/icons/brand'
      },
      fallbackToApi: true,      // 从 Iconify API 拉取缺失的图标
      iconifyApiEnabled: true   // API 回退的总开关
    })
  ]
});
```

| 选项              | 类型                                                                      | 说明                                           |
| ----------------- | ------------------------------------------------------------------------- | ---------------------------------------------- |
| collections       | `Record<string, IconifyCollection \| (() => Promise<IconifyCollection>)>` | 要注册的 Iconify 图标集                        |
| customCollections | `Record<string, string \| { dir, prefix?, normalizeIconName? }>`          | 本地 SVG 目录图标集（对象形式）                |
| fallbackToApi     | boolean                                                                   | 从 Iconify API 拉取缺失图标（默认 `true`）     |
| iconifyApiEnabled | boolean                                                                   | API 回退的总开关（默认 `true`）                |
| iconApiEndpoint   | string                                                                    | Iconify API 基础 URL（默认 `https://api.iconify.design`） |
| ssr               | boolean                                                                   | 启用服务端 SVG 渲染（默认 `true`）             |
| cssSelectorPrefix | string                                                                    | CSS 模式的类名前缀（默认 `'i-'`）              |
| cssWherePseudo    | boolean                                                                   | 用 `:where()` 收窄 CSS 规则作用域（默认 `true`） |

### 自定义图标集

`customCollections` 接受**对象形式**的配置（不是数组）。每个 key 映射到目录简写，或完整的 `{ dir, prefix, normalizeIconName }` 对象。嵌套子目录会被拍平成带连字符的前缀。

```typescript
import { defineConfig } from 'ubean';

export default defineConfig({
  icon: {
    customCollections: {
      brand: './src/icons/brand',           // 简写
      ui: {
        dir: './src/icons/ui',
        prefix: 'ui',
        normalizeIconName: (name: string) => name.toLowerCase()
      }
    }
  }
});
```

### 基本用法（Icon 组件）

该组件以 `Icon` 导出（内部组件名为 `UbeanIcon`）：

```vue
<script setup lang="ts">
import { Icon } from '@ubean/icon';
</script>

<template>
  <!-- 基本用法 -->
  <Icon name="mdi:home" />

  <!-- 指定尺寸与颜色 -->
  <Icon name="mdi:user" :size="24" color="#42b883" />

  <!-- CSS 模式 -->
  <Icon name="mdi:settings" mode="css" />

  <!-- 翻转与旋转 -->
  <Icon name="mdi:arrow-right" flip="horizontal" />
  <Icon name="mdi:refresh" rotate="90" />
</template>
```

### Icon 的 Props（UbeanIcon）

| Prop      | 类型                                  | 默认值    | 说明                                 |
| --------- | ------------------------------------- | --------- | ------------------------------------ |
| name      | string                                | 必填      | `collection:icon` 形式的图标名       |
| size      | number \| string                      | '1em'     | 图标尺寸（px 数字或 CSS 值）         |
| color     | string                                | undefined | 图标颜色（CSS 颜色）                 |
| className | string                                | ''        | 附加的 CSS 类名                      |
| ariaLabel | string                                | undefined | 用于无障碍的 ARIA 标签               |
| title     | string                                | undefined | 悬停提示文本                         |
| mode      | 'svg' \| 'css'                        | 'svg'     | 渲染模式                             |
| flip      | 'horizontal' \| 'vertical' \| 'both'  | undefined | 翻转方向                             |
| rotate    | number \| string                      | undefined | 旋转角度                             |
| inline    | boolean                               | false     | 内联展示时的对齐方式                 |

### 运行时注册自定义图标集

```typescript
import { defineIconCollection, defineIconCollectionLoader } from '@ubean/icon';

// 静态图标集
defineIconCollection({
  prefix: 'custom',
  icons: {
    logo: {
      body: '<path d="M12 2L2 7l10 5 10-5-10-5z" />',
      width: 24,
      height: 24
    }
  }
});

// 懒加载图标集
defineIconCollectionLoader('my-icons', async () => {
  return (await import('/icons/my-icons.json')).default;
});
```

### 编程式 API

```typescript
import { useIcon, getIconSync, getIcon, addIconCollection } from '@ubean/icon';

// useIcon composable
const icon = useIcon('mdi:home');
const svg = await icon.getSvg();
const svgSync = icon.getSvgSync();

// 直接调用函数
const iconData = getIconSync('mdi:home');
const iconDataAsync = await getIcon('mdi:home');
```

### 本地 SVG 服务（dev）

当 `iconifyApiEnabled` 与 `fallbackToApi` 都开启时，`/_iconify` dev 路由会优先在本地（从自定义图标集中）提供 SVG，其余图标再回退到 Iconify API。`parseSvgToIconData()` 会从原始 SVG 文件中提取 `body` 与 `width`/`height`/`viewBox`。

---

## 2. @vean/ui 的 SIcon 组件

`SIcon` 是**来自 @vean/ui 的 UI 组件**，提供与 VeanUI 设计系统、主题和样式约定一致的样式化图标组件。

### 特性

- 与 @vean/ui 主题系统集成（明暗模式、主题色）
- 尺寸与 UI 组件保持一致（xs/sm/md/lg/xl 预设）
- 遵循 shadcn-ui 设计系统的样式约定
- 配合 SConfigProvider 可实现全局尺寸/主题配置
- 支持所有 Iconify 图标

### 何时使用 SIcon

以下情况请使用 `SIcon`：

- 你正在用 @vean/ui 组件搭建 UI
- 需要与应用设计系统保持主题一致
- 想要与 VeanUI 组件匹配的预设尺寸
- 你在用 SButton、SCard 等组件，且图标样式需要与之协调

### 安装

```bash
pnpm add @vean/ui
```

### 配置（配合 unplugin-vue-components）

```typescript
// vite.config.ts
import Components from 'unplugin-vue-components/vite';
import { UiResolver } from '@vean/ui/resolver';

export default defineConfig({
  plugins: [
    Components({
      resolvers: [UiResolver()]
    })
  ]
});
```

### 主题配置

```vue
<script setup lang="ts">
import { SConfigProvider } from '@vean/ui';
</script>

<template>
  <SConfigProvider
    theme="light"
    :theme-config="{
      colors: { primary: '#42b883' },
      size: 'default'
    }"
  >
    <App />
  </SConfigProvider>
</template>
```

### 基本用法（SIcon）

```vue
<script setup lang="ts">
import { SIcon } from '@vean/ui';
</script>

<template>
  <!-- 基本用法 -->
  <SIcon icon="mdi:home" />

  <!-- 使用预设尺寸 -->
  <SIcon icon="mdi:user" size="sm" />
  <SIcon icon="mdi:settings" size="lg" />

  <!-- 自定义尺寸 -->
  <SIcon icon="mdi:bell" :size="24" />

  <!-- 使用主题色 -->
  <SIcon icon="mdi:check" color="success" />
  <SIcon icon="mdi:alert" color="error" />
  <SIcon icon="mdi:info" color="primary" />

  <!-- 放在按钮里 -->
  <SButton>
    <SIcon icon="mdi:plus" class="mr-2" />
    Add Item
  </SButton>
</template>
```

### SIcon 的 Props

| Prop  | 类型                                            | 默认值    | 说明                                          |
| ----- | ----------------------------------------------- | --------- | --------------------------------------------- |
| icon  | string                                          | 必填      | 图标名（Iconify 形式：`collection:icon`）     |
| size  | 'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl' \| number  | 'md'      | 图标尺寸（预设或 px）                         |
| color | string                                          | undefined | 主题色 token 或 CSS 颜色                      |
| spin  | boolean                                         | false     | 旋转动画                                      |
| class | string                                          | ''        | 附加的 CSS 类名                               |

---

## 关键差异

| 方面              | @ubean/icon (UbeanIcon)                          | @vean/ui (SIcon)                       |
| ----------------- | ------------------------------------------------ | -------------------------------------- |
| 组件              | `<Icon>`（内部名 `UbeanIcon`）                   | `<SIcon>`                              |
| 图标 prop         | `name`（如 `name="mdi:home"`）                   | `icon`（如 `icon="mdi:home"`）         |
| 定位              | 构建时 + 运行时的图标引擎                        | UI 样式化的图标组件                    |
| 依赖              | 无（内置模块，通过 `icon: true` 按需启用）       | 需要 @vean/ui                          |
| 主题              | 支持原生 CSS 颜色                                | 与 VeanUI 主题 token 集成              |
| 尺寸写法          | CSS 值 / px 数字                                 | xs/sm/md/lg/xl 预设 + 数字             |
| 渲染模式          | SVG 与 CSS 模式                                  | 仅 SVG（带样式）                       |
| 变换              | 内置 flip/rotate props                           | 通过 class/style 使用 CSS transform    |
| API 访问          | 完整的编程式 API（useIcon、getIcon 等）          | 仅组件                                 |
| 摇树优化          | Vite SFC 扫描 + 预加载                           | 取决于 unplugin-vue-components         |
| 自定义图标集      | defineIconCollection / defineIconCollectionLoader | 取决于 @ubean/icon 运行时             |

## 选型建议

- **用 `Icon`**：一般的图标需求、自定义图标集、服务端图标生成，或没有使用 @vean/ui 的场景
- **用 SIcon**：用 @vean/ui 组件搭建 UI，需要全应用主题与样式一致的场景
- 两套体系使用同一套 Iconify 图标命名（`collection:icon` 格式）
- 必要时可以在同一个项目里两者并用：`Icon` 负责基础设施/非 UI 图标，`SIcon` 负责 UI 组件

## 图标集

### 常用的 Iconify 图标集

| 图标集                | 前缀           | 示例                                            |
| --------------------- | -------------- | ----------------------------------------------- |
| Material Design Icons | `mdi`          | `mdi:home`, `mdi:menu`, `mdi:settings`          |
| Font Awesome          | `fa`           | `fa:user`, `fa:home`, `fa:github`               |
| Simple Icons          | `simple-icons` | `simple-icons:vuejs`, `simple-icons:react`      |
| Tabler Icons          | `tabler`       | `tabler:home`, `tabler:user`, `tabler:settings` |
| Lucide Icons          | `lucide`       | `lucide:home`, `lucide:search`, `lucide:menu`   |
| Carbon Icons          | `carbon`       | `carbon:home`, `carbon:user-avatar`             |
| Bootstrap Icons       | `bi`           | `bi:house`, `bi:person`                         |
| Heroicons             | `heroicons`    | `heroicons:home`, `heroicons:user`              |

## 最佳实践

1. **选定一套主用体系**：UI 场景优先 SIcon，框架能力相关用 Icon
2. **尺寸保持一致**：图标尺寸要对齐你的设计系统
3. **无障碍**：有语义的图标务必提供 ariaLabel
4. **预加载关键图标**：对高频使用的图标集，在 `ubeanIconPlugin` 的 `collections` 选项中配置
5. **自定义 SVG**：品牌专属图标用自定义图标集承载
6. **性能**：善用摇树优化，避免加载用不到的图标集
