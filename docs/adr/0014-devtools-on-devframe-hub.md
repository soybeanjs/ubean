# ADR-0014 · DevTools 宿主迁移：DTK → devframe hub

- **状态**: implemented（2026-10-11 实测走查通过）
- **日期**: 2026-10-11
- **关联**: [ADR-0012](0012-vite-plugin-first-lifecycle.md)（dev 生命周期下放；本 ADR 是该 ADR「保留命名空间」不变量的延续）、[ADR-0004](0004-devtools-ai-sdk-optional-deps.md)（devtools 的依赖形态）
- **参照实现**: [Vue DevTools v9](https://github.com/vuejs/devtools)（`@vitejs/devtools`）、[Nuxt DevTools v4](https://github.com/nuxt/devtools)、[devframe](https://github.com/devframes/devframe) 1.2.3

## 背景

`@ubean/devtools` 原先接在 `@vitejs/devtools-kit`（DTK）上：插件暴露 `devtools.setup(ctx)`，自己 `ctx.views.hostStatic()` 服务 SPA、手写 60 行 `__connection.json` 转发、硬编码 11 个 dock entry、`ctx.rpc.register()` 逐函数注册。

这套接线的成本随 DTK 版本上升：

1. **DTK 把 Vite 的 `devtools` 选项当唯一入口。** 宿主（Vite 自身）在选项开启时加载 `DevToolsIntegration`，再手动 `DevTools(...)` 会硬报 `DTK0034: Vite DevTools has been registered multiple times.` 并让 dev server 退出（0.7.5 实测：cli 的 `dev-reload` / `dev-dx` / `dev-topology` 三个测试文件整片失败）。
2. **DTK 自带面板与我们的面板重叠。** 必须靠 `builtinDevTools: false` 关掉它，再加 `VITE_DEVTOOLS_DISABLE_CLIENT_AUTH=true` 绕开它的客户端认证——三处开关都是为了「让 DTK 别管事」。
3. **DTK 是「Vite 的 DevTools」，不是「多个 devframe 的宿主」。** Vue DevTools v9 与 Nuxt DevTools v4 都已收敛到同一形状：一个 `DevframeDefinition` → `ctx.install(def)` → 一个 iframe dock（内部 tab 运行时发现）。DTK 自己就是 devframe 之上的一层薄壳。

## 决定

**`@ubean/devtools` 迁到 devframe 体系，宿主改为 `@devframes/hub`。** 具体：

1. **DevTools 是一个 `DevframeDefinition`，不是 Vite 插件。** `createUbeanDevframe(options)` 返回定义（`id: 'ubean'`、`basePath`、`clientAssets`、`dock`、`setup(ctx)`）；`ubeanDevtoolsPlugin()` 退化为只携带 `__ubeanDevframe` 的装配壳。
2. **宿主由 `@devframes/vite/hub` 的 `viteDevframeHub()` 挂载**，`devframes: [{ devframe, dock: UBEAN_ANCHOR_DOCK }]`。hub 负责：外壳（dock 侧栏 + 认证）、`__connection.json`、`__ws`、每个 devframe 的静态产物、共享 RPC 注册表。我们不再手写任何传输层。
3. **`basePath: '/_devtools/'` 保留用户可见路径。** devframe 默认挂 `/__<id>/`，`basePath` 覆盖它；CLI 从 `config.devtools.route` 取值。`/_devtools` 302 到 hub 外壳（`/__devframes/`）。
4. **RPC 走 `ctx.scope('ubean')` + 裸名注册。** 16 个函数从 `ubean:crud:create`（双冒号）改为裸名 `crud-create` → wire 名 `ubean:crud-create`（单冒号）。devframe 的 `prefixDefinition` 拒绝含 `:` 的名字（抛 `DF0034`）。
5. **视图清单由客户端运行时上报。** 服务端不再硬编码 11 个 dock entry；SPA 用 frame-nav 协议（`postMessage`）把视图清单报给 hub 外壳，外壳合成 member docks。服务端那份 `UBEAN_VIEWS` 随之删除。
6. **`auth: false`。** hub 默认开交互式 OTP（「Authorize Devframes」屏），旧 DevTools 从来没有这一步；dev server 默认只绑 localhost，再加一道口令只会把用户挡在面板外。
7. **`capabilities: { build: false }`。** DevTools 写真实文件，静态导出只会得到一个不能写的空壳。

## 落地期撞出来的四个陷阱

前两条是**静默失败**（没有报错，只是面板不可用），后两条是构建期/产物问题：

1. **`subTabs` 不在 `DevframeDefinition.dock` 的类型里。** `frameId` / `subTabs` / `visibility` 属于 `DevframeViewIframe`，而 `def.dock` 的类型是 `DevframeDockDefaults`——写在那里会被静默丢弃，hub 不给 iframe 挂 frame-nav，SPA 上报的视图永远不会变成 dock 按钮（外壳只剩一个空 dock 栏 + 一个空壳 iframe）。必须走 `initHub({ devframes: [{ devframe, dock }] })`。
2. **anchor dock 不能设 `visibility: 'false'`。** 它隐藏 anchor 自己的 dock 按钮，而 iframe 只在 anchor 被激活时才挂载——隐藏 anchor 就永远发现不了视图清单，面板整个打不开。
3. **`@devframes/*` 与 `devframe` 必须外部化进 CLI 产物。** `@devframes/hub-ui` 的 `clientDir()` 用 `fileURLToPath(new URL('.', import.meta.url))` 定位自己的 `dist/client/`（`embedded.js` / standalone SPA）。被内联后基准变成 `packages/cli/dist/`，`/__devframes/embedded.js` 500 `ENOENT`，面板打不开。
4. **hub 外壳必须跳过应用的 HTML transform。** hub 自己给外壳注入 `embedded.js` 引导脚本；`transformIndexHtml` 再注一份应用入口就是同一个页面启动两次（devframe 报 `A client context is already published on this page`）。`isFrameworkHtmlPage()` 因此把整个 `/__devframes/**` 命名空间判为框架页面。

## 刻意不做

- **不引入 DTK 作为中间层。** 有人（包括 `viteDevframeHub` 自己的 `recommendViteDevtools()` 提示）会建议「在 Vite 里挂 hub 不如改用 DTK」。我们有意不走：DTK 要求 Vite 的 `devtools` 选项作为入口，而 ubean 需要 hub 在**没有** `@vitejs/devtools` 的机器上工作，也不想让 Vite 自己再插一套客户端脚本。`quiet: true` 关掉那条提示。
- **不把 `@devframes/*` 变成主包硬依赖。** 它们仍是 `@ubean/devtools` 的 devDeps（`devtools` 是可选 peer，未安装时 CLI 静默跳过）。
- **不做浮动面板。** Nuxt DevTools v4 已删除浮动面板、只留 dock group；ubean 直接对齐这个形态（dock 侧栏 + iframe SPA）。

## 影响

- `@ubean/devtools` 的 `src/node/index.ts` 从 382 行降到 ~300 行（删掉 `hostStatic` / `__connection.json` 转发 / 11 个硬编码 dock entry / 手写模块增强）。
- 新增 `src/node/rpc/types.ts`（`defineUbeanRpc` + 三个常量）、`client/app/views-manifest.ts`、`client/app/composables/useFrameTabs.ts`。
- 客户端 `base` 从 `/_devtools/` 改为相对 `./`（挂载点由 hub 决定）。
- 自定义 tab 注册表从模块级数组改为挂 `globalThis`（`__ubean_devtools_custom_tabs__`）——dev 下 CLI 动态 `import()` 与用户 `vite.config.ts` 静态引会拿到两份模块实例，模块级数组会让注册的 tab 永远不出现且**无任何报错**（AGENTS.md 第 19 条）。
- `/_devtools` 302 目标从 `/__devtools/` 改为 `/__devframes/`；`DEVTOOLS_PASS_THROUGH_PREFIXES` 增加 `/__devframes`（`/__devtools` 作为历史条目保留，兼容仍装了 `@vitejs/devtools` 的用户项目）。
