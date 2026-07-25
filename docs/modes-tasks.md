# ubean 应用模式(App Mode)任务清单

> 本文档跟踪 `mode` 配置字段(全栈/前端/后端/SSG/SSR 模式)的实施进度。完整方案见 [modes.md](modes.md)。
>
> 状态图例:`[ ]` 待办 · `[~]` 进行中 · `[x]` 已完成 · `[!]` 阻塞

## 任务总览

| 阶段 | 任务数 | 完成 | 进度 |
|---|---|---|---|
| 阶段 1:Config 基础设施 | 4 | 0 | 0% |
| 阶段 2:SPA 模式 | 5 | 0 | 0% |
| 阶段 3:SSG 模式 | 5 | 0 | 0% |
| 阶段 4:Backend 模式 | 4 | 0 | 0% |
| 阶段 5:示例与文档 | 6 | 0 | 0% |
| **合计** | **24** | **0** | **0%** |

---

## 阶段 1:Config 基础设施

> 添加 `mode` 类型定义、默认值和 CLI 参数解析。此阶段不改变任何构建行为,仅搭建类型基础。

- [ ] M1-1 定义 `AppMode` 类型并添加到 `UbeanConfig`
  - 在 [packages/config/src/types.ts](../packages/config/src/types.ts) 新增 `AppMode` 类型:`'fullstack' | 'spa' | 'ssg' | 'ssr' | 'backend'`
  - 在 `UbeanConfig` 接口添加 `mode?: AppMode` 字段(含 JSDoc 注释)
  - 在 `ResolvedConfig` 的 `Required<Omit<...>>` 列表中加入 `mode`(确保 resolved 后为必填)
  - 状态:`[ ]`
  - 验证:`pnpm -F @ubean/config typecheck` 通过
  - 备注:`ssr` 作为 `fullstack` 的语义别名存在

- [ ] M1-2 设置 `mode` 默认值为 `fullstack`
  - 在 [packages/config/src/loader.ts](../packages/config/src/loader.ts) 的 `configDefaults` 添加 `mode: 'fullstack'`
  - 状态:`[ ]`
  - 验证:`loadUbeanConfig()` 返回的对象 `mode === 'fullstack'`
  - 备注:确保现有项目行为零变化

- [ ] M1-3 CLI `build` 命令添加 `--mode` 参数
  - 在 [packages/cli/src/build.ts](../packages/cli/src/build.ts) 的 `args` 添加 `mode` 和 `ssg` 快捷参数
  - `--mode` 覆盖 `ubean.config.ts` 中的 `mode`
  - `--ssg` 等同 `--mode ssg`
  - 在 `run` 函数中读取 `args.mode` 并覆盖 `config.mode`
  - 状态:`[ ]`
  - 验证:`ubean build --mode spa` 能正确读取到 `config.mode === 'spa'`
  - 备注:CLI 参数优先级 > 配置文件

- [ ] M1-4 验证 `fullstack` 模式回归无变化
  - 不添加任何构建流程条件分支(此阶段仅做类型和参数基础)
  - 运行 `pnpm -r build` 确认所有现有示例构建成功
  - 运行 `pnpm typecheck` 确认类型无错误
  - 状态:`[ ]`
  - 验证:`examples/ubean-test` 产物结构与改动前完全一致
  - 备注:这是回归安全网,确保后续阶段的改动不会破坏默认行为

---

## 阶段 2:SPA 模式

> 实现纯客户端渲染模式,跳过 SSR 和 server bundle 构建。这是价值最高、风险最低的模式。

### 构建流程

