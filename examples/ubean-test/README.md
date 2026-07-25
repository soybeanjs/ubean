# ubean-test — 虚拟路由模式示例(routing-virtual-mode)

> 这是 ubean 的**主示例项目**,演示默认的 `virtual` 路由生成模式 + 完整全栈能力。
>
> Phase 6 后,本项目作为三种路由模式示例之一:
>
> - **虚拟模式**(本项目)— 默认,仅注册虚拟模块,不生成实体文件
> - [实体文件模式](../routing-file-mode/)— `mode: 'file'`,生成 `src/router/_generated/`
> - [前端-only](../frontend-only/)— 无后端业务逻辑(SSR 仍保留)

## 模式说明

本项目使用默认的 `virtual` 路由生成模式(无需在 `ubean.config.ts` 中配置 `routing` 字段)。

ubean 在 dev/build 时扫描 `src/pages/` 与 `src/layouts/`,生成路由数据注册到虚拟模块:

- `virtual:ubean-pages` — 页面路由数据
- `virtual:ubean-routes` — API 路由数据
- `virtual:ubean-meta` — 路由元数据
- `virtual:ubean-app-config` — 应用配置
- `virtual:ubean-locales` — 区域设置数据

**优点**:零配置启动,不污染 git 历史,所有路由数据都在内存中动态生成。

**缺点**:无法在 IDE 中直接跳转到路由定义,无法手动修改生成的路由 `meta`。

如需 IDE 跳转或手动修改路由 `meta`,请切换到 [实体文件模式](../../skills/ubean/docs/guide/routing-modes.md#2-file--实体文件模式):

```ts
// ubean.config.ts
export default defineConfig({
  routing: { mode: 'file', outputDir: 'src/router/_generated' }
});
```

## 演示的能力

### 路由与页面

- 文件式页面路由:`src/pages/`(支持动态路由 `[id].vue`、路由组 `(marketing)/`)
- API 路由:`src/routes/api/`(void 风格命名导出 `GET`/`POST`/...)
- 布局系统:`src/layouts/`(`default.vue`、`admin.vue`)
- 中间件:`src/middleware/`(`global.*` → `/*`)
- Markdown 页面:`src/pages/md-test.md`
- 复用路由:`xxx.reuse.vue`

### 服务端运行时

- 缓存(`src/routes/api/cache-test.ts`、`cache-advanced-test.ts`)
- 数据库(`db-test.ts`)
- 存储(`storage-test.ts`、`storage-advanced-test.ts`)
- 队列(`queue-test.ts`、`queue-advanced-test.ts`)
- 定时任务(`src/crons/01.test-cron.ts`)
- WebSocket(`ws-test.ts`)
- SSE(`sse-test.ts`)

### 其他能力

- i18n 国际化(`src/locales/`、`src/middleware/02.i18n.ts`)
- SEO(`robots.txt.ts`、`sitemap.xml.ts`、`seo-meta.vue`)
- View Transitions(`view-transitions.vue`)
- Islands 架构(`islands-test.vue`、5 个 Island 组件)
- OpenAPI(`/_openapi.json`、`/_scalar`)
- DevTools(`/_devtools`)
- 路由规则(`route-rules-test.ts`)
- 限流(`rate-limit-test.ts`)
- CORS(`cors-test.ts`、`cors-status.ts`)
- 环境变量(`env.ts`、`env-schema.ts`)
- 内部调用(`internal-fetch-test.ts`)
- 可观测性(`trace-test.ts`)

## 运行

```bash
# 安装依赖(在项目根目录)
pnpm install

# 开发模式
pnpm -F ubean-test dev

# 构建
pnpm -F ubean-test build

# 预览生产构建
pnpm -F ubean-test preview

# 运行测试
pnpm -F ubean-test test

# 类型检查
pnpm -F ubean-test type-check
```

## 项目结构

```
src/
├── components/       # Islands 组件(IslandClock/Counter/Media/Only/Visibility)
├── crons/            # 定时任务(defineScheduled)
├── layouts/          # 布局(default、admin)
├── locales/          # i18n 翻译(en、zh)
├── middleware/       # 全局/前缀中间件
├── pages/            # 页面路由(.vue、.md)
├── request/          # 请求工具(client、internal)
├── routes/           # API 路由(void 风格命名导出)
├── typings/          # 类型声明
├── app.ts            # 客户端应用入口(defineApp + hydrateIslands)
└── server.ts         # 服务端入口(defineServer + hooks)
```

## 相关文档

- [路由生成模式详解](../../skills/ubean/docs/guide/routing-modes.md)
- [页面路由指南](../../skills/ubean/docs/guide/pages-routing/overview.md)
- [Islands 架构](../../skills/ubean/docs/guide/islands.md)
- [i18n 国际化](../../skills/ubean/docs/guide/i18n.md)
- [子包拆分方案](../../docs/subpackage-splitting.md)
- [应用模式设计](../../docs/modes.md)
