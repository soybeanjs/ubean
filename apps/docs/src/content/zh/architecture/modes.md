---
title: Modes
---

# ubean 应用模式(App Mode)设计方案

> **状态:✅ 已实施(2026-07)**
>
> 本文档为原始设计方案。`AppMode` 类型与 `mode`/`ssr` 配置字段已落地到 [`@ubean/config`](../packages/config/src/types.ts)(`'fullstack' | 'spa' | 'ssg' | 'backend'`)。
> 本文档保留作为设计决策记录;实际 API 以 [AGENTS.md](../AGENTS.md) 与 [skills/ubean/docs](../skills/ubean/docs) 为准。
>
> ---
>
> 本文档描述 ubean 框架的 `mode` 配置字段设计,支持前端-only、后端-only、全栈、SSG 等多种应用形态。

## 1. 背景与目标

### 1.1 现状问题

当前 ubean 的构建流程(见 [packages/build/src/production.ts](../packages/build/src/production.ts))**无条件构建 client bundle + SSR bundle + server bundle**,即使项目是纯前端应用也会产出完整的 `dist/server/` 目录,造成:

1. **产物冗余** — `frontend-only` 示例仍会输出 `dist/server/entry.mjs`、`server.mjs` 等文件,实际从未使用
2. **构建耗时** — SSR bundle 构建约占整体构建时间的 40%,纯前端项目浪费明显
3. **语义模糊** — `frontend-only` 示例的 [ubean.config.ts](../examples/frontend-only/ubean.config.ts) 是空配置,仅靠"不创建 `src/routes/`、`src/server.ts`"隐式表达"前端-only"意图,无显式声明
4. **部署困惑** — 用户不知道哪些产物是必需的、哪些可以删除

### 1.2 设计目标

- **单一配置入口** — 通过 `ubean.config.ts` 的 `mode` 字段统一声明应用形态
- **默认全栈** — `mode` 默认值为 `fullstack`,完全向后兼容现有行为
- **按需构建** — 根据 `mode` 跳过不必要的构建步骤,减小产物体积和构建时间
- **正交设计** — `mode` 与 `preset`(部署平台)、`routing.mode`(路由生成方式)、`prerender`(SSG 开关)保持正交,可自由组合
- **SSR 可控** — `fullstack` 模式下通过 `ssr: false` 关闭 SSR 渲染,保留 API 路由 + 客户端渲染(避免引入冗余的 `ssr` 模式别名)

### 1.3 非目标

- **不**改变现有 `fullstack` 模式(`ssr: true` 默认)的任何行为(零破坏性变更)
- **不**替代 `preset` 的平台适配职责(node/cloudflare/vercel 等)
- **不**引入 CJS/`require` 导出(保持 ESM-only)
- **不**自动安装/卸载 npm 依赖(用户仍需手动 `pnpm add`)
- **不**保留 `ssr` 作为独立 mode —— 它与 `fullstack` 语义完全等同,改由 `ssr: boolean` 选项在 `fullstack` 模式内控制

## 2. 模式定义

### 2.1 AppMode 类型

```typescript
export type AppMode = 'fullstack' | 'spa' | 'ssg' | 'backend';
```

> **设计决策**:不再保留 `ssr` 作为独立 mode。原本的 `ssr` mode 与 `fullstack` 行为完全一致,只是"语义强调",但实际配置语义重复,容易让用户误以为有差异。改为 `fullstack` 模式下的 `ssr: boolean` 选项,既能强调"是否需要 SSR",又避免了 mode 数量膨胀。

### 2.2 模式语义

| Mode | Client bundle | SSR bundle | Server bundle | Prerender | 说明 |
|---|---|---|---|---|---|
| `fullstack`(默认,`ssr: true`) | ✅ | ✅ | ✅ | 可选 | 当前默认行为,Vue 页面 + Hono API + SSR |
| `fullstack` + `ssr: false` | ✅ | ❌ | ✅ | ❌ | Vue 页面 + Hono API,无 SSR 渲染(适合无 SEO 需求的全栈应用) |
| `spa` | ✅ | ❌ | ❌ | ❌ | 纯客户端渲染,仅静态 HTML + JS,无服务端 |
| `ssg` | ✅ | ✅(临时) | ❌ | ✅(强制) | 构建时用 SSR 渲染静态 HTML,产物为纯静态文件 |
| `backend` | ❌ | ❌ | ✅ | ❌ | 纯 Hono API 服务,无 Vue 页面、无 SSR |