- [ ] M2-1 `buildProduction` 添加 `mode` 条件分支
  - 在 [packages/build/src/production.ts](../packages/build/src/production.ts) 的 `buildProduction` 函数中:
    - 提取 `buildClientBundle()` 子函数(从现有 client 构建逻辑)
    - 提取 `buildSSRBundle()` 子函数(从现有 SSR 构建逻辑)
    - 添加 `if (config.mode !== 'backend')` 包裹 `buildClientBundle()`
    - 添加 `if (config.mode === 'fullstack' || config.mode === 'ssr' || config.mode === 'ssg')` 包裹 `buildSSRBundle()`
    - 添加 `if (config.mode === 'fullstack' || config.mode === 'ssr' || config.mode === 'backend')` 包裹 server entry 生成
  - 状态:`[ ]`
  - 验证:`fullstack` 模式产物与改动前一致;`spa` 模式不产出 `dist/server/`
  - 备注:这是核心改动,需保持函数提取后的行为完全一致

- [ ] M2-2 `spa` 模式跳过 server entry 虚拟模块
  - 在 [packages/build/src/virtual-modules.ts](../packages/build/src/virtual-modules.ts) 的 `generateVirtualModulesToDisk` 中:
    - 添加 `mode` 参数
    - `spa` 模式跳过 `server-entry.ts` / `server-entry.mjs` 的生成
    - `spa` 模式跳过 `routes.mjs`(无 API 路由需要)的可选优化
  - 状态:`[ ]`
  - 验证:`spa` 模式构建后 `.ubean/virtual/` 不含 `server-entry.*`
  - 备注:client-entry 虚拟模块仍需生成(SPA 需要客户端入口)

