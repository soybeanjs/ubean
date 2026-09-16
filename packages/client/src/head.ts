import { serializeJsonLd } from '@ubean/seo';
import type { JsonLdInput, JsonLdSchema } from '@ubean/seo';
import { injectHead, useHead as useUnheadHead } from '@unhead/vue';

export function useHeadInstance() {
  return injectHead();
}

/**
 * 注册 JSON-LD 结构化数据（P9-07）。
 *
 * **为什么这个 Vue 版本是「能用的那个」**：`@ubean/seo` 里同名函数是 isomorphic 的降级实现 ——
 * 它把 schema 推给 `globalThis.__UBEAN_HEAD__`，而那个全局**从来没有人注册**（全仓只有它自己在读），
 * 于是实际上是**静默空操作**（文档却写着「通过 useHead 注入 head」，实测注入不进去）。Vue 侧要走
 * `@unhead/vue` 的 `useHead` 才能真正进 head，而 `@ubean/seo` 不能依赖 Vue/unhead —— 因此把可用版本
 * 放在这里，并让 isomorphic 版本在缺 head 时告警，避免下次再静默失败。
 *
 * 序列化复用 `serializeJsonLd()`（转义 `</script>`、U+2028/U+2029），字段用 unhead v3 的
 * `textContent`（v3 的 script 条目用 `textContent`，不是 `innerHTML`）。
 */
export function useSchemaOrg(schema: JsonLdInput): JsonLdInput {
  useUnheadHead({
    script: [{ type: 'application/ld+json', textContent: serializeJsonLd(schema as JsonLdSchema) }]
  });
  return schema;
}
