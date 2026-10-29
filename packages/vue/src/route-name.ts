import { pascalCase } from 'scule';
import { ROOT_ROUTE_NAME } from './global-routes';

/**
 * 路由名生成器(页面路由所有权归属 `@ubean/vue`)。
 * `@ubean/scan` 聚合层 re-export 保持向后兼容;服务端专用的
 * `generateApiRouteId` 保留在 `@ubean/scan`。
 */

/**
 * 动态参数段:`[x]`、`[[x]]`、`[...x]`,可带 `=matcher` 与 repeatable 修饰符
 * (`+` / `*`)。
 *
 * 修饰符必须被单独捕获 —— 旧实现用 `slice(1, -1)` 按固定长度切,遇到 `[slugs]+`
 * 会切出 `slugs]`,生成 `ArticlesSlugs]` 这种非法标识符(`Page_ArticlesSlugs]`)。
 */
const DYNAMIC_SEGMENT_REGEX = /^\[(\.{3})?\[?([\w-]+)(?:=[\w-]+)?\]\]?([?*+]?)$/;

/**
 * `index` 文件段折叠:`a/index.vue` 与 `a.vue` 是同一路由,名字也必须相同(`A`),
 * 否则换一种写法就得把 `reuse` 引用和 typed-router 的类型全改一遍。
 * URL 里本来也没有 `index` 段 —— 名字跟着 URL 走。
 */
const INDEX_SEGMENT_REGEX = /(^|\/)index$/;

export function generateRouteName(routePath: string): string {
  if (routePath === '/' || routePath === '' || routePath === 'index') {
    return ROOT_ROUTE_NAME;
  }

  const segments = routePath.replace(/^\//, '').replace(/\/$/, '').replace(INDEX_SEGMENT_REGEX, '').split('/');

  const nameSegments: string[] = [];

  for (const segment of segments) {
    if (segment.startsWith('(') && segment.endsWith(')')) {
      continue;
    }

    const dynamic = DYNAMIC_SEGMENT_REGEX.exec(segment);
    if (dynamic) {
      const [, dots, param, modifier] = dynamic;
      const base = pascalCase(param!);
      // catch-all 带 `All` 前缀;可选(`[[x]]` 或 `*`)带 `Optional` 后缀。
      // repeatable 的 `+` 不改变名字 —— 它只描述段数,不改变路由身份。
      const prefix = dots ? 'All' : '';
      const suffix = segment.startsWith('[[') || modifier === '*' ? 'Optional' : '';
      nameSegments.push(`${prefix}${base}${suffix}`);
      continue;
    }

    // 同一段内静态与动态混合(`product_[skuId]_[seo]`)时,先剔除方括号再分段
    // pascalCase,否则 `[...]` 会原样进入名字。
    const cleaned = segment.replace(/\[\[?(\.{3})?([\w-]+)(?:=[\w-]+)?\]\]?[?*+]?/g, (_, dots, param) => {
      return `_${dots ? 'All' : ''}${param}_`;
    });
    nameSegments.push(pascalCase(cleaned));
  }

  const name = nameSegments.join('');
  return name || ROOT_ROUTE_NAME;
}

export function generateLayoutName(layoutPath: string): string {
  const base = layoutPath.replace(/\.(vue|ts)$/, '');
  if (base === 'default' || base === 'default/index') {
    return 'default';
  }
  const segments = base.split('/').filter(Boolean);
  return segments.map(s => pascalCase(s)).join('');
}
