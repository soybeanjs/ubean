/**
 * P9-07 JSON-LD / Schema.org 结构化数据
 *
 * 提供 `defineJsonLd()` / `useSchemaOrg()` 两个 API,对齐 Nuxt `nuxt-schema.org` 的
 * 用户体验,但实现保持零依赖(无 schema-dts 强约束),允许任意 JSON-LD 对象。
 *
 * 设计要点:
 * - `defineJsonLd(schema)` 是纯函数:接收 Schema.org JSON-LD 对象(或返回它的函数),
 *   返回标准的 `<script type="application/ld+json">` 标签字符串。
 * - `useSchemaOrg(schema)` 是 Vue composable 版本,内部通过 `useHead` 注入到 head。
 *   在非 Vue 上下文中静默降级(返回字符串)。
 * - `renderJsonLdScript(schema)` 序列化为 HTML 字符串,自动转义 `</script>`、
 *   U+2028/U+2029(避免 JSON 中断 JS 解析)。
 * - 支持 graph 数组(`@graph`)和多 schema 合并。
 *
 * 对齐:Nuxt `nuxt-schema.org`(基于 `schema-dts` 类型);Astro 手动注入。
 */

/**
 * 最小化的 head 条目类型(避免依赖 `@unhead/vue` 内部类型,
 * 该类型在不同版本间不稳定)。`useSchemaOrg` 只用它做 `as unknown` 转换。
 */
type HeadEntry = Record<string, unknown>;

/**
 * 任意 JSON-LD 节点。必须是可序列化对象,通常包含 `@context` 和 `@type`。
 */
export type JsonLdSchema = Record<string, unknown>;

/**
 * JSON-LD schema 输入:可以是对象、对象数组,或返回对象/数组的函数。
 */
export type JsonLdInput =
  | JsonLdSchema
  | JsonLdSchema[]
  | (() => JsonLdSchema | JsonLdSchema[] | Promise<JsonLdSchema | JsonLdSchema[]>);

/**
 * 渲染为 `<script type="application/ld+json">` HTML 字符串。
 *
 * 安全性:
 * - `</script>` 拆分为 `<\/script>` 防止提前结束 script 标签
 * - U+2028 / U+2029 替换为 Unicode 转义(防止 JS 解析器在 JSON 中断行)
 *
 * @example
 * ```ts
 * renderJsonLdScript({ '@context': 'https://schema.org', '@type': 'Organization', name: 'ubean' })
 * // => <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"ubean"}</script>
 * ```
 */
export function renderJsonLdScript(schema: JsonLdSchema | JsonLdSchema[]): string {
  const json = JSON.stringify(schema)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `<script type="application/ld+json">${json}</script>`;
}

/**
 * 把多个 JSON-LD schema 合并为 `@graph` 数组(对齐 schema.org 推荐做法)。
 *
 * 若输入只有一个 schema,直接返回(避免不必要的 @graph 包装)。
 */
export function mergeJsonLd(schemas: JsonLdSchema[]): JsonLdSchema | JsonLdSchema[] {
  if (schemas.length === 0) return {};
  if (schemas.length === 1) return schemas[0];
  // 单 @context 优先,合并到外层;否则每个 schema 保留自己的 @context
  const allHaveSameContext = schemas.every(s => s['@context'] === schemas[0]['@context']);
  if (allHaveSameContext && schemas[0]['@context']) {
    const context = schemas[0]['@context'];
    const graph = schemas.map(({ '@context': _c, ...rest }) => rest);
    return { '@context': context, '@graph': graph };
  }
  return { '@graph': schemas };
}

/**
 * 定义一个 JSON-LD schema(纯函数,无副作用)。
 *
 * @example
 * ```ts
 * const org = defineJsonLd({
 *   '@context': 'https://schema.org',
 *   '@type': 'Organization',
 *   name: 'ubean',
 *   url: 'https://ubean.dev'
 * });
 * // 在 SSR 中注入到 head:
 * renderJsonLdScript(org)
 * ```
 */
export function defineJsonLd(schema: JsonLdInput): JsonLdInput {
  return schema;
}

/**
 * Vue composable:把 JSON-LD schema 注入到 head(通过 `useHead`)。
 *
 * 在非 Vue setup 上下文中静默降级(返回 schema 本身),不抛错。
 *
 * @example
 * ```vue
 * <script setup>
 * useSchemaOrg({
 *   '@context': 'https://schema.org',
 *   '@type': 'Article',
 *   headline: 'My Article',
 *   author: { '@type': 'Person', name: 'John' }
 * });
 * </script>
 * ```
 */
export function useSchemaOrg(schema: JsonLdInput): JsonLdInput {
  try {
    // 延迟 require 风格的动态 import,避免在非 Vue 环境报错
    const head = (globalThis as any).__UBEAN_HEAD__ as { push: (entry: HeadEntry) => void } | undefined;
    if (head && typeof head.push === 'function') {
      const scriptContent = typeof schema === 'function' ? JSON.stringify(schema) : JSON.stringify(schema);
      head.push({
        script: [
          {
            type: 'application/ld+json',
            innerHTML: scriptContent
          }
        ]
      } as unknown as HeadEntry);
    }
  } catch {
    // ignore
  }
  return schema;
}

/**
 * 把多个 JSON-LD schema 渲染为 `<script>` 标签数组(SSR 用)。
 */
export function renderJsonLdScripts(schemas: JsonLdSchema[]): string {
  return schemas.map(s => renderJsonLdScript(s)).join('\n');
}

/**
 * 常见 Schema.org 类型的便捷工厂函数(覆盖 80% 用例)。
 */
export const schemaOrg = {
  organization(options: { name: string; url?: string; logo?: string; sameAs?: string[] }): JsonLdSchema {
    return {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: options.name,
      ...(options.url ? { url: options.url } : {}),
      ...(options.logo ? { logo: options.logo } : {}),
      ...(options.sameAs ? { sameAs: options.sameAs } : {})
    };
  },

  website(options: { name: string; url: string; description?: string }): JsonLdSchema {
    return {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: options.name,
      url: options.url,
      ...(options.description ? { description: options.description } : {})
    };
  },

  article(options: {
    headline: string;
    author: string;
    datePublished: string;
    image?: string;
    publisher?: string;
  }): JsonLdSchema {
    return {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: options.headline,
      author: { '@type': 'Person', name: options.author },
      datePublished: options.datePublished,
      ...(options.image ? { image: options.image } : {}),
      ...(options.publisher ? { publisher: { '@type': 'Organization', name: options.publisher } } : {})
    };
  },

  breadcrumb(items: Array<{ name: string; url: string }>): JsonLdSchema {
    return {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: items.map((item, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: item.name,
        item: item.url
      }))
    };
  },

  product(options: {
    name: string;
    description?: string;
    brand?: string;
    sku?: string;
    price?: string;
    priceCurrency?: string;
    availability?: 'InStock' | 'OutOfStock' | 'PreOrder';
  }): JsonLdSchema {
    return {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: options.name,
      ...(options.description ? { description: options.description } : {}),
      ...(options.brand ? { brand: { '@type': 'Brand', name: options.brand } } : {}),
      ...(options.sku ? { sku: options.sku } : {}),
      ...(options.price
        ? {
            offers: {
              '@type': 'Offer',
              price: options.price,
              ...(options.priceCurrency ? { priceCurrency: options.priceCurrency } : {}),
              ...(options.availability ? { availability: `https://schema.org/${options.availability}` } : {})
            }
          }
        : {})
    };
  }
};