### 2.3 模式选择指南

| 场景 | 推荐 mode | 说明 |
|---|---|---|
| 全栈应用(页面 + API + SEO) | `fullstack`(默认) | 最常用,含 SSR |
| 全栈应用(页面 + API,无 SEO) | `fullstack` + `ssr: false` | 后台管理系统等 |
| 纯 API 服务(无前端) | `backend` | 微服务、BFF |
| 营销站/博客(静态) | `ssg` | SEO 友好,部署到 CDN |
| 纯前端应用(无 API) | `spa` | 无 SEO 需求,无服务端 |

### 2.4 与现有配置的关系

| 配置字段 | 与 mode 的关系 | 说明 |
|---|---|---|
| `build.preset` | 正交 | `mode` 控制架构(有无前端/后端),`preset` 控制部署平台(node/cf) |
| `routing.mode` | 正交 | `routing.mode` 控制路由文件生成方式(virtual/file),与 `mode` 无关 |
| `prerender.enabled` | mode 覆盖 | `ssg` 模式强制 `prerender.enabled = true`;`spa`/`backend`/`fullstack`+`ssr:false` 模式强制 `false` |
| `ssr` | mode 内选项 | 仅 `mode === 'fullstack'` 时生效;`spa`/`ssg`/`backend` 模式下 `ssr` 字段被忽略 |
| `icon`/`pwa`/`auth` 等 | 正交 | 扩展模块按需加载,不受 `mode` 影响 |
| `i18n` | 正交 | i18n 配置与 `mode` 独立 |

## 3. 架构设计

### 3.1 配置层

#### 3.1.1 类型定义

在 [packages/config/src/types.ts](../packages/config/src/types.ts) 的 `UbeanConfig` 接口中新增:

```typescript
export type AppMode = 'fullstack' | 'spa' | 'ssg' | 'backend';

export interface UbeanConfig {
  /**
   * 应用模式,控制构建流程按需执行。
   *
   * - `fullstack`(默认):客户端 + SSR + 服务端,完整全栈
   * - `spa`:纯客户端渲染,无 SSR、无服务端 bundle
   * - `ssg`:静态站点生成,构建时预渲染,产物为纯静态文件
   * - `backend`:纯 API 后端,无 Vue 页面、无 SSR
   */
  mode?: AppMode;

  /**
   * 是否构建 SSR bundle。仅在 `mode === 'fullstack'` 时生效。
   *
   * - `true`(默认):构建 SSR bundle,支持服务端渲染
   * - `false`:跳过 SSR bundle 构建,仅保留客户端渲染 + API 路由
   *
   * 其他 mode 下此字段被忽略(`spa`/`backend` 始终无 SSR;
   * `ssg` 始终需要 SSR 进行预渲染)。
   */
  ssr?: boolean;
  // ... 现有字段保持不变
}
```

#### 3.1.2 默认值

在 [packages/config/src/loader.ts](../packages/config/src/loader.ts) 的 `configDefaults` 中新增:

```typescript
const configDefaults: ResolvedConfig = {
  mode: 'fullstack', // 新增,默认全栈
  ssr: true,         // 新增,默认开启 SSR
  // ... 现有字段
};
```

#### 3.1.3 ResolvedConfig

`ResolvedConfig` 自动继承 `mode` 和 `ssr` 字段(已是 `Required` 包装)。

### 3.2 构建层

核心改动在 [packages/build/src/production.ts](../packages/build/src/production.ts) 的 `buildProduction` 函数。

#### 3.2.1 构建流程分支

