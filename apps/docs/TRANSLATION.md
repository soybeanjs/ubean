# 文档翻译规范（zh-CN）

`src/content/en/**` 是**唯一事实源**。`src/content/zh/**` 必须与英文结构逐节对应：同一批文件、
同一节顺序、同一批代码块。翻译是**改写而非直译**——以中文技术文档的自然语序表达同一语义。

## 1. 链接：一律用 `<Link>`，不手写语言前缀

这是本仓库与参考站（soybean-ui）的关键差异，**不要照抄它的做法**——它靠人工写 `/zh` 前缀，
已有 44 处漏写。这里由框架自动处理。

markdown 里写站内链接统一用 `<Link to="/path">`：

```md
- <Link to="/guide/quickstart">快速开始</Link>
- <Link to="/architecture/runtime#4.13-cli">运行时 §4.13</Link>
```

理由与约束：

- `Link` 由 `@ubean/vue` 全局注册（`packages/vue/src/components.ts:505`），markdown 编译成 Vue
  SFC 后可直接使用，**不需要 import**（`@mdit-vue/plugin-component` 生效）。
- 它经 `LOCALIZE_PATH_KEY` 注入的 `localizePath` 自动加前缀
  （`packages/client/src/app.ts:254` → `packages/i18n/src/paths.ts:67`）：
  `prefix_except_default` 下 en 产出 `/guide/x`、zh 产出 `/zh/guide/x`。
- **幂等**：`localizePath` 先剥离已有前缀再按当前 locale 重组，所以写 `/zh/x` 或 `/x` 结果相同。
  仍应统一写**无前缀**形式，让前缀由框架决定。
- 外链、锚点（`#...`）、`mailto:`/`tel:` 不用 `Link`，保持 `[text](url)`；`Link` 会自动为外链
  加 `target="_blank" rel="noopener noreferrer"`，所以外链也可交给它。

**反例**（会跳到英文页，因为原生 `<a>` 不本地化）：

```md
- [快速开始](/guide/quickstart)      <!-- zh 页里点它 → 英文页 -->
- [快速开始](/zh/guide/quickstart)   <!-- 能跳对，但硬编码前缀 -->
```

**禁止**相对 `.md` 链接（`[x](../architecture/runtime.md)`）指向内容树外的文件——构建产物里必然
404。跨仓库引用改为文字描述 + 外链，或指向站内已有页面。

## 2. 术语表

原则：**产品名 / 包名 / API 标识符 / 文件路径一律保留原文**（`ubean`、`definePage`、`v-client`、
`routeRules`、`.server.vue`、`src/pages/`）；**概念性词汇译中文**；**Vue 生态惯用词保留英文**。

### 保留英文（不译）

| 类别 | 词 |
| --- | --- |
| 框架 / 运行时 | `Vite` `Vue` `Hono` `Nitro` `void` `Inertia` `Pinia` `Cloudflare` `Vercel` `Netlify` `Bun` `Deno` `Node.js` |
| 缩写 | `SSR` `SSG` `SPA` `CSR` `ISR` `PPR` `CSP` `CSRF` `SSE` `WS` `API` `SEO` `DOM` `HTML` `CSS` `JSON` `TTL` `SWR` |
| 包 / 模块 | `@ubean/*` `ubean/client` `ubean/server` `ubean/build` `vue-router` `vue-i18n` `shiki` `MiniSearch` `unstorage` |
| API 名 | `definePage` `defineHandler` `defineApp` `defineAction` `defineServer` `useData` `useFetch` `useAsyncData` `useDatabase` `useCacheStore` `useContentSearch` `setLocale` `Link` `PageView` |
| 指令 / 装饰 | `v-client.load` `v-client.idle` `v-client.visible` `v-client.media` `v-client.only` `v-if` `v-for` |
| 配置键 | `routeRules` `prerender` `srcDir` `autoImports` `components` `content` `sources` `prefix` `cache` `isr` `ppr` |
| 文件约定 | `src/pages/` `src/routes/` `src/layouts/` `src/middleware/` `src/crons/` `404.vue` `loading.vue` `error.vue` `app.vue` `.server.vue` `.client.vue` |
| Vue 惯用 | `props` `slot` `ref` `emit` `composable` `setup` `provide`/`inject` `KeepAlive` `Suspense` `hook` `loader`（见下） |
| 其他 | `DevTools` `OpenAPI` `Scalar` `TypeScript` `Markdown` `Monorepo` `CI` `PR` |

### 译中文（固定译法，不得漂移）

