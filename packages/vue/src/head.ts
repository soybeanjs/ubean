import type { Router } from 'vue-router';
import type { PageHead } from './types';

/**
 * 页面级 head 的客户端接通(零依赖核心 + 按需加载)。
 *
 * 设计:
 * - 核心路径零第三方依赖:`PageHeadClient` 是结构化类型(`{ push }`),
 *   任何 unhead 实例(或测试替身)都可直接传入。
 * - 无实例时通过 `createPageHead()` 按需加载 `@unhead/vue`(optional peer),
 *   未安装时报清晰错误。
 * - 构建期 `/vite` 插件 `head: true`(默认 false)时,`definePage({ head })`
 *   与 markdown frontmatter `head` 才写入 `route.meta.head`;SSR 链路不受
 *   影响(服务端从扫描结果的 `pageMeta.head` 读取)。
 */

/** 结构化 head 客户端 —— 与 `@unhead/vue` 的 head 实例兼容。 */
export interface PageHeadClient {
  push(input: unknown): unknown;
}

/**
 * 将静态 `PageHead` push 进 head 实例(falsy 字段自动跳过)。
 * 与 SSR 侧 `pushPageHead`(@ubean/client/ssr)语义一致,保证双端同构。
 */
export function pushPageHead(head: PageHeadClient, pageHead: PageHead): void {
  const input: Record<string, unknown> = {};
  if (pageHead.title !== undefined) input.title = pageHead.title;
  if (pageHead.meta !== undefined) input.meta = pageHead.meta;
  if (pageHead.link !== undefined) input.link = pageHead.link;
  if (pageHead.script !== undefined) input.script = pageHead.script;
  if (pageHead.htmlAttrs !== undefined) input.htmlAttrs = pageHead.htmlAttrs;
  if (pageHead.bodyAttrs !== undefined) input.bodyAttrs = pageHead.bodyAttrs;
  head.push(input);
}

/**
 * SPA 页面级 head 守卫:导航完成后读取 `route.meta.head` 并 push 进 head 实例。
 *
 * ```ts
 * import { createRouter, createWebHistory } from 'vue-router';
 * import { setupPageHeadGuard, createPageHead } from '@ubean/vue';
 *
 * const head = await createPageHead();          // 按需加载 @unhead/vue
 * const router = createRouter({ history: createWebHistory(), routes });
 * setupPageHeadGuard(router, head);             // 也可传任何已有 unhead 实例
 * ```
 *
 * 初始导航同样触发(vue-router 首次导航完成后 afterEach 执行)。
 */
export function setupPageHeadGuard(router: Router, head: PageHeadClient): void {
  router.afterEach(to => {
    const pageHead = to.meta.head;
    if (pageHead) pushPageHead(head, pageHead);
  });
}

/**
 * 按需创建 head 实例(懒加载 `@unhead/vue`,optional peer dependency)。
 *
 * 项目已自带 unhead 实例时无需调用 —— 直接把实例传给
 * `setupPageHeadGuard` 即可,零额外加载。
 */
export async function createPageHead(): Promise<PageHeadClient> {
  try {
    const mod = (await import('@unhead/vue')) as { createHead?: () => PageHeadClient };
    if (typeof mod.createHead === 'function') return mod.createHead();
  } catch {
    // fall through to error below
  }
  throw new Error('[ubean/vue] createPageHead() requires `@unhead/vue` to be installed (optional peer dependency)');
}