- [ ] M2-3 `spa` 模式的 `index.html` 生成
  - 确认 [production.ts#L544-L556](../packages/build/src/production.ts#L544-L556) 的 HTML 生成逻辑在 `spa` 模式下正确工作
  - HTML 应包含 `<script type="module" src="virtual:ubean-client-entry">` 指向客户端入口
  - 确认客户端入口虚拟模块在 `spa` 模式下正确生成(不含 SSR hydration 逻辑)
  - 状态:`[ ]`
  - 验证:`spa` 模式 `dist/public/index.html` 存在且包含正确的 script 标签
  - 备注:可能需要检查 `createClientEntryVirtualModule` 是否有 SSR 相关代码需要条件跳过

### Preview 命令

- [ ] M2-4 `preview` 命令支持静态文件服务
  - 在 [packages/cli/src/preview.ts](../packages/cli/src/preview.ts) 中:
    - 检测 `config.mode === 'spa'` 或 `config.mode === 'ssg'`
    - 启动静态文件服务器(serve `dist/public/`)
    - 可使用 Node 内置 `http` + 简单的文件读取逻辑,或引入轻量依赖(如 `sirv`)
  - 状态:`[ ]`
  - 验证:`spa` 模式构建后 `ubean preview` 能访问页面
  - 备注:静态服务器需支持 SPA fallback(所有非文件路由返回 `index.html`)

- [ ] M2-5 将 `frontend-only` 示例迁移到 `mode: 'spa'`
  - 修改 [examples/frontend-only/ubean.config.ts](../examples/frontend-only/ubean.config.ts) 添加 `mode: 'spa'`
  - 验证构建产物不再包含 `dist/server/`
  - 验证 `ubean preview` 能正常访问
  - 状态:`[ ]`
  - 验证:`examples/frontend-only/dist/` 仅含 `public/` 目录
  - 备注:这是 `spa` 模式的第一个真实用例

---

## 阶段 3:SSG 模式

> 实现静态站点生成模式。构建时用 SSR 渲染 HTML,完成后清理临时 server 产物。

- [ ] M3-1 `ssg` 模式强制开启 prerender
  - 在 [packages/cli/src/build.ts](../packages/cli/src/build.ts) 的 `run` 函数中:
    - `config.mode === 'ssg'` 时,强制 `config.prerender.enabled = true`
    - `config.mode === 'spa'` 或 `'backend'` 时,强制 `config.prerender.enabled = false`
  - 状态:`[ ]`
  - 验证:`ssg` 模式构建日志包含 "Prerendering static pages..."
  - 备注:在 CLI 层处理,不污染 `buildProduction` 的纯函数性质

- [ ] M3-2 `ssg` 模式构建后清理临时 server 产物
  - 在 [packages/cli/src/build.ts](../packages/cli/src/build.ts) 的 `run` 函数中:
    - `config.mode === 'ssg'` 且 prerender 完成后,执行 `rm -rf dist/server/`
    - 添加日志:`logger.info('Cleaning temporary SSR bundle (SSG mode)...')`
  - 状态:`[ ]`
  - 验证:`ssg` 模式构建后 `dist/` 仅含 `public/` 目录
  - 备注:SSR bundle 在 prerender 阶段已被加载到内存,删除文件不影响已生成的静态 HTML

- [ ] M3-3 `ssg` 模式的 prerender 路由收集
  - 确认 [packages/prerender](../packages/prerender/src/index.ts) 的路由收集逻辑在 `ssg` 模式下正确工作:
    - 自动收集所有非动态页面(已有逻辑)
    - `routeRules` 中 `prerender: true` 的路由(已有逻辑)
    - `prerender.routes` 手动指定的路由(已有逻辑)
  - 确认 `crawlLinks: true`(默认)能正确爬取内部链接
  - 状态:`[ ]`
  - 验证:`ssg` 模式构建的 `dist/public/` 包含所有页面的 `.html` 文件
  - 备注:prerender 逻辑大概率无需改动,仅验证

- [ ] M3-4 `ssg` 模式 preview 复用静态文件服务器
  - 确认 M2-4 的静态文件服务器在 `ssg` 模式下也工作
  - `ssg` 模式的静态服务器**不需要** SPA fallback(因为每个路由都有对应的 `.html` 文件)
  - 状态:`[ ]`
  - 验证:`ssg` 模式构建后 `ubean preview` 能访问所有预渲染页面
  - 备注:与 `spa` 的 SPA fallback 行为略有不同(可选优化)

- [ ] M3-5 创建 `ssg` 示例项目
  - 创建 `examples/ssg/` 目录,包含:
    - `package.json`(依赖 `ubean` + `vue`)
    - `ubean.config.ts`(`mode: 'ssg'`)
    - `src/pages/index.vue`、`src/pages/about.vue`、`src/pages/blog/[slug].vue`
    - `src/app.ts`(defineApp 入口)
  - 验证 `ubean build` 生成静态 HTML 文件
  - 状态:`[ ]`
  - 验证:`examples/ssg/dist/public/about/index.html` 存在且包含预渲染内容
  - 备注:示例应展示动态路由 `[slug].vue` 的 SSG 行为(配合 `prerender.routes`)

---

## 阶段 4:Backend 模式

> 实现纯 API 后端模式,跳过 Vue 插件和客户端 bundle 构建。

- [ ] M4-1 `backend` 模式跳过 Vue 插件加载
  - 在 [packages/build/src/production.ts](../packages/build/src/production.ts#L499-L511) 的 `builtinPlugins` 中:
    - `config.mode === 'backend'` 时不加载 `vue()`、`ubeanVuePlugin()`、`ubeanIslandsPlugin()`
    - 仅保留 `ubeanPlugin({ config })`(负责 API 路由扫描)
  - 在 [packages/dev/src/vite-server.ts](../packages/dev/src/vite-server.ts#L220-L225) 做同样的条件判断
  - 状态:`[ ]`
  - 验证:`backend` 模式构建日志不包含 Vue 相关插件加载
  - 备注:跳过 Vue 插件可显著减少 backend 项目的构建时间

- [ ] M4-2 `backend` 模式跳过页面相关虚拟模块
  - 在 [packages/build/src/virtual-modules.ts](../packages/build/src/virtual-modules.ts) 中:
    - `backend` 模式跳过 `vue-pages.ts`、`vue-app.ts`、`client-entry.mjs` 的生成
    - 保留 `routes.mjs`、`app-config.mjs`、`meta.mjs`、`locales.mjs`(API 路由需要)
  - 状态:`[ ]`
  - 验证:`backend` 模式 `.ubean/virtual/` 不含 `vue-pages.ts`、`vue-app.ts`
  - 备注:`meta.mjs` 可能仍需要(API 路由的 meta),暂保留

- [ ] M4-3 `backend` 模式跳过 client bundle 构建
  - 在 [packages/build/src/production.ts](../packages/build/src/production.ts) 中:
    - M2-1 的 `if (config.mode !== 'backend')` 已包裹 `buildClientBundle()`,此任务确认生效
    - `backend` 模式跳过 `index.html` 生成和 public assets 复制(可选,保留也无害)
  - 状态:`[ ]`
  - 验证:`backend` 模式 `dist/` 不含 `public/` 目录(或仅含空 `public/`)
  - 备注:如果保留 `public/` 复制也无害,优先级低

- [ ] M4-4 `backend` 模式 preview 复用 Node server
  - 确认 [packages/cli/src/preview.ts](../packages/cli/src/preview.ts) 的现有 Node server 逻辑在 `backend` 模式下正常工作
  - `backend` 模式的 `dist/server/server.mjs` 应能直接启动并响应 API 请求
  - 状态:`[ ]`
  - 验证:`backend` 模式构建后 `ubean preview` 能访问 API 路由
  - 备注:大概率无需改动,仅验证

---

## 阶段 5:示例与文档

> 创建各模式的示例项目,更新文档和 AGENTS.md。

- [ ] M5-1 创建 `backend` 示例项目
  - 创建 `examples/backend/` 目录,包含:
    - `package.json`(依赖 `ubean`,不含 `vue`)
    - `ubean.config.ts`(`mode: 'backend'`)
    - `src/routes/users.ts`、`src/routes/posts.ts`(API 路由)
    - 无 `src/pages/`、`src/app.ts`
  - 验证 `ubean build` 仅产出 `dist/server/`
  - 状态:`[ ]`
  - 验证:`examples/backend/dist/` 不含 `public/` 目录
  - 备注:展示纯 API 后端的最小化产物

- [ ] M5-2 更新 `frontend-only` 示例文档
  - 在 [examples/frontend-only/ubean.config.ts](../examples/frontend-only/ubean.config.ts) 添加注释说明 `mode: 'spa'` 的含义
  - 更新 [examples/frontend-only/README.md](../examples/frontend-only/) (如存在)说明 SPA 模式的产物结构
  - 状态:`[ ]`
  - 验证:示例文档清晰说明 SPA 模式的用途和限制
  - 备注:限制包括无 SSR、无 SEO(除非用 SSG)、无 API 路由

- [ ] M5-3 更新 AGENTS.md 添加 mode 说明
  - 在 [AGENTS.md](../AGENTS.md) 的 "3. 核心约定" 章节新增 "3.7 应用模式" 小节:
    - 列出 5 种 mode 及其用途
    - 说明 `mode` 与 `preset`/`routing.mode`/`prerender` 的正交关系
    - 添加到 "4. 核心 API 速查" 的配置表格
  - 在 "8. 常见陷阱" 新增:
    - "不要在 `spa` 模式下使用 `src/routes/` — 不会被构建为 server bundle"
    - "不要在 `backend` 模式下使用 `src/pages/` — 不会被构建为 client bundle"
  - 状态:`[ ]`
  - 验证:AGENTS.md 内容准确、与实现一致
  - 备注:AGENTS.md 是 AI 助手的主要参考,需保持更新

- [ ] M5-4 更新 skills/ubean 文档
  - 在 [skills/ubean/docs/guide/](../skills/ubean/docs/guide/) 新增 `modes.md`:
    - 面向用户的模式选择指南(何时用 spa/ssg/backend)
    - 各模式的配置示例
    - 各模式的产物结构说明
  - 更新 [skills/ubean/SKILL.md](../skills/ubean/SKILL.md) 提及 `mode` 字段
  - 状态:`[ ]`
  - 验证:用户文档能指导用户选择正确的 mode
  - 备注:这是面向最终用户的文档,需通俗易懂

- [ ] M5-5 更新 CI workflow
  - 在 [.github/workflows/ci.yml](../.github/workflows/ci.yml) 的构建矩阵中:
    - 添加 `examples/ssg` 和 `examples/backend` 的构建验证
    - 确保各 mode 的示例项目在 CI 中构建通过
  - 状态:`[ ]`
  - 验证:CI 全量通过
  - 备注:防止模式相关改动引入回归

- [ ] M5-6 全量回归验证
  - 运行 `pnpm typecheck` 全量通过
  - 运行 `pnpm -r build` 全量通过(含所有 examples)
  - 验证 `examples/ubean-test`(fullstack 模式)产物结构与改动前一致
  - 验证 `examples/frontend-only`(spa 模式)无 `dist/server/`
  - 验证 `examples/ssg`(ssg 模式)有预渲染 HTML
  - 验证 `examples/backend`(backend 模式)无 `dist/public/`
  - 状态:`[ ]`
  - 验证:所有模式行为符合 [modes.md](modes.md) 描述
  - 备注:这是最终验收门槛

---

## 依赖关系

```
M1-1 → M1-2 → M1-3 → M1-4(回归基线)
                           ↓
                      M2-1 → M2-2 → M2-3 → M2-4 → M2-5(spa 示例)
                                                ↓
                                           M3-1 → M3-2 → M3-3 → M3-4 → M3-5(ssg 示例)
                                                                       ↓
                                                                  M4-1 → M4-2 → M4-3 → M4-4(backend)
                                                                                           ↓
                                                                                      M5-1 ~ M5-6(文档)
```

- Phase 1 是所有后续阶段的前置
- Phase 2(spa)是 Phase 3(ssg)的前置(ssg 复用 spa 的静态文件服务器)
- Phase 4(backend)可与 Phase 2/3 并行,但建议在 Phase 2 之后(复用 `buildProduction` 重构)
- Phase 5 必须在所有功能阶段完成后

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|---|---|---|
| `buildProduction` 重构引入回归 | 高 | M1-4 建立回归基线;每次提取子函数后立即验证 `fullstack` 产物 |
| `ssg` 模式 prerender 失败 | 中 | 已有 fallback 逻辑([build.ts#L34](../packages/cli/src/build.ts#L34));添加日志告警 |
| `backend` 模式 Vue 插件条件加载遗漏 | 中 | 在 production.ts 和 vite-server.ts 两处同步改动 |
| 静态文件服务器引入新依赖 | 低 | 优先用 Node 内置 `http` + `fs`,避免引入 `sirv` 等 |
| CI 构建矩阵膨胀 | 低 | examples 数量有限(4-5 个),可控 |

## 附录:产物结构对照

### fullstack / ssr(默认)

```
dist/
├── public/          # 客户端产物
│   ├── index.html
│   ├── assets/
│   └── favicon.svg
└── server/          # 服务端产物
    ├── entry.mjs
    ├── server.mjs
    └── package.json
```

### spa

```
dist/
└── public/          # 仅客户端产物
    ├── index.html
    ├── assets/
    └── favicon.svg
```

### ssg

```
dist/
└── public/          # 预渲染的静态 HTML + 客户端 assets
    ├── index.html
    ├── about/
    │   └── index.html
    ├── blog/
    │   └── post-1/
    │       └── index.html
    ├── assets/
    └── favicon.svg
```

### backend

```
dist/
└── server/          # 仅服务端产物
    ├── entry.mjs
    ├── server.mjs
    └── package.json
```
