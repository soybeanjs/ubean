---
title: 快速开始
description: 几分钟内开始使用 ubean。
---

# 快速开始

几分钟内开始使用 ubean。

## 前置条件

- Node.js >= 22.0.0
- pnpm `11.24.0`（必需 — ubean 使用 pnpm catalog 和 workspace 功能）

## 创建项目

### 交互模式

```bash
pnpm create ubean@latest
```

按照提示配置你的项目。

### 非交互模式

```bash
pnpm create ubean@latest my-app --template starter --preset node -y
```

## 项目结构

```
my-app/
├── src/
│   ├── routes/           # API 路由（void 式具名导出）
│   │   └── api/          # /api/* 端点
│   ├── pages/            # 页面组件（.vue、.md、.reuse.ts）
│   ├── layouts/          # 布局组件（xx.vue 或 xx/index.vue）
│   ├── middleware/       # 中间件（数字前缀排序）
│   ├── components/       # 自动导入的 Vue 组件
│   ├── composables/      # 自动导入的 composables
│   ├── locales/          # i18n 消息（en.json、zh.json 等）
│   ├── crons/            # 定时任务（defineScheduled）
│   ├── queues/           # 队列 worker（defineQueue）
│   ├── plugins/          # 运行时插件
│   ├── request/          # 类型化内部请求客户端（unify 模板生成）
│   ├── server.ts         # 服务端钩子（defineServer；unify 模板生成）
│   └── app.ts            # Vue 应用配置（defineApp；可拆分 app.server.ts / app.client.ts）
├── public/               # 静态资源
├── .ubean/               # 自动生成的类型
├── ubean.config.ts       # 框架配置（defineConfig）
└── package.json
```

> 以上为可选约定目录：middleware/、locales/、crons/、queues/、plugins/ 仅在对应能力启用时需要；unify 模板会生成 locales/ 与 middleware/。

## 最小示例

脚手架生成的项目开箱即含以下核心文件，也可手动搭建：

```bash
# vite.config.ts
import { defineConfig } from 'vite-plus';
import { ubeanPlugin } from 'ubean/vite';

export default defineConfig({
  plugins: [ubeanPlugin()]
});
```

```bash
# src/server.ts
import { defineServer } from 'ubean/server';

export default defineServer({});
```

```typescript
// src/routes/api/hello.ts
import { defineHandler } from 'ubean/server';

export const GET = defineHandler(() => ({ hello: 'ubean' }));
```

```vue
<!-- src/pages/index.vue -->
<script setup lang="ts">
import { ref } from 'vue';

const count = ref(0);
</script>

<template>
  <button @click="count++">点击了 {{ count }} 次</button>
  <Link to="/api/hello">调用 API</Link>
</template>
```

## 开发服务器

```bash
cd my-app
pnpm install
pnpm dev
```

开发服务器默认运行在 `http://localhost:9527`。

## 构建与预览

```bash
pnpm build      # 生产构建
pnpm preview    # 预览生产构建
```

构建输出位于 `dist` 目录（客户端为 `dist/public/`，服务端为 `dist/server/` — 各模式的输出请参见[应用模式](/zh/guide/app-modes)）。

## 可用脚本

```json
{
  "scripts": {
    "dev": "ubean dev",
    "build": "ubean build",
    "preview": "ubean preview",
    "typecheck": "vue-tsc --noEmit"
  }
}
```

## 下一步

- [应用模式](/zh/guide/app-modes) — 了解 fullstack / spa / ssg / backend 模式
- [路由模式](/zh/guide/routing-modes) — 深入了解文件式路由
- [页面与路由](/zh/guide/pages-routing/overview) — 页面路由与导航
- [数据加载](/zh/guide/pages-routing/loaders) — useData 数据获取
- [Actions](/zh/guide/pages-routing/actions) — 渐进增强的表单动作
- [国际化](/zh/guide/i18n) — 多语言支持
- [群岛架构](/zh/guide/islands) — 部分水合
