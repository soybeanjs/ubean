# ADR-0015 · 扁平路由表 + layout 链，而不是嵌套路由树

- **状态**: accepted（现状即此形态，本 ADR 记录理由与代价）
- **日期**: 2026-10-20
- **关联**: [ADR-0010](0010-competitive-north-star-and-gap-filter.md)（对标 Next 能力 / Nuxt 约定）、[ADR-0011](0011-lightweight-ssg-direct-render.md)（`compilePageRoute` / `matchRoutePattern` 依赖扁平表）
- **对照实现**: [vue-router unplugin](https://github.com/vuejs/router/tree/main/packages/router/src/unplugin)（`PrefixTree` + 嵌套 `RouteRecordRaw`）
- **相关代码**: `packages/vue/src/scan-pages.ts`、`packages/vue/src/virtual-pages.ts`、`packages/client/src/app.ts`（`UbeanLayoutView` / `createLayoutWrapper`）、`packages/vue/src/components.ts`（`LayoutChainRenderer` / `LAYOUT_CHAIN_KEY`）
## 背景

文件式路由有两条已实现的路线，分叉在「扫描产物是什么形状」：

| | ubean | vue-router unplugin |
| --- | --- | --- |
| 中间表示 | `ScannedPage[]`（**扁平数组**，每条自带完整路径） | `PrefixTree`（前缀树，父子即嵌套 `RouteRecordRaw`） |
| 布局 | 路由 `meta.layout` 上的**名字数组**，运行时链式渲染 | 真实的父子路由记录，`<RouterView>` 逐层嵌套 |
| 路径归属 | 扫描器算完整路径写进 `page.path` | 树节点各持一段，拼接得出 |
| 类型生成 | 扫描结果直接渲染 `typed-router.d.ts` | 遍历树生成 `RouteNamedMap` |

两条路线的产物对使用者是同一件事（URL → 页面组件 + 布局），但**实现的所有权划分完全不同**。本 ADR 记录选择扁平表的原因，以及它买来的东西和付出的代价。

## 决定

**扫描产物保持扁平数组，布局用 `meta.layout` 名字链表达；不引入嵌套路由记录。**

具体形态：

1. **`ScannedPage[]` 是唯一中间表示**（`packages/vue/src/types.ts:77`）。每个页面自带 `path` / `route` / `name` / `layout` / `matchers` / `slot`，彼此独立。`virtual-pages.ts` 把数组直接映射成 `RouteRecordRaw[]`，`children` 只用于并行路由的 named views（`components: { default, slotName }`），不用于布局。
2. **布局链在路由 meta 上**：`definePage({ layout: ['default', 'admin', 'dashboard'] })`（外 → 内）。`UbeanLayoutView`（`packages/client/src/app.ts:193`）读 `route.meta.layout`，`createLayoutWrapper` 的 `loadLayoutsForRoute()` 用 `Promise.all` 并发预加载整条链，`LayoutChainRenderer`（`packages/vue/src/components.ts:89`）递归渲染。
3. **`preloadLayouts()` 是显式契约**：布局组件异步加载，而 `renderToString` / 水合首帧不等微任务 —— SSR 在 `router.isReady()` 后、客户端在 `mount()` 前必须 await 它，布局才会进初始输出。这是扁平表 + 名字链的**直接代价**，写在 `UbeanAppInstance` 的接口注释里。
4. **并行路由的 `@slotName/` 用 named views**（不是嵌套路由）：同一路径下的多个页面进 `components` 映射，布局里用 `<SlotView name="slotName" />` 取。这是扁平表下唯一需要的「同路径多组件」机制。
5. **不提供 `children` 式的嵌套页面目录**：`src/pages/admin/users.vue` 是 `/admin/users` 一条记录，`src/pages/admin.vue`（若存在）是 `/admin` 另一条记录，两者没有父子关系。需要视觉嵌套时用 layout 链。

## 理由

**1. 扫描器是唯一真理源，路径不分散在树节点上。** 扁平数组里每个元素都是完整、自洽的：`page.path` 就是最终 URL。前缀树把路径拆到各节点，任何一处拼接规则变化（route group 剥离、`[param=matcher]`、i18n locale 前缀、reuse 别名）都要在树的构建与遍历两侧同时改对。`filePathToRoute()`（`packages/vue/src/route-path.ts:102`）是纯函数，输入文件路径、输出 `ParsedRoutePath`，可以单独测 —— 现在 `packages/vue/test/` 里针对它的用例就是这么写的。

**2. 布局的语义是「包裹」而不是「嵌套路由」。** vue-router 的嵌套路由同时承担两件事：URL 前缀继承 + 组件包裹。ubean 只要后者 —— 因为**前者已经由目录结构表达完了**。`meta.layout` 允许一个页面挂到与它 URL 无关的布局上（`/users` 用 `admin` 布局，`/admin/*` 也用 `admin` 布局），这在嵌套路由里要么重复声明父子关系，要么引入一棵与实际 URL 无关的伪树。layout 名字链是这种「横切」关系的自然表达。

**3. 路由中间件、matcher 校验、route rules 都是按路径匹配的。** `packages/routes/src/router.ts` 的注册顺序、`sortApiRoutesForRegistration` / `apiPathSpecificity`、`compileRouteRules()` 的 glob 匹配、`createMatcherGuard()` 的 `route.meta.matchers` —— 全部消费「一条记录 = 一个路径」。扁平表让这些逻辑拿到的就是最终路径，不需要先把树展开。ADR-0011 的 ssg 直接渲染路径更是直接建立在扁平表上：`matchRoutePattern(pages, path)` 在数组上做特异性排序匹配。

**4. `typed-router.d.ts` 的生成是纯映射。** `renderParamsType()` / `extractRouteParams()`（`packages/vue/src/route-params.ts`）拿一条 `page.path` 就能产出 `RouteRecordInfo` 的 `params` / `paramsRaw`。两个写入器（`generator.ts` 实体文件模式、`virtual-pages.ts` 虚拟模块模式）共用同一份实现 —— 扁平表让「同一路由两种生成模式必须产出一致类型」这件事变成复用同一函数，而不是两套树遍历。

**5. 与 ADR-0010 的刻意不做清单一致。** RSC 不做、拦截路由不做 —— 这两项恰恰是最依赖「树形结构 + 组件嵌套」的能力。既然不需要它们，树带来的表达力就用不上。

## 代价（明确承认）

1. **布局链的异步加载必须显式预加载。** `preloadLayouts()` 是调用方要记得用的 API。嵌套路由天然没有这个问题（父组件在渲染子组件前已解析）。缓解：SSR 与客户端入口（`packages/client/src/ssr.ts` / `app.ts`）已在框架内调用，用户不感知；只有自定义 SSR 集成才会碰到。
2. **`<RouterView>` 的层级语义不可用。** 用户不能在父页面里写 `<RouterView />` 来渲染子路由 —— 因为不存在子路由。需要这一能力时用并行路由的 `<SlotView name="..." />`。
3. **同一 URL 前缀下的页面之间无法共享路由记录级配置。** 嵌套路由里父记录的 `meta` 会被子记录继承；扁平表里每条记录独立，要共享就用 `routeRules` 按 glob 匹配（这本来也是更明确的写法）。
4. **与 vue-router 生态的默认心智不一致。** 从 Nuxt / vue-router unplugin 过来的用户会先找 `children`。文档需要在 `guide/pages-routing/overview` 明确说明 layout 链的语义。

## 已评估但否决的方案

**改用 `PrefixTree` + 嵌套 `RouteRecordRaw`。** 否决理由：

- 收益（`<RouterView>` 层级、父记录 meta 继承、无需 `preloadLayouts`）没有对应的需求 —— 全仓 `definePage` 调用点里没有依赖父级 meta 继承的用例。
- 代价是重写扫描器的输出契约（`ScannedPage` 是对外公开类型，见 `packages/vue/src/types.ts` 的注释），并让 ssg 直接渲染路径（ADR-0011）、route rules 匹配、matcher 守卫三处按路径消费的逻辑全部改为先展开树。
- 与 ADR-0010 的「刻意不做」清单方向相反。

**引入 `?definePage` 独立模块 + `_mergeRouteRecord`（vue-router 的实验能力）。** 否决理由见 ADR 记录时的实测：全仓 34 处 `definePage` 调用中**没有一处**使用非字面量值，而 `_mergeRouteRecord` 解决的是「同一路由记录在多个文件里声明后合并」。当前用 `definePage` 的 warn 兜底（`字段 \`x\` 无法在构建期静态求值`），不会静默降级。需求出现前不引入。

## 结果

- 未改动任何代码 —— 本 ADR 是对既有形态的记录。
- 唯一的行为变更（2026-10-20）：`definePage` 不可静态求值的字段 warn 现在带**文件路径 + 文件内行号**，原因文案由 AST 词汇改为中文（见 `packages/vue/src/extract-page.ts` 的 `ExtractContext`）。