| 英文 | 中文 | 备注 |
| --- | --- | --- |
| islands / Islands Architecture | **群岛架构**；正文提架构名可写 `islands` | 首次出现写「群岛（islands）」 |
| partial hydration | 部分水合 | |
| hydration / hydrate | 水合 | |
| prerender / prerendering | 预渲染 | |
| route rules | 路由规则 | 配置键仍写 `routeRules` |
| middleware | 中间件 | |
| cron / scheduled task | 定时任务 | |
| server / client | 服务端 / 客户端 | 作定语时不加「的」 |
| meta-framework | 元框架 | |
| platform preset | 平台预设 | |
| aggregator | 聚合器 | |
| subpath export | 子路径导出 | |
| dynamic route | 动态路由 | |
| intercepting route | 拦截路由 | 刻意不做，见 ADR-0010 |
| parallel routes | 并行路由 | |
| layout | 布局 | |
| directive | 指令 | |
| macro | 宏 | `definePage` 是编译时宏 |
| cache | 缓存 | |
| queue | 队列 | |
| environment variable | 环境变量 | |
| scaffolding | 脚手架 | |
| code highlighting | 代码高亮 | |
| streaming | 流式（SSR） | |
| error boundary | 错误边界 | |
| data layer | 数据层 | |
| virtual module | 虚拟模块 | |
| portable | 可移植 | |
| deployment | 部署 | |
| build / artifact | 构建 / 产物 | |
| type-safe | 类型安全 | |
| extension package | 扩展包 | |
| contract | 契约 | |
| drift | 漂移 | |
| baseline | 基线 | |
| bundle size | 体积 | |
| progressive enhancement | 渐进增强 | |
| fallback | 回退 / 降级 | 数据回退用「回退」，能力缺失用「降级」 |
| graceful degradation | 优雅降级 | |
| tree-shaking | 摇树优化 | 保留 `tree-shakeable` 英文亦可 |
| inline | 内联 | |
| shorthand | 简写 | |
| accessible / a11y | 无障碍 | |

### 双写法（首次全称，之后简写）

| 首次 | 之后 |
| --- | --- |
| 数据加载器（loader） | loader |
| 服务端 action（Server Action） | action |
| 群岛（islands） | islands |
| 局部预渲染（PPR） | PPR |

> `loader` 与 `action` 作为概念在中文句子里保持英文更易读（参考站同做法：`props`/`slot`/`ref`
> 保留英文）。但**标题**用中文更自然：`## 数据加载器`。

## 3. 代码块

代码**不翻译**，但**注释译成中文**——这是本仓库的既定约定（参考站 20 个文件 79 行中文注释）：

```ts
// app.ts — 编程式等价物（显式配置优先于文件自动检测）
export default defineApp({
  // 注册 Vue 插件（可附带 options 数组或 { plugin, mode } 配置）
  plugins: [createPinia()]
});
```

- 标识符、字符串字面量、路径、URL 一律保持原样。
- 面向用户的字符串（示例站点文案）可译，但**保持前后代码块一致**。
- 代码块围栏语言标注（```ts / ```bash / ```vue）与英文一致。

## 4. 反向约束：英文文件不得含中文

`src/content/en/**` 的正文与代码注释必须是纯英文。现存 303 行中文代码注释是历史遗留
（见 `architecture/runtime.md` 的 DevTools/CLI 示例），清理时同步改英文。

## 5. frontmatter

保持扁平结构（**不是**参考站的 `head: { title, description }`）：

```yaml
---
title: 数据加载器
description: 了解 ubean 页面路由中 loader 的使用方式。
---
```

理由：`@ubean/content` 的 `core.ts:480-495` 读的是**扁平** `title`/`description`
（`extraMeta.title || pathToTitle(filePath)`），改成嵌套会让搜索标题退化成文件名。

**译完后必须删除 `status: translated-stub`** ——该字段是渲染层的降级信号
（`doc-md.vue` 的 `isTranslationStub()`），留着会让页面继续显示英文。

## 6. 自检清单

每篇译完后逐条核对：

- [ ] 删除 `status: translated-stub`
- [ ] `title`/`description` 已译，保持扁平
- [ ] 站内链接全部是 `<Link to="/x">`，无裸 markdown 链接、无 `/zh` 硬编码前缀
- [ ] 无相对 `.md` 链接
- [ ] 代码块数量、语言标注与英文一致
- [ ] 代码注释已译中文，标识符未动
- [ ] 术语与本文第 2 节一致（grep 抽查 `loader`/`islands`/`水合`）
- [ ] 标题层级与英文一一对应
