import type { PageKind } from './types';

/**
 * 从页面条目解析 `pageKind`，缺省视为 `'component'`。
 *
 * `ScannedPage.pageKind` 是必填字段，但消费方也会拿到**非 TS 来源**的数据
 * （序列化进产物的 JSON、宿主自己构造的对象、devtools 上报的载荷），那里可能
 * 缺这个字段。缺省 `'component'` 是安全方向：既有组件就按普通页面渲染，
 * 不会把页面误判成「借组件」而去找一个不存在的 reuseTarget。
 */
export function resolvePageKind(page: { pageKind?: PageKind }): PageKind {
  return page.pageKind ?? 'component';
}
