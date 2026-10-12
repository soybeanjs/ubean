# @ubean/seo

**[English](./README.md) | 中文**

ubean 的 SEO 工具集 —— 元数据合并、head 管理、robots / sitemap / manifest 响应、文件约定、JSON-LD 与 OG 图生成。

`@ubean/seo` 拥有**服务端与同构的 SEO 导出面**：跨层合并元数据、渲染 robots.txt / sitemap.xml / manifest.webmanifest、发现 `src/sitemap.ts` 这类约定文件、产出 JSON-LD，以及在 optional-peer 子路径之后渲染 Open Graph 图。

```ts
import { useSeoMeta } from '@ubean/seo';

useSeoMeta({
  title: 'ubean',
  description: 'Full-stack Vue meta-framework',
  openGraph: { type: 'website' }
});
```

## 目录

- [@ubean/seo](#ubeanseo)
  - [目录](#目录)
  - [包定位](#包定位)
  - [安装](#安装)
  - [快速开始](#快速开始)
  - [元数据合并](#元数据合并)
  - [Head 渲染](#head-渲染)
  - [robots.txt / sitemap.xml / manifest.webmanifest](#robotstxt--sitemapxml--manifestwebmanifest)
  - [文件约定](#文件约定)
  - [JSON-LD](#json-ld)
  - [OG 图](#og-图)
  - [可选 peer](#可选-peer)
  - [类型安全](#类型安全)
  - [架构说明](#架构说明)

## 包定位

`@ubean/seo` 是 **SEO 数据与响应层**，刻意不含框架胶水：

| 分层                 | 职责                                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| `@ubean/seo`（本包） | 元数据类型与合并、robots/sitemap/manifest 响应、文件约定发现、JSON-LD、OG 图渲染                           |
| `@ubean/client`      | 提供**能用的** `useSchemaOrg`（通过 unhead 推入）并 re-export 纯 JSON-LD 助手；拥有页面/布局/应用三层 head |
| `@ubean/vue`         | 通过 `definePage({ head })` 声明页面级 head；读取它的插件                                                  |
| `@ubean/app`         | 在 `init()` 中调用 `registerSeoConventions()`（除非 `seoConventions: false`）并挂载约定路由                |
| `@unhead/vue`        | head 管理器本体 —— 这里的 `useSeoMeta` 只是它的薄包装                                                      |

**包含：**

- `useSeoMeta`（Vue 侧包装，在 setup 上下文之外安全降级）
- 元数据合并与去重：`mergeMetadata`、`mergeSeoLayers`、`dedupeMetaTags`、`dedupeLinkTags`
- 响应构造器：`createRobotsResponse`、`createSitemapResponse`、`createManifestResponse`，以及 `formatRobotsTxt` / `formatSitemapXml` / `escapeXml`
- 配置助手：`defineRobotsConfig`、`defineSitemapConfig`、`defineManifest`
- 文件约定（`/conventions`）：`registerSeoConventions`、`listSeoConventions`、`discoverSeoConventions`、`conventionKindFromPath`、`SEO_CONVENTIONS`
- JSON-LD（`/json-ld`）：`defineJsonLd`、`renderJsonLdScript`、`renderJsonLdScripts`、`serializeJsonLd`、`mergeJsonLd`、`schemaOrg.*`
- OG 图（`/og-image`）：`ImageResponse`、`renderOgImage`、`renderArticleOgImage`、`defaultTemplate`、`articleTemplate`、`renderToImage`、字体加载器

**不包含：**

- head 状态管理、`useHead`、页面/布局 head 层与 head 实例 —— `@unhead/vue`（由 `@ubean/client` 包装）
- `<Head>` / `<Link>` 组件 —— `@ubean/vue` / `@ubean/client`
- 路由注册与 Hono 应用 —— `@ubean/app`；本包只暴露约定返回的 handler
- 服务端路由、`defineHandler`、请求校验 —— `@ubean/routes` / `@ubean/app`
- 组件级图片优化 —— `@ubean/image`（这里的 OG 图渲染是构建/请求期图像生成器，不是 `@ubean/image` 管线）

**运行时依赖白名单（主入口）：`@unhead/vue`、`pathe`。** 主入口只导入 `./json-ld` 与 `@unhead/vue`，因此浏览器安全。`/conventions` 与 `/og-image` 子路径静态导入 `node:fs`，因此**刻意不从主 barrel re-export** —— 在服务端从各自子路径导入。`satori` 与 `@resvg/resvg-js` 是 **optional peer**，仅 PNG 渲染需要。

## 安装

```bash
pnpm add ubean          # 或：pnpm add @ubean/seo
# optional peers —— 仅 PNG OG 图需要：
pnpm add satori @resvg/resvg-js
```

## 快速开始

**1. 页面级 SEO** —— 静态 head 由 `definePage` 声明；`useSeoMeta` 用于动态值：

```ts
// src/pages/index.vue (script setup)
useSeoMeta({
  title: 'ubean',
  description: 'Full-stack Vue meta-framework',
  openGraph: { type: 'website', images: [{ url: '/og.png' }] },
  twitter: { card: 'summary_large_image' }
});
```

**2. 把 robots.txt 与 sitemap.xml 当文件写** —— 放进 `src/` 即自动提供：

```ts
// src/robots.ts
import { defineRobotsConfig } from '@ubean/seo';

export default defineRobotsConfig({
  userAgent: '*',
  allow: '/',
  disallow: ['/admin', '/api'],
  sitemap: 'https://example.com/sitemap.xml'
});
```

```ts
// src/sitemap.ts
import { defineSitemapConfig } from '@ubean/seo';

export default defineSitemapConfig([
  { loc: '/', changefreq: 'weekly', priority: 1 },
  { loc: '/about', changefreq: 'monthly', priority: 0.5 }
]);
```

**3. 一张 OG 图** —— 既可以写成约定文件，也可以直接在路由里调用：

```ts
// src/opengraph-image.ts
import { renderOgImage } from '@ubean/seo/og-image';

export default () => renderOgImage({ title: 'ubean', description: 'Full-stack Vue meta-framework', siteName: 'ubean' });
```

## 元数据合并

```ts
import { mergeMetadata, mergeSeoLayers, dedupeMetaTags, dedupeLinkTags } from '@ubean/seo';

const merged = mergeSeoLayers(globalMeta, layoutMeta, pageMeta); // page > layout > global
const meta = dedupeMetaTags(merged.meta ?? []);
const link = dedupeLinkTags(merged.link ?? []);
```

- `mergeMetadata(...metadatas)` 折叠任意层数，后者覆盖前者。`mergeSeoLayers(global?, layout?, page?)` 是固定的三层形态。
- `dedupeMetaTags(tags: MetaTag[])` 按 `name` / `property` 去重（后者胜）；`dedupeLinkTags(tags: LinkTag[])` 按 `rel` 加 `hreflang` / `type` / `sizes` 去重。
- `buildMetaTags` / `buildLinkTags` / `buildTitle` 暴露各自的投影；`renderHeadTags(meta, fallbackTitle?)` 把某一层序列化为 HTML 字符串。

## Head 渲染

`useSeoMeta<T extends Record<string, any>>(meta: T): T` 包装 `@unhead/vue` 的 `useSeoMeta`，并**吞掉 setup 上下文之外的错误**，因此模块级调用会降级为 no-op 而不是抛错。应用代码请从 `@ubean/client` 导入它 —— 那是同一个函数，外加能用的 `useSchemaOrg`。

## robots.txt / sitemap.xml / manifest.webmanifest

```ts
import { createManifestResponse, createRobotsResponse, createSitemapResponse } from '@ubean/seo';

// GET /robots.txt
return createRobotsResponse({ userAgent: '*', allow: '/', sitemap: 'https://example.com/sitemap.xml' });
// GET /sitemap.xml
return createSitemapResponse([{ loc: 'https://example.com/', lastmod: new Date(), priority: 1 }]);
// GET /manifest.webmanifest
return createManifestResponse({ name: 'ubean', short_name: 'ubean', display: 'standalone', theme_color: '#ffffff' });
```

| 构造器                   | Content-Type                               | Cache-Control           |
| ------------------------ | ------------------------------------------ | ----------------------- |
| `createRobotsResponse`   | `text/plain; charset=utf-8`                | `public, max-age=3600`  |
| `createSitemapResponse`  | `application/xml; charset=utf-8`           | `public, max-age=3600`  |
| `createManifestResponse` | `application/manifest+json; charset=utf-8` | `public, max-age=86400` |

`formatRobotsTxt` / `formatSitemapXml` / `escapeXml` 是它们背后的字符串级助手。`RobotsOptions = { userAgent?, allow?, disallow?, sitemap?, crawlDelay? }` 中 `allow` / `disallow` / `sitemap` 接受字符串或数组（传入数组或同 user-agent 的组数组会渲染成多个区块）。`SitemapUrl = { loc, lastmod?, changefreq?, priority? }`。

## 文件约定

把文件丢进 `src/` 路由就有了 —— 除非创建应用时传 `seoConventions: false`，`@ubean/app` 会在 `init()` 期间调用 `registerSeoConventions()`：

| `src/` 中的文件      | 路由                        | default export 返回                |
| -------------------- | --------------------------- | ---------------------------------- |
| `sitemap.ts`         | `GET /sitemap.xml`          | `SitemapUrl[]` 或其 Promise        |
| `robots.ts`          | `GET /robots.txt`           | `RobotsOptions \| RobotsOptions[]` |
| `manifest.ts`        | `GET /manifest.webmanifest` | `WebAppManifest`                   |
| `opengraph-image.ts` | `GET /opengraph-image`      | `Response`                         |
| `icon.ts`            | `GET /icon`                 | `Response`                         |
| `apple-icon.ts`      | `GET /apple-icon`           | `Response`                         |

```ts
import { listSeoConventions, registerSeoConventions } from '@ubean/seo/conventions';

listSeoConventions({ srcDir: 'src' }); // → ['robots', 'sitemap']，不加载任何内容
await registerSeoConventions(app, { srcDir: 'src' });
```

- 扩展名按 `['.ts', '.js', '.mjs', '.mts', '.cjs']` 顺序探测；可用 `extensions` 覆盖，用 `enabled` / `disabled`（`SeoConventionKind` 数组）过滤。
- 文件缺失会被静默跳过；default export 不是函数的模块同样被跳过 —— 占位文件无害。
- 约定在用户路由**之后**挂载，因此 `src/routes/` 里的显式路由总是优先。
- `registerSeoConventions` 在 app 上注册路由；`SeoConventionApp` 是结构化的 `{ get(path, ...handlers) }` 类型，因此本包不依赖 `@ubean/app`。
- serverless 部署可预先 glob 文件并传给 `registerSeoConventionModules(app, modules)`，从而避免文件系统读取；`conventionKindFromPath(filePath)` 把路径映射到其 kind。

## JSON-LD

```ts
import { defineJsonLd, renderJsonLdScript, schemaOrg } from '@ubean/seo/json-ld';

const schema = schemaOrg.article({
  headline: 'Hello ubean',
  author: 'Ada',
  datePublished: '2026-01-01',
  image: 'https://example.com/cover.png'
});

defineJsonLd(schema); // 注册（客户端请用 @ubean/client 的 useSchemaOrg）
renderJsonLdScript(schema); // <script type="application/ld+json">…</script>
```

- 工厂恰好是 `organization({ name, url?, logo?, sameAs? })`、`website({ name, url, description? })`、`article({ headline, author, datePublished, description?, image?, publisher? })`、`breadcrumb([{ name, url }])` 与 `product({ name, description?, brand?, sku?, price?, priceCurrency?, availability? })`。
- `renderJsonLdScript` 把 `</script>` 拆成 `<\/script>` 并转义 U+2028 / U+2029，因此含 HTML 的 schema 无法逃出标签。`serializeJsonLd` 是 `@ubean/client` 复用的同一份实现。
- 本包内的 `defineJsonLd` / `useSchemaOrg` 是**同构降级版**：它们把数据推给 `globalThis.__UBEAN_HEAD__`，而没有人注册它，因此单独用无法触达真正的 head。Vue 应用中请调用 `@ubean/client` 的 `useSchemaOrg`（它走 unhead 的 `useHead`）。
- `mergeJsonLd` / `renderJsonLdScripts` 用于合并与序列化多个 schema。

## OG 图

```ts
import { ImageResponse, isOgImageSupported, renderArticleOgImage, renderOgImage } from '@ubean/seo/og-image';

if (await isOgImageSupported()) {
  const response = await renderOgImage({
    title: 'ubean',
    description: 'Full-stack Vue meta-framework',
    siteName: 'ubean',
    themeColor: '#3b82f6'
  });
  // response.headers.get('Content-Type') === 'image/png'
}

export default () => new ImageResponse(defaultTemplate({ title: 'Hello' }), { width: 1200, height: 630 });
```

- `OgTemplateInput = { title, description?, siteName?, logo?, themeColor?, textColor?, backgroundImage? }` —— `title` 必填；`OgImageOptions` 额外提供 `width`（1200）/ `height`（630）/ `fonts` / `svgOnly` / `resvgOptions` / `cacheControl`（`public, max-age=86400`）/ `debug`。
- `renderOgImage` 使用默认模板；`renderArticleOgImage` 额外接受 `author` / `date` 并使用文章模板。`defaultTemplate` / `articleTemplate` 返回 Satori VDOM，便于自行组合；`renderToImage(node, options?)` 是底层渲染器，返回 `{ body, contentType }`。
- `ImageResponse` 继承 `Response`，通过 `ReadableStream` 惰性渲染，因此图像在 body 被消费时才生成。
- 字体：`loadDefaultFont()` 从 Google Fonts 拉取 Inter；`loadFontFromUrl(url, name, weight?, fontStyle?)` / `loadFontFromFile(path, name, weight?, fontStyle?)` 加载自有字体。`DEFAULT_FONT_URL` / `DEFAULT_FONT_NAME` 已导出备查。
- `svgOnly: true` 返回 SVG 而非 PNG（无需 `@resvg/resvg-js` 即可工作）。

## 可选 peer

`satori` 与 `@resvg/resvg-js` 是**可选**的 —— 只有 PNG 渲染需要它们：

- **两个都没装：** 元数据合并、`useSeoMeta`、robots / sitemap / manifest 响应、除图像类之外的全部文件约定、JSON-LD 都能正常工作。`renderOgImage` / `renderArticleOgImage` / `renderToImage` 在尝试渲染 PNG 时抛错。
- **只装 `satori`：** `svgOnly: true` 可用；PNG 仍然失败。
- **两个都装：** 产出 `image/png`。
- `isOgImageSupported(): Promise<boolean>` 是能力探测 —— 先 `await import('satori')` 再 `await import('@resvg/resvg-js')`，任一缺失即返回 `false`。用它把 OG 路由护起来（或提供 SVG/静态兜底）。
- `vue` 也被列为 optional peer，因为 `useSeoMeta` 需要它；没有 Vue 时只从 `/json-ld`、`/conventions`、`/og-image` 导入。

## 类型安全

- 元数据类型：`SeoMetadata`、`MetaTag`、`LinkTag`、`OpenGraphMeta`、`OGImage`、`TwitterMeta`。
- 响应选项类型：`RobotsOptions`、`SitemapUrl`、`WebAppManifest`、`ManifestIcon`。
- 约定类型：`SeoConventionKind`、`SeoConventionDescriptor`、`RegisterSeoConventionsOptions`、`SeoConventionApp`、`SeoConventionContext`。
- JSON-LD 类型：`JsonLdSchema`、`JsonLdInput`。
- OG 图类型：`OgImageOptions`、`OgTemplateInput`、`SatoriFont`、`SatoriNode`。
- `SeoMetadata.titleTemplate` 接受字符串或 `(title) => string` 函数；`SeoMetadata.robots` 接受字符串或 `{ index?, follow? }`。

## 架构说明

- **按运行时切分子路径：** 主入口浏览器安全（只导入 `@unhead/vue` 与 `./json-ld`）。`/conventions` 与 `/og-image` 静态导入 `node:fs`，因此**刻意不从主 barrel re-export** —— 从客户端模块导入它们会把 Node 内置模块拉进浏览器构建。
- **同构版与可用版 `useSchemaOrg`：** 本包不能依赖 Vue/unhead 内部，因此自带的 `useSchemaOrg` 是基于注册表的降级实现。可用版本由 `@ubean/client` 拥有，并复用 `serializeJsonLd` 完成转义 —— 一份转义实现，两个调用点。
- **框架胶水不在本包：** 它从不导入 `@ubean/app`；`SeoConventionApp` 是结构化类型，这既让 SEO 层零依赖，也让路由挂载决策留在应用工厂里。
- **组合优于重复：** `mergeMetadata` 是唯一的合并原语；`mergeSeoLayers` 是其三参数便利包装，去重在合并时完成，消费者无需重复实现 last-wins 语义。
- **按 peer 开闸的能力：** PNG 渲染优雅降级，并在运行时通过 `isOgImageSupported()` 探测，因此没装重依赖的项目仍能获得其余全部 SEO 能力。
- **归属：** `@ubean/client` 把元数据绑定到 head 实例；`@ubean/app` 挂载约定路由；`@ubean/seo` 拥有数据、转义与渲染原语。
