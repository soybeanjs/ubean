---
name: Guide
head:
  title: 指南 - @ubean/vue SPA
  meta:
    - name: description
      content: markdown 页面演示
---

# 指南(markdown 页面)

`markdown: true` 开启后,`pages/**/*.md` 由 `@ubean/markdown`(按需加载)编译为 Vue 组件。

## frontmatter → 页面元数据

- `name: Guide` → 路由名
- `head.title` → `route.meta.head.title`(插件 `head: true` 提取)

## 支持的语法

- 列表、**加粗**、`行内代码`
- [内部链接](/about) 与外部链接
- 表格:

| 特性 | 状态 |
| --- | --- |
| md + mdx | `markdown: true` |
| 仅 md | `markdown: 'md'` |

> frontmatter 之外的正文就是页面内容。
