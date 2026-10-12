# @ubean/content

**[English](./README.md) | 中文**

ubean 的基于文件的内容集合 —— 磁盘上的 Markdown / MDX / YAML / JSON 变成可查询的内存表，并附带导航、章节级全文搜索、请求时实时集合与预渲染路由发现。

```ts
import { queryCollection } from '@ubean/content';

const posts = await queryCollection('blog').where({ _draft: false }).sort('date', 'desc').limit(10).find();
// → ContentDocument[]：含 frontmatter 字段、正文 AST，以及由文件路径推导的 `_path`
```

## 目录

- [包定位](#包定位)
- [安装](#安装)
- [快速开始](#快速开始)
- [集合与查询构建器](#集合与查询构建器)
- [导航](#导航)
- [全文搜索](#全文搜索)
- [实时集合](#实时集合)
- [预渲染路由发现](#预渲染路由发现)
- [构建时与运行时](#构建时与运行时)
- [类型安全](#类型安全)
- [架构说明](#架构说明)

## 包定位

`@ubean/content` 拥有**内容流水线：扫描 → 解析 → 查询 → 搜索**，但不负责页面如何渲染：

| 层                       | 职责                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `@ubean/content`（本包） | 源文件扫描、frontmatter + 正文解析、内存集合表、查询构建器、导航树、章节搜索 + `__search.json`、实时集合、内容 → 路由发现 |
| `@ubean/markdown`        | 面向页面的 Markdown 转 HTML；内容包复用它解析 frontmatter，并保留自己的 AST / 定义层                                      |
| `@ubean/build`           | 消费 `discoverContentPageRoutes` 的输出做预渲染，并把 Vite 插件接入 dev / 生产构建                                        |
| `@ubean/client`          | 提供 `useContentSearch` 组合式函数所运行的应用运行时                                                                      |
| `@ubean/seo`             | sitemap / robots / metadata；内容 URL 可以作为输入喂入，但不在这里生成                                                    |

**包含：**

- `defineCollection` —— 声明一个集合（`{ name, source, type?, schema? }`）；`defineContentCollection` / `createContentCollection` 是更底层的 core 等价物
- `queryCollection(name)`（以及 `queryContent` 别名）→ `ContentQueryBuilder`，含 `where` / `sort` / `limit` / `skip` / `only` / `without` / `find` / `findOne` / `findSurround` / `count`
- `getContentItem`、`getCollection`、`listCollections`、`registerContent`、`configureContentRuntime`
- 导航：`fetchContentNavigation`、`buildNavigation`
- 搜索：`generateSearchSections`、`generateSearchSectionsSnapshot`、`createSectionSearch`、`searchSections`、`resolveContentSearchConfig`、`runPagefindIndex`，以及 `queryCollectionSearchSections` 与 `useContentSearch` 组合式函数（`@ubean/content/vue`）
- 实时集合：`defineLiveCollection`、`getLiveCollection`、`listLiveCollections`、`clearLiveCollections`
- 预渲染发现：`discoverContentPageRoutes`、`extractContentPageRoutes`
- 扫描 / 引导：`scanContentSources`、`bootstrapContentFromDisk`、`parseContentFile`、`parseFrontmatter`、`parseMarkdown`、`parseContent`
- `@ubean/content/vite` 处的 Vite 插件：`ubeanContentPlugin`（+ `createContentChangeFilter`）

**不包含**（由邻近包负责）：

- 页面渲染、路由与布局（`@ubean/vue` 的页面路由 + 你自己的 catch-all 页面）
- 用于页面 HTML 的具体 Markdown 渲染器（`@ubean/markdown`）
- 搜索 UI 的 CSS / 组件 —— 本包提供数据与组合式函数，不提供组件
- 搜索索引服务：MiniSearch / Pagefind 运行在应用侧或构建时

**运行时依赖白名单（主入口）：`@ubean/shared`、`defu`、`pathe`、`scule`。** 不含 `vite`、不含 `vue`、不含 `node:fs` —— 插件与组合式函数分别在 `./vite` 与 `./vue` 之后。

**optional peer：** `pagefind` —— 未安装时跳过 Pagefind 索引构建并给出构建期提示（`__search.json` 章节搜索仍然可用）；`vite` —— 仅 `@ubean/content/vite` 插件需要；`vue` —— 仅 `@ubean/content/vue` 需要。

## 安装

```bash
pnpm add @ubean/content
# optional peers (loaded lazily, only when enabled):
pnpm add -D pagefind # 构建时 Pagefind 索引（跳过则回退到章节搜索）
```

## 快速开始

**1. 启用模块**（`ubean.config.ts`）：

```ts
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  content: {
    sources: {
      blog: { dir: 'content/blog', prefix: '/blog' }
    }
  }
});
```

**2. 把文件放到磁盘上。** 路径映射为 `_path`，frontmatter 成为文档字段：

```md
---
title: Hello
date: 2026-01-01
draft: false
---

# Hello

Body content.
```

**3. 通过 catch-all 页面读取路由**，并在任意位置查询集合：

```vue
<!-- src/pages/blog/[...slug].vue -->
<script setup lang="ts">
import { queryCollection } from '@ubean/content';

const route = useRoute();
const doc = await queryCollection('blog').where({ _path: route.path }).findOne();
</script>

<template>
  <article>
    <h1>{{ doc?.title }}</h1>
  </article>
</template>
```

可运行示例：[`examples/ubean-test/src/pages/blog/[...slug].vue`](../../examples/ubean-test/src/pages/blog/[...slug].vue)，其集合配置在 [`examples/ubean-test/ubean.config.ts`](../../examples/ubean-test/ubean.config.ts)。

## 集合与查询构建器

`defineCollection` 把集合注册到运行时；`getCollection` / `listCollections` 用于查看注册表。`queryCollection(name)` 是 `async` 的，因为它要先 await `collection.list()` 才能开始链式调用：

```ts
import {
  defineCollection,
  fetchContentNavigation,
  getCollection,
  getContentItem,
  queryCollection
} from '@ubean/content';

defineCollection({ name: 'blog', source: 'content/blog', type: 'page' });

const { name, source } = getCollection('blog')!;

const posts = await queryCollection('blog')
  .where('date', '>=', '2026-01-01')
  .sort('date', 'desc')
  .only(['title', 'date', '_path'])
  .find();

const one = await queryCollection('blog').where({ _path: '/blog/hello' }).findOne();

const [prev, next] = await queryCollection('blog').findSurround('/blog/hello', { before: 1, after: 1 });

const count = await queryCollection('blog').where({ _draft: false }).count();
```

构建器接口：`where(field, operator, value)` 或 `where({ field: value })`、`sort(field, 'asc' | 'desc')`、`limit(n)`、`skip(n)`、`only(fields)`、`without(fields)`，最后是终结方法 `find()` / `findOne()` / `findSurround(path, { before, after })` / `count()`。支持的运算符：`=` / `==` / `!=` / `>` / `>=` / `<` / `<=` / `contains` / `in` / `exists`。

`getContentItem(collection, path)` 是直接的单文档查询，集合或路径不存在时返回 `null`；`queryCollection` 在集合未注册时抛错。

## 导航

`fetchContentNavigation` 从文档构建层级树，并对「全部集合」的结果做记忆化：

```ts
import { fetchContentNavigation } from '@ubean/content';

const nav = await fetchContentNavigation('blog'); // ContentNavigationItem[]
const everything = await fetchContentNavigation(); // 全部集合，带缓存
```

草稿与片段文档（`draft: true`，或文件名中含 `_draft` / `_partial` 段）会从树中排除。

## 全文搜索

搜索是**章节级**的：每个文档按标题层级切分为章节，携带标题、父级标题链、锚点 `id`（如 `/guide/components#button`）与纯文本内容。代码块被剔除。

```ts
import { generateSearchSections, queryCollectionSearchSections } from '@ubean/content';

const sections = await queryCollectionSearchSections('blog');
// → SearchSection[] { id, title, titles, level, content }
```

Vite 插件写出 `dist/public/__search.json`（`Record<collectionName, SearchSection[]>`），并在安装了 `pagefind` 时额外构建 `dist/public/pagefind/`。dev 下同一份 payload 由 `/__search.json` 提供，因此两种模式的搜索行为一致。

客户端使用 `@ubean/content/vue` 的组合式函数：

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { useContentSearch } from '@ubean/content/vue';

const query = ref('');
const { status, results, search } = useContentSearch({
  searchOptions: { loadMiniSearch: () => import('minisearch') }
});
</script>
```

- 数据源优先级：`options.sections`（SSR 直传）→ `fetch(options.sectionsUrl ?? '/__search.json')`。
- 返回结构：`{ status: 'idle' | 'loading' | 'ready' | 'error', error, results, init(), search(query, options?) }`。
- **`loadMiniSearch` 必须是你自己源码里的字面量动态 import。** 包内默认加载器是带 `@vite-ignore` 的 `import(变量)`，只在 Node 下能解析；浏览器中会抛 `Failed to resolve module specifier "minisearch"` 并静默降级到 fallback 引擎。传入 `() => import('minisearch')`，Vite 才能解析并预打包。
- `searchOptions` 默认 `{ prefix: true, fuzzy: 0.2 }`；当前引擎以 `'minisearch'` 或 `'fallback'` 上报。

自定义流水线可用引擎级入口 `createSectionSearch(sections, options)` 与 `searchSections(...)`；`generateSearchSectionsSnapshot(snapshot, options)` 在构建时把 `Record<string, ContentDocument[]>` 快照映射成同样的 payload 形状。

## 实时集合

实时集合在**请求时**从 CMS、API 或数据库取数，而不是构建时从磁盘读取：

```ts
import { defineLiveCollection, getLiveCollection, queryCollection } from '@ubean/content';

defineLiveCollection({
  name: 'products',
  cache: { ttl: 60 },
  loader: async ({ path, filter }) => {
    const res = await fetch(`https://api.example.com/products`);
    return res.json();
  }
});

const entries = await getLiveCollection('products');
const cheap = await queryCollection('products').where('price', '<', 20).find();
```

- loader 签名：`(params: { path?, filter? }) => Promise<LiveCollectionEntry[]>`；条目至少需要 `_id` 与 `_path`。
- 可选 `cache: { ttl }` 把结果在内存里保留指定秒数；可选 `schema` 校验条目。
- 已注册的实时集合通过 `queryCollection` 支持完整的查询构建器（`where` / `sort` / `limit` / `skip` / `only` / `without`）。
- `listLiveCollections()` 与 `clearLiveCollections()` 用于查看 / 重置注册表。

## 预渲染路由发现

内容 URL 从源目录被发现，因此预渲染器无需链接图即可爬取：

```ts
import { discoverContentPageRoutes, extractContentPageRoutes } from '@ubean/content';

const routes = await discoverContentPageRoutes('content/blog', { prefix: '/blog' });
// → string[] URL，可直接用于 prerender.include
```

`extractContentPageRoutes(docs, options)` 是对已解析文档的纯映射步骤；`discoverContentPageRoutes(rootDir, options)` 扫描目录后映射结果。两者都会丢弃草稿 / 片段文档并应用 `options.prefix`；`options.includeDrafts` 可重新纳入。把输出与 catch-all 页面配对，并送入预渲染 include 列表 —— SSG 走查见 [`examples/ssg-catchall`](../../examples/ssg-catchall)。

## 构建时与运行时

同一张表同时服务 dev、预渲染与生产 SSR，但数据来源不同：

| 环境        | 谁填充集合表                                                                          |
| ----------- | ------------------------------------------------------------------------------------- |
| Dev         | `ubeanContentPlugin` 在启动时与变更时扫描（`scanContentSources` → `registerContent`） |
| 测试 / 脚本 | `bootstrapContentFromDisk(rootDir, options)` 从磁盘填充表                             |
| 生产 SSR    | 服务端入口内联扫描所得集合快照 —— **运行时不依赖 Vite 插件**                          |

`scanContentSources(rootDir, options)` 按可配置的 `sources` 映射返回 `Record<string, ContentDocument[]>`（默认目录 `content`，遍历 `.md` / `.mdx` / `.json` / `.yaml` / `.yml`）。`parseContentFile(raw, filePath, options?)` 是两条路径共用的单文件入口。

Vite 插件选项（`ubeanContentPlugin`，`UbeanContentOptions`）：`sources`、`defaultDir`、`ignores`（默认 `['draft', 'partial', '.']`）、`markdown`、`navigation`、`experimental`、`search`。它暴露 `virtual:ubean-content` 虚拟模块（外加每个集合一个模块），导出 `collections` 与 `getCollection(name)`。

## 类型安全

- `ContentDocument` 携带 `_` 前缀的计算字段（`_id`、`_path`、`_dir`、`_file`、`_type`、`_extension`、`_draft`、`_partial`、`_empty`）、常见 frontmatter 字段（`title`、`description`、`date`、`draft`、`partial`、`navigation`）、可选 `body: ContentBody`，以及用于自定义 frontmatter 的开放索引签名。
- `ContentCollection`、`ContentQueryBuilder`、`ContentNavigationItem`、`ContentSourceScanConfig`、`ContentSchema` / `ContentFieldSchema`、`ContentModuleOptions` 定义编写接口。
- 搜索类型：`SearchSection`、`SearchHit`、`SectionSearchEngine`、`SectionSearchOptions`、`GenerateSearchSectionsOptions`、`ContentSearchOptions`、`UseContentSearchOptions`、`UseContentSearchReturn`。
- 实时类型：`LiveCollection`、`LiveCollectionOptions`、`LiveCollectionEntry`、`LiveCollectionLoader`、`LiveCollectionLoaderParams`、`LiveCollectionCacheOptions`。
- 路由类型：`ContentPageRouteOptions`、`DiscoverContentPageRoutesOptions`、`ScanContentSourcesOptions`。
- `ContentType` 是解析出的文件类型联合（`'markdown' | 'mdx' | 'json' | 'yaml' | 'csv' | 'html'`），体现在 `_type` 上。
- 集合的 `schema` 在加载时逐文档校验，因此非法的 frontmatter 会让构建失败，而不是在页面渲染时才报错。

## 架构说明

- **内容文档是纯数据。** 查询、导航与搜索都只操作 `ContentDocument` 对象 —— 不需要框架实例，因此同一份代码可以跑在 Vite 插件、构建脚本与服务端运行时里。
- **引擎与索引解耦。** `createSectionSearch` 返回 `{ engine: 'minisearch' | 'fallback', search }`，fallback 始终可用，因此缺少 MiniSearch 不会让搜索挂掉 —— 只影响排序质量。
- **CJK 分词使用 `Intl.Segmenter`**，并带一元 + 二元回退，因此中日文无需外部分词器即可搜索。
- **草稿 / 片段过滤在每一层重复执行** —— 导航、搜索 payload 与路由发现各自丢弃它们，因此误发布的草稿无法只从其中一条路径泄漏。
- **预渲染发现是文档的纯函数**，因此 `ubean build` 与自定义脚本都能复用（SSG 路径如何消费这些路由，见 [`docs/adr/0011-lightweight-ssg-direct-render.md`](../../docs/adr/0011-lightweight-ssg-direct-render.md)）。
