# frontend-only

ubean 的 **frontend-only** 示例 — 一个不含后端业务逻辑的项目结构。SSR 仍保留用于 SEO,但没有 API 路由、定时任务、后端中间件或服务端钩子。

## 与 `examples/ubean-test/` 的差异

| 目录 / 文件            | ubean-test | frontend-only | 说明                           |
| ---------------------- | ---------- | ------------- | ------------------------------ |
| `src/routes/`          | ✅         | ❌            | API 路由(本示例不包含)         |
| `src/crons/`           | ✅         | ❌            | 定时任务                       |
| `src/middleware/`      | ✅         | ❌            | 后端中间件                     |
| `src/server.ts`        | ✅         | ❌            | 服务端钩子(defineServer)       |
| `src/request/`         | ✅         | ❌            | 类型化内部 fetch(依赖 routes/) |
| `src/pages/`           | ✅         | ✅            | 文件式路由                     |
| `src/layouts/`         | ✅         | ✅            | 布局系统                       |
| `src/components/`      | ✅         | ✅            | Island 组件                    |
| `ubean.config.ts` i18n | ✅         | ❌            | 本示例未启用 i18n              |

## 演示的能力

- **文件式路由** — `src/pages/index.vue`、`about.vue`、`users/[id].vue`(动态路由)
- **Islands 架构** — `<IslandCounter client:load />`(见 `src/pages/index.vue`)
- **@soybeanjs/fetch** — 通过 `createRequest({ baseURL })` 调用外部 API(jsonplaceholder)
- **SEO** — `useHead()` 设置页面标题与 meta(从 `ubean` 自动导入)
- **客户端导航** — `<Link to="..." />` 全局组件
- **View Transitions** — ubean 内置支持,通过 `useViewTransition()` / `withViewTransition()` 使用

## 项目结构

```
examples/frontend-only/
├── public/
│   └── favicon.svg
├── src/
│   ├── components/
│   │   └── IslandCounter.vue       # Island 组件(client:load)
│   ├── layouts/
│   │   └── default.vue             # 默认布局(nav + PageView)
│   ├── pages/
│   │   ├── users/
│   │   │   └── [id].vue            # 动态路由,useRoute() 取参数
│   │   ├── about.vue               # 关于页:列出已用/未用能力
│   │   └── index.vue               # 首页:Islands + @soybeanjs/fetch 演示
│   └── app.ts                      # 客户端入口(defineApp + hydrateIslands)
├── package.json
├── tsconfig.json
├── ubean.config.ts                 # 最小配置(无 i18n / 无 modules)
└── vite.config.ts
```

## 运行

```bash
# 在 monorepo 根目录
pnpm install

# 启动开发服务器
pnpm -F frontend-only dev

# 类型检查
pnpm -F frontend-only type-check

# 构建
pnpm -F frontend-only build
```

> **注意**:在 Phase 7 完成前,`pnpm dev` / `pnpm build` 可能因 `ubean` 主包尚未构建(`packages/ubean/dist/`)而失败。`pnpm type-check` 在 `ubean` 包构建后即可通过。

## 未来计划(Phase 7+)

在 Phase 7 之后,ubean 将支持真正的 **SPA 模式**(完全无 SSR),适用于纯前端应用(内部工具、管理后台、不需要 SEO 的应用)。届时本示例可切换为 SPA 模式,无需 SSR 也能运行。

当前 frontend-only 仍走 SSR 流程,因为:

1. SEO 仍由 SSR 提供(页面初始 HTML 由服务端渲染)
2. SPA 模式的构建路径(纯客户端 bundle、无 server entry)尚未实现
3. Islands 架构的 SSR 阶段会输出 `<ubean-island>` 占位元素,客户端再水合