```typescript
export async function buildProduction(options: BuildOptions): Promise<BuildManifest> {
  const { config, scanResult } = options;
  const mode = config.mode;
  const ssrEnabled = mode === 'fullstack' ? config.ssr : (mode === 'ssg');

  // 1. 生成虚拟模块(按 mode 选择性生成)
  await generateVirtualModulesToDisk(cwd, config, scanResult, virtualDir, mode, ssrEnabled);

  // 2. 客户端 bundle(mode !== 'backend')
  if (mode !== 'backend') {
    await buildClientBundle(/* ... */);
  }

  // 3. SSR bundle(fullstack+ssr / ssg)
  //    - fullstack + ssr:true → 需要 SSR
  //    - fullstack + ssr:false → 跳过 SSR
  //    - ssg → 需要 SSR(用于预渲染)
  //    - spa / backend → 跳过 SSR
  if (ssrEnabled) {
    await buildSSRBundle(/* ... */);
  }

  // 4. Server entry(fullstack / backend)
  //    - fullstack → 总是需要 server bundle(包含 API 路由 + 可选 SSR)
  //    - backend → 需要 server bundle(纯 API)
  //    - ssg → 临时 server bundle 已在 prerender 后由 CLI 清理
  //    - spa → 不需要 server bundle
  if (mode === 'fullstack' || mode === 'backend') {
    await generateServerEntry(/* ... */);
  }

  // 5. SSG 预渲染(mode === 'ssg',或 prerender.enabled)
  //    由 CLI 层处理(clis/build.ts),不在 buildProduction 内
}
```

#### 3.2.2 虚拟模块按需生成

在 [packages/build/src/virtual-modules.ts](../packages/build/src/virtual-modules.ts) 的 `generateVirtualModulesToDisk` 中:

| 虚拟模块 | fullstack + ssr:true | fullstack + ssr:false | spa | ssg | backend |
|---|---|---|---|---|---|
| `ubean:routes`(API 路由) | ✅ | ✅ | ✅ | ✅ | ✅ |
| `ubean:pages`(页面路由) | ✅ | ✅ | ✅ | ✅ | ❌ |
| `ubean:meta`(路由元数据) | ✅ | ✅ | ✅ | ✅ | ❌ |
| `ubean:app-config`(应用配置) | ✅ | ✅ | ✅ | ✅ | ✅ |
| `ubean:locales`(i18n) | ✅ | ✅ | ✅ | ✅ | ✅ |
| `virtual:ubean-pages`(Vue 页面) | ✅ | ✅ | ✅ | ✅ | ❌ |
| `virtual:ubean-app`(Vue 应用入口) | ✅ | ✅ | ✅ | ✅ | ❌ |
| `virtual:ubean-server`(服务端入口) | ✅ | ✅ | ❌ | ✅(临时) | ✅ |
| `virtual:ubean-client-entry`(客户端入口) | ✅ | ✅ | ✅ | ✅ | ❌ |

> **说明**:`fullstack` + `ssr:false` 仍生成 `virtual:ubean-server`,因为 server bundle 仍需启动 Hono app 处理 API 路由,只是不渲染 Vue 页面。

#### 3.2.3 Vue 插件按需加载

