---
title: 内容与搜索
description: 基于 Markdown 目录的内容集合与静态站点内置全文搜索 —— 章节数据、useContentSearch 与可选的 Pagefind 索引。
---

# 内容与搜索

`@ubean/content` 将 `content/` 目录下的 Markdown 文件变成可查询的内容集合，并为静态站点提供内置全文搜索 —— 默认零搜索依赖。

## 启用内容模块

```ts
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  content: true // 或 { sources: { docs: { dir: 'content/docs' } } }
});
```

`content/`（默认）下的 Markdown 文件会被解析为文档：含 frontmatter、正文 AST，以及由文件路径推导的 `_path`：

```
content/
├── getting-started.md      → /getting-started
├── guide/
│   └── components.md       → /guide/components
└── zh/
    └── guide.md            → /zh/guide
```

frontmatter 标记 `draft: true`（或文件名含 `_draft`）与 `_partial` 文件会从导航和搜索中排除。

## 查询集合

使用查询构建器进行结构化访问：

```ts
import { queryCollection } from '@ubean/content';

const docs = await queryCollection('content')
  .where({ _draft: false })
  .order('_path', 'asc')
  .all();
```

内容路由会被预渲染自动发现 —— 用 catch-all 页面（`pages/[...slug].vue`）配合内容集合即可渲染它们。

## 全文搜索

搜索在 `ssg` 模式下开箱即用（其他模式可显式开启）。文档按标题层级切分为**章节** —— 每个章节携带标题、父级标题链、锚点 `id`（如 `/guide/components#button`）与纯文本内容。代码块被剔除；draft/partial 文档被过滤。

构建产出两份产物：

| 产物 | 位置 | 用途 |
| --- | --- | --- |
| `__search.json` | `dist/public/__search.json` | `useContentSearch()` 的章节数据源 |
| Pagefind 索引 | `dist/public/pagefind/` | 分片索引，安装可选依赖 `pagefind` 后生成 |

dev server 同样提供 `/__search.json`（与 SSG 产物同构），搜索在开发与生产行为一致。

### `useContentSearch()`

组合式函数（来自 `@ubean/content/vue`）在客户端拉取数据并执行搜索：

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { useContentSearch } from '@ubean/content/vue';

const query = ref('');
const { status, results, search } = useContentSearch();

async function onSubmit() {
  await search(query.value);
}
</script>

<template>
  <form @submit.prevent="onSubmit">
    <input v-model="query" type="search" aria-label="Search docs" />
  </form>

  <p>status: {{ status }}</p>
  <ul v-if="results.length">
    <li v-for="hit in results" :key="hit.id">
      <a :href="hit.id">
        <span v-for="t in hit.titles" :key="t">{{ t }} ›</span>
        {{ hit.title }}
      </a>
      <p>{{ hit.content.slice(0, 120) }}</p>
    </li>
  </ul>
</template>
```

选项：

| 选项 | 默认值 | 说明 |
| --- | --- | --- |
| `sections` | — | 直接传入 sections（跳过 fetch）；接受数组或异步工厂 |
| `sectionsUrl` | `/__search.json` | 数据 URL |
| `collections` | 全部 | 限定搜索的 collection（`'docs'` 或 `['docs', 'blog']`） |
| `immediate` | `true` | 立即初始化引擎；`false` 延迟到首次 `search()` |
| `searchOptions` | — | 引擎权重 / MiniSearch 选项 |

每条结果为 `SearchHit`：`{ id, title, titles, level, content, score }` —— `titles` 是父级标题链（渲染面包屑），`id` 直接可用作锚点链接。

### 搜索引擎

无需任何搜索依赖：

- **内置 fallback 引擎** —— 精确/前缀匹配，标题命中权重高于正文。始终可用，零负载。
- **MiniSearch**（可选）—— 模糊与前缀匹配。在应用中安装 `minisearch` 即自动升级引擎；两个引擎共享分词器。

CJK 文本（中日韩）使用 `Intl.Segmenter` 分词，环境不支持时降级为 unigram+bigram —— 搜索 `安装` 或 `组件` 无需额外配置。

### Pagefind（可选）

大型站点（数千页）可安装 Pagefind 获得按查询词按需加载的分片索引：

```bash
pnpm add -D pagefind
```

重新构建 —— 生成 `dist/public/pagefind/`（语言感知，如 `en` + `zh-cn` 双索引）。未安装依赖时构建日志提示并优雅跳过；`__search.json` 不受影响。

### 服务端章节查询

构建自定义搜索数据（如 SSR 渲染结果页）时直接查询章节：

```ts
import { queryCollectionSearchSections } from '@ubean/content';

const sections = await queryCollectionSearchSections('content');
// → SearchSection[]: { id, title, titles, level, content }
```

### 配置

```ts
export default defineConfig({
  content: {
    search: {
      provider: 'pagefind', // 默认；false 关闭
      sections: true,       // 输出 __search.json（默认 true）
      pagefind: { verbose: true } // 透传给 Pagefind createIndex() 的选项
    }
  }
});
```

`ssg` 模式默认开启搜索；其他模式设置 `provider: 'pagefind'` 显式开启。`search: false` 同时关闭两份产物。

## 示例

参见 [`examples/ssg-catchall`](https://github.com/soybeanjs/ubean/tree/main/examples/ssg-catchall)：多语言内容（en/zh）、draft 过滤用例，以及使用 `useContentSearch()` 的 `/search` 页面 —— 已通过 SSG 构建、preview 服务器与浏览器交互端到端验证。
