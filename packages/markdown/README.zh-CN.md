# @ubean/markdown

**[English](./README.md) | 中文**

ubean 的 Markdown 解析 —— frontmatter、标题、摘要、Markdown → HTML，外加可选的 MDX 编译。

一个很小的 leaf 解析器：只有一个运行时依赖（`markdown-exit`），不依赖任何 `@ubean/*` 包，也不感知文件系统与框架。它接收字符串，返回数据。

```ts
import { parseMarkdown } from '@ubean/markdown';

const { frontmatter, content, excerpt, headings, html } = parseMarkdown(source);
```

## 目录

- [包定位](#包定位)
- [安装](#安装)
- [快速开始](#快速开始)
- [Frontmatter](#frontmatter)
- [Markdown → HTML](#markdown--html)
- [标题与摘要](#标题与摘要)
- [MDX](#mdx)
- [MDX Vite 插件与 JSX 运行时](#mdx-vite-插件与-jsx-运行时)
- [类型安全](#类型安全)
- [架构说明](#架构说明)

## 包定位

| 本包负责                                                                                                                  | 本包不负责 —— 对应归属                                                       |
| ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 解析 Markdown **字符串**：`parseFrontmatter`、`parseMarkdown`、`markdownToHtml`、`extractHeadings`、`extractExcerpt`      | 读取磁盘文件、监听目录、聚合内容集合 → `@ubean/content`                      |
| 面向 frontmatter 的极简、缩进感知 **YAML 子集解析器**（嵌套 map、块序列、点号键、引号字符串、内联数组、布尔、null、数字） | 完整 YAML 支持（锚点、多行字符串 `\|`/`>`、flow map `{}`）→ ubean 完全不提供 |
| 可选的 **MDX → Vue 组件**编译（`compileMdx`）与 Vite transform 插件（`ubeanMdxPlugin`）                                   | Vue SFC 编译与 Vite 插件管线本身 → `@ubean/builder`                          |
| Vue **JSX 运行时**（来自 `/jsx-runtime` 的 `jsx`、`jsxs`、`Fragment`），让 MDX 输出能渲染为 Vue 组件                      | 通用 Vue JSX 支持 —— 请使用标准 Vue JSX 工具链                               |
| 页面路由宏路径使用的 `defineMarkdownPage(frontmatter)` 恒等辅助函数                                                       | 路由注册与页面扫描 → `@ubean/vue` / `@ubean/scan`                            |

**主入口的运行时依赖白名单：仅 `markdown-exit`** —— 不含 `vue`，不含 `@mdx-js/mdx`，不含 `node:*`。`/mdx` 与 `/jsx-runtime` 独立成子路径，正是为了让 Vue import 与 MDX 编译器不进入主入口。

**可选 peer：**`@mdx-js/mdx`（`^3.0.0`，optional）与 `vue`（`^3.0.0`）。缺少 `@mdx-js/mdx` 时 `compileMdx()` 不会失败 —— 它回退为用 `markdownToHtml()` 渲染正文，输出一个通过 `innerHTML` 渲染 HTML 的普通 Vue 组件，并且结果中的 `compiled` 为 `false`。`isMdxAvailable()` 会告诉你当前处于哪种模式。

## 安装

```bash
pnpm add @ubean/markdown

# 可选：带 JSX 支持的真实 MDX 编译
pnpm add -D @mdx-js/mdx
```

## 快速开始

```ts
import { parseMarkdown, markdownToHtml, parseFrontmatter, extractHeadings, extractExcerpt } from '@ubean/markdown';

const source = `---
title: Hello
date: 2026-08-01
---

# Hello

The body.
`;

parseFrontmatter(source);
// { data: { title: 'Hello', date: '2026-08-01' }, content: '\n# Hello\n\nThe body.\n' }

const parsed = parseMarkdown(source);
parsed.frontmatter.title; // 'Hello'
parsed.headings; // [{ level: 1, text: 'Hello', id: 'hello' }]
parsed.excerpt; // '\n# Hello…' —— 见「标题与摘要」
parsed.html; // '<h1 id="hello">Hello</h1>\n<p>The body.</p>'

markdownToHtml('# Hello'); // '<h1 id="hello">Hello</h1>'
```

## Frontmatter

`parseFrontmatter(source)` 切出开头的 `---` … `---` 块并返回 `{ data, content }`。没有该块时返回 `{ data: {}, content: source }` —— 输入原样传递。

```ts
import { parseFrontmatter } from '@ubean/markdown';

const { data } = parseFrontmatter(`---
title: Post
seo:
  description: About the post
tags:
  - a
  - b
draft: true
---`);
// { title: 'Post', seo: { description: 'About the post' }, tags: ['a', 'b'], draft: true }
```

`MarkdownFrontmatter` 记录了 `title` / `description` / `date` / `layout` / `path` / `seo` / `meta` / `head`，并允许任意额外键。内置解析器理解以下 YAML 子集：

- 按缩进嵌套的 map、块序列（`- item`，以及 `- key: value` map 项）
- 点号键（`a.b: v` 变成嵌套）、引号字符串、内联数组、`true`/`false`/`null`/`~`、数字
- 无子项的裸 `key:` 保留为 `true`

锚点、多行字符串（`|` / `>`）与 flow map（`{}`）**不**支持。

## Markdown → HTML

```ts
import { markdownToHtml } from '@ubean/markdown';

const html = markdownToHtml(source, {
  html: false, // 允许 Markdown 中的原始 HTML（默认 false）
  linkify: true, // 自动链接裸 URL（默认 true）
  breaks: false, // 单个换行转 <br>（默认 false）
  typographer: false, // 智能引号 / 破折号（默认 false）
  headingIds: true, // 为标题添加 slug 化的 `id`（默认 true）
  highlighter: (code, lang) => myHighlight(code, lang) // 自定义代码高亮器
});
```

`highlighter` 的返回值会被包进 `<pre><code class="language-{lang}">…</code></pre>`，除非它已经以 `<pre` 开头。标题 id 会被 slug 化 —— 转小写、剥离 HTML 标签、移除非 word 字符（保留 CJK 字符 `\u4e00-\u9fa5`）、空格折叠为 `-`。

## 标题与摘要

```ts
import { extractHeadings, extractExcerpt } from '@ubean/markdown';

extractHeadings('## A\n\n### B');
// [{ level: 2, text: 'A', id: 'a' }, { level: 3, text: 'B', id: 'b' }]

extractExcerpt('Intro paragraph.\n\n<!-- more -->\n\nRest.');
// 'Intro paragraph.'

extractExcerpt('# Title\n\n- list\n\nFirst real paragraph.');
// 'First real paragraph.'
```

`extractExcerpt(markdown, separator = '<!-- more -->')` 在存在分隔符时返回分隔符之前的全部内容。否则它按顺序遍历段落，返回第一个既不是标题、围栏代码块、引用块、列表项、有序列表项，且长度小于 500 字符的段落；都不符合时返回 `undefined`。

## MDX

`/mdx` 把 MDX（Markdown + JSX）编译为 Vue 组件模块。可选 peer `@mdx-js/mdx` 就在这里被使用。

```ts
import { compileMdx, isMdxAvailable, isMdxAvailableSync } from '@ubean/markdown/mdx';

await isMdxAvailable(); // 未安装 @mdx-js/mdx 时为 false

const { code, frontmatter, compiled } = await compileMdx(source, {
  filePath: 'post.mdx',
  remarkPlugins: [remarkGfm],
  rehypePlugins: [rehypeHighlight],
  development: false
});
// compiled: true  → 真实的 MDX 输出，import 自 `@ubean/markdown/jsx-runtime`
// compiled: false → 渲染 `innerHTML` 的纯 Markdown 回退组件
```

- `compileMdx()` 先抽取 frontmatter，再用 `format: 'mdx'` 与 `jsxImportSource: '@ubean/markdown'` 编译正文，因此生成的模块 import 的是本包自己的 JSX 运行时。
- `isMdxAvailable()` 动态探测 peer 并缓存结果；`isMdxAvailableSync()` 不 import 任何东西，只返回缓存答案（在第一次异步检查之前为 `false`）。
- 两种模式下都会返回 `frontmatter`，因此调用方读元数据时无需按 `compiled` 分支。

## MDX Vite 插件与 JSX 运行时

`ubeanMdxPlugin(options)` 是在模块管线中编译 `.mdx` 文件的 Vite transform（框架在启用 `markdown.mdx` 时调用）。它从主入口导出 —— `@ubean/markdown` 没有 `./vite` 子路径。

```ts
import { ubeanMdxPlugin } from '@ubean/markdown';

ubeanMdxPlugin({
  include: /\.mdx$/, // 默认 /\.mdx$/
  exclude: /node_modules/,
  remarkPlugins: [],
  rehypePlugins: []
});
```

`MdxVitePluginOptions`：`remarkPlugins`、`rehypePlugins`、`include`、`exclude`。插件强制 `pre`，通过 `compileMdx()` 编译，产出恒等 source map，并对 `.mdx` 变更强制整页刷新而不尝试 HMR。编译错误通过 Vite 的 `this.error` 连同文件 id 抛出。

## 类型安全

- 所有解析器签名都完整类型化：`parseMarkdown(source, options?)` 返回 `ParsedMarkdown`（`frontmatter` / `content` / `excerpt?` / `headings` / `html?`），`markdownToHtml` 返回 `string`。
- `MarkdownFrontmatter` 带索引签名（`[key: string]: unknown`），自定义 frontmatter 键仍可访问，但被显式标为 `unknown` —— 使用前先收窄。
- `MarkdownOptions` / `MdxOptions` / `MdxCompileResult` / `MdxVitePluginOptions` 均为导出类型，options 对象在调用点受检。
- 不做全局类型增强，也不暴露模块级可变状态 —— MDX 编译器缓存是内部实现。

## 架构说明

- **纯字符串输入，数据输出。** 主入口里没有任何东西触碰文件系统、Vite server 或 Vue。这正是它既能用于构建脚本、SSR renderer，也能用于内容管线的原因。
- **`markdown-exit` 是唯一引擎。** 标题通过遍历第二个 `markdown-exit` 实例的 token 树提取；摘要提取基于正则与段落切分，不依赖解析器。
- **MDX peer 只动态 import 一次并缓存。** `getMdxCompiler()` 会记忆编译器或 `null`，因此每个进程只跑一次 `import('@mdx-js/mdx')`。
- **回退是一条真实路径，不是错误。** 没有 `@mdx-js/mdx` 时 MDX 文件仍会渲染（作为 Markdown + `innerHTML` 包裹），`compiled` 告诉调用方走的是哪条路。
- **`defineMarkdownPage(frontmatter)` 是恒等函数。** 它为页面路由宏路径而存在，自身不做任何解析。