在 [production.ts#L499-L511](../packages/build/src/production.ts#L499-L511) 的 `builtinPlugins` 中:

```typescript
const builtinPlugins: VitePlugin[] = [];

// Vue 插件仅在非 backend 模式加载(backend 无页面)
if (config.mode !== 'backend') {
  builtinPlugins.push(
    vue({ /* ... */ }) as VitePlugin,
    ...ubeanVuePlugin({ config }),
    ubeanIslandsPlugin()
  );
}

// ubeanPlugin(核心插件)始终加载(负责路由扫描、虚拟模块)
if (!userViteConfig) {
  builtinPlugins.push(ubeanPlugin({ config }));
}
```

### 3.3 CLI 层

#### 3.3.1 build 命令

在 [packages/cli/src/build.ts](../packages/cli/src/build.ts) 中:

```typescript
export const buildCommand: CommandDef = {
  args: {
    // 现有 args...
    mode: {
      type: 'string',
      description: 'App mode (fullstack, spa, ssg, backend). Overrides ubean.config.ts mode'
    },
    ssr: {
      type: 'boolean',
      description: 'Enable SSR in fullstack mode (only effective with --mode fullstack)',
      default: true
    },
    // 新增 --ssg 快捷参数
    ssg: {
      type: 'boolean',
      description: 'Shortcut for --mode ssg',
      default: false
    }
  },
  async run({ args }) {
    const config = await loadUbeanConfig(cwd);

    // CLI --mode 覆盖配置文件
    if (args.mode) config.mode = args.mode;
    if (args.ssg) config.mode = 'ssg';

    // CLI --ssr 覆盖配置(仅在 fullstack 模式下生效)
    if (config.mode === 'fullstack' && args.ssr !== undefined) {
      config.ssr = args.ssr;
    }

    // 根据 mode 调整 prerender 行为
    if (config.mode === 'ssg') {
      config.prerender.enabled = true; // 强制开启
    } else if (config.mode === 'spa' || config.mode === 'backend') {
      config.prerender.enabled = false; // 强制关闭
    } else if (config.mode === 'fullstack' && !config.ssr) {
      config.prerender.enabled = false; // fullstack + ssr:false 无法 prerender
    }

    // 现有构建流程...
    const manifest = await buildProduction({ /* ... */ });

    // SSG 预渲染(mode === 'ssg' 或 prerender.enabled)
    const shouldPrerender = config.prerender.enabled;
    if (shouldPrerender) {
      const fetcher = await createSsrFetcher(cwd, manifest);
      await prerender({ /* ... */ });
    }

    // SSG 模式:清理临时 server bundle
    if (config.mode === 'ssg') {
      await rm(outDirs.server, { recursive: true, force: true });
    }
  }
};
```

#### 3.3.2 preview 命令

在 [packages/cli/src/preview.ts](../packages/cli/src/preview.ts) 中,根据 `mode` 选择预览方式:

| Mode | Preview 方式 |
|---|---|
| `fullstack` / `backend` | 启动 `dist/server/server.mjs`(现有行为) |
| `spa` / `ssg` | 启动静态文件服务器(serve `dist/public/`) |

```typescript
async run({ args }) {
  const config = await loadUbeanConfig(cwd);

  if (config.mode === 'spa' || config.mode === 'ssg') {
    // 静态文件服务器
    await startStaticServer({ root: join(cwd, config.build.outputDir, 'public'), port, host });
  } else {
    // 现有 Node server 预览逻辑(fullstack + ssr:true/false / backend)
    await startNodeServer({ serverPath, port, host });
  }
}
```

> **说明**:`fullstack` + `ssr:false` 仍使用 Node server 预览,因为 server bundle 包含 API 路由处理。

### 3.4 Dev 层

Dev 模式改动较小,因为 Vite middleware 模式天然支持按需加载。

在 [packages/dev-server/src/vite-server.ts](../packages/dev-server/src/vite-server.ts#L220-L225) 中:

```typescript
const builtinPlugins: VitePlugin[] = [];

// backend 模式不加载 Vue 相关插件
if (config.mode !== 'backend') {
  builtinPlugins.push(
    ...ubeanVuePlugin({ config }),
    ubeanIslandsPlugin()
  );
}

if (!hasUserViteConfig) {
  builtinPlugins.push(ubeanPlugin({ config }));
}
```

Dev server 的请求处理保持不变 — `app.fetch(webReq)` 已能正确处理无页面/无路由的场景。
`fullstack` + `ssr:false` 在 dev 下仍走 Vite middleware SSR(因为 dev 不区分 SSR on/off,只影响构建产物),
如需严格关闭 dev SSR,可在后续迭代中处理。

### 3.5 模块系统(无需改动)

现有 [packages/modules/src/index.ts](../packages/modules/src/index.ts#L203) 的动态 `import()` 机制已支持扩展包(icon/pwa/auth/image/fonts)按需加载,`mode` 不需要干预。

`mode` 仅控制**核心构建步骤**和**虚拟模块生成**,不涉及扩展包的加载逻辑。

## 4. 各模式详细行为

### 4.1 `fullstack` 模式(默认,`ssr: true`)

**完全等同当前行为,零改动。**

- 构建:`dist/public/`(客户端) + `dist/server/`(服务端)
- Dev:Vite middleware + Hono app
- Preview:Node server (`server.mjs`)
- Prerender:可选(由 `prerender.enabled` 控制)

### 4.2 `fullstack` 模式 + `ssr: false`

**全栈但无 SSR,适合后台管理系统等无 SEO 需求的全栈应用。**

构建流程:
1. ✅ 生成客户端 + 服务端虚拟模块(服务端仍需启动 Hono app 处理 API 路由)
2. ✅ 构建 client bundle → `dist/public/`
3. ❌ 跳过 SSR bundle 构建(节省约 40% 构建时间)
4. ✅ 构建 server bundle(包含 Hono app + API 路由,但无 Vue 渲染器)
5. ❌ 跳过 prerender(无 SSR 无法预渲染)

产物结构:
```
dist/
├── public/          # 客户端产物
│   ├── index.html
│   ├── assets/
│   └── favicon.svg
└── server/          # 服务端产物(仅 API,无 SSR 渲染器)
    ├── entry.mjs
    ├── server.mjs
    └── package.json
```

Dev 行为:
- 等同 `fullstack` + `ssr:true`(dev 模式不区分 SSR on/off)
- HMR 正常工作

Preview 行为:
- 启动 Node server(同 `fullstack`),API 路由正常响应,页面请求由客户端渲染

### 4.3 `spa` 模式

**纯客户端渲染,无服务端。**

构建流程:
1. ✅ 生成客户端虚拟模块(`ubean:pages`、`ubean:app`、`virtual:ubean-client-entry`)
2. ✅ 构建 client bundle → `dist/public/`
3. ✅ 生成 `index.html`(包含 `<script type="module">` 指向客户端入口)
4. ❌ 跳过 SSR bundle 构建
5. ❌ 跳过 server entry 生成
6. ❌ 跳过 prerender

产物结构:
```
dist/
└── public/
    ├── index.html
    ├── assets/
    │   ├── app-[hash].js
    │   └── ...
    └── favicon.svg
```

Dev 行为:
- Vite dev server 仍然 middleware 模式,但 `app.fetch()` 对所有路由返回客户端 HTML
- HMR 正常工作

Preview 行为:
- 启动静态文件服务器 serve `dist/public/`

### 4.4 `ssg` 模式

**静态站点生成,构建时预渲染。**

构建流程:
1. ✅ 生成客户端 + SSR 虚拟模块(SSR 仅用于构建时渲染)
2. ✅ 构建 client bundle → `dist/public/`
3. ✅ 构建 SSR bundle → `dist/server/`(临时)
4. ✅ 强制执行 prerender → 生成 `dist/public/**/*.html`
5. ✅ 删除临时 `dist/server/` 目录

产物结构:
```
dist/
└── public/
    ├── index.html          # 预渲染的首页
    ├── about/
    │   └── index.html      # 预渲染的 /about
    ├── blog/
    │   ├── post-1/
    │   │   └── index.html
    │   └── ...
    ├── assets/             # 客户端 JS/CSS
    └── favicon.svg
```

Dev 行为:
- 等同 `fullstack`(dev 模式不预渲染,实时 SSR)

Preview 行为:
- 启动静态文件服务器 serve `dist/public/`

### 4.5 `backend` 模式

**纯 API 后端,无前端。**

构建流程:
1. ✅ 生成 API 路由虚拟模块(`ubean:routes`、`ubean:app-config`、`ubean:locales`)
2. ❌ 跳过页面相关虚拟模块(`ubean:pages`、`ubean:meta`、`virtual:ubean-pages` 等)
3. ❌ 跳过 Vue 插件加载
4. ❌ 跳过 client bundle 构建
5. ✅ 构建 SSR/server bundle → `dist/server/`(包含 Hono app + API 路由)

产物结构:
```
dist/
└── server/
    ├── entry.mjs
    ├── server.mjs          # Node 入口
    └── package.json
```

Dev 行为:
- Vite middleware 模式,但不加载 Vue 插件
- `app.fetch()` 直接处理 API 请求,无页面渲染

Preview 行为:
- 启动 Node server(等同 `fullstack`)

## 5. 实施策略

### 5.1 分阶段实施

| 阶段 | 内容 | 风险 | 价值 |
|---|---|---|---|
| Phase 1 | Config 类型 + 默认值 + CLI 参数 | 低 | 基础设施 |
| Phase 2 | `spa` 模式 | 低 | 高(最常用) |
| Phase 3 | `ssg` 模式 | 中(需清理临时产物) | 高(营销站场景) |
| Phase 4 | `backend` 模式 | 中(Vue 插件条件加载) | 中 |
| Phase 5 | `fullstack` + `ssr: false` | 低(复用前序条件分支) | 中(无 SEO 全栈场景) |
| Phase 6 | 示例 + 文档 | 低 | 完整性 |

### 5.2 向后兼容保证

- `mode` 默认值为 `fullstack`,`ssr` 默认值为 `true`,现有项目无需任何改动
- `mode: 'fullstack'` + `ssr: true`(默认)的构建流程与当前**完全一致**(使用严格相等判断,不改变控制流)
- 现有 `prerender.enabled` 配置在 `fullstack` + `ssr: true` 模式下行为不变
- 现有 `frontend-only` 示例可平滑迁移到 `mode: 'spa'`(但旧配置仍可用)
- 旧的 `mode: 'ssr'` 配置会被拒绝(类型错误) —— 这是一个**有意识的破坏性变更**,因为 `ssr` mode 此前与 `fullstack` 完全等价,从未真正发布使用

### 5.3 测试策略

- 每个 mode 至少一个 example 项目
- `pnpm typecheck` 全量通过
- `pnpm -r build` 全量通过
- 验证各 mode 的产物结构符合预期
- 验证 `fullstack` + `ssr: true`(默认)模式行为与改动前完全一致(回归测试)
- 验证 `fullstack` + `ssr: false` 模式跳过 SSR bundle 且 API 路由仍可正常响应

## 6. 关键决策记录

### 6.1 为什么不叫 `type` 而叫 `mode`?

`type` 在 TypeScript 生态中是保留字,且 `package.json` 已有 `"type": "module"` 字段,容易混淆。`mode` 语义清晰,且与 Vite 的 `mode` 概念不冲突(ubean 的 `mode` 是架构层面,Vite 的 `mode` 是环境变量层面)。

### 6.2 为什么 `ssg` 模式构建时仍需 SSR?

SSG 的本质是"在构建时执行 SSR 生成静态 HTML"。如果不构建 SSR bundle,就无法预渲染。因此 `ssg` 模式构建流程包含 SSR bundle,但构建完成后**清理**临时 server 产物,最终输出纯静态文件。

### 6.3 为什么不自动安装/卸载依赖?

自动安装依赖会引入副作用(npm registry 调用、lockfile 变更),且不同包管理器(pnpm/yarn/npm)行为不一致。ubean 保持"配置声明 + 用户手动安装"的模式,与 Nuxt/Next 的行为一致。

### 6.4 为什么 `backend` 模式仍保留 `ubeanPlugin`?

`ubeanPlugin`([packages/build/src/vite.ts](../packages/build/src/vite.ts))负责路由扫描和核心虚拟模块生成,这些在 `backend` 模式下仍然需要(API 路由扫描)。仅 Vue 专属插件(`ubeanVuePlugin`、`ubeanIslandsPlugin`)按需跳过。

### 6.5 为什么移除 `ssr` mode,改为 `fullstack` + `ssr: false`?

最初的方案保留 `ssr` 作为 `fullstack` 的语义别名,但这带来几个问题:

1. **认知负担**:用户面对 5 种 mode 时会困惑 `ssr` 与 `fullstack` 的差异,文档也需要反复解释"等同"
2. **扩展性差**:如果未来要支持"fullstack 但跳过 SSR",就需要新增 mode 或额外选项,模式矩阵膨胀
3. **正交性破坏**:`mode` 本应描述"应用形态"(前端/后端/全栈/静态),而 SSR on/off 是"构建选项",不应混入 mode 维度

改为 `ssr: boolean` 选项后:
- `mode` 保持 4 种纯粹形态(全栈/前端/静态/后端)
- SSR 作为 `fullstack` 模式的子选项,语义清晰
- 用户可独立切换 SSR 而无需改变 mode
- 类型系统能精确表达"ssr 字段仅在 fullstack 下生效",其他 mode 下静默忽略

### 6.6 为什么 `fullstack` + `ssr: false` 仍生成 server bundle?

`ssr: false` 仅跳过 SSR bundle(Vue 渲染器),不跳过 server bundle(Hono app)。因为 fullstack 应用通常同时包含 API 路由,API 路由需要 server bundle 才能响应。如果用户既不需要 SSR 也不需要 API,应改用 `spa` mode。

## 7. 参考资料

- [packages/config/src/types.ts](../packages/config/src/types.ts) — 配置类型定义
- [packages/config/src/loader.ts](../packages/config/src/loader.ts) — 配置加载与默认值
- [packages/build/src/production.ts](../packages/build/src/production.ts) — 构建流程
- [packages/build/src/virtual-modules.ts](../packages/build/src/virtual-modules.ts) — 虚拟模块生成
- [packages/cli/src/build.ts](../packages/cli/src/build.ts) — CLI build 命令
- [packages/cli/src/preview.ts](../packages/cli/src/preview.ts) — CLI preview 命令
- [packages/dev-server/src/vite-server.ts](../packages/dev-server/src/vite-server.ts) — Dev server
- [packages/modules/src/index.ts](../packages/modules/src/index.ts) — 模块系统(动态 import)
- [examples/frontend-only/ubean.config.ts](../examples/frontend-only/ubean.config.ts) — 现有前端示例
