import { withBase, withLeadingSlash, withoutTrailingSlash } from 'ufo';

/**
 * 路由路径算法(页面路由所有权归属 `@ubean/vue`,服务端 API 路由复用同一解析器):
 * - stripRouteGroups
 * - ParsedRoutePath 类型
 * - parseMatchers
 * - filePathToRoute
 *
 * `@ubean/scan` 聚合层 re-export 本文件导出保持向后兼容。
 */

const EXTENSION_REGEX = /\.(mjs|js|jsx|cjs|ts|tsx|mts|cts|vue|md|mdx)$/i;
const METHOD_SUFFIX_REGEX = /\.(connect|delete|get|head|options|patch|post|put|trace)$/i;
const ENV_SUFFIX_REGEX = /\.(dev|prod|prerender)$/i;
const MIXED_SUFFIX_REGEX = /\.(connect|delete|get|head|options|patch|post|put|trace)\.(dev|prod|prerender)$/i;

const DYNAMIC_PARAM_REGEX = /\[([^\]]+)\]/g;
const CATCH_ALL_REGEX = /\[\.{3}([^\]]+)\]/g;
const OPTIONAL_PARAM_REGEX = /\[\[([^\]]+)\]\]/g;
const ROUTE_GROUP_REGEX = /\(([^(/\\]+)\)[/\\]/g;
const ROUTE_GROUP_TRAILING_REGEX = /\(([^(/\\]+)\)$/;

/**
 * `[id=numeric]` / `[...slug=anything]` matcher 语法解析。
 *
 * 捕获组:
 *   $1 = 可选的 `...`(catch-all 前缀)
 *   $2 = 参数名(id / slug / ...)
 *   $3 = 可选的 `=matcherName`
 */
const DYNAMIC_PARAM_WITH_MATCHER_REGEX = /\[(\.{3})?([A-Za-z_][\w-]*)(?:=([A-Za-z_][\w-]*))?\]/g;

const INDEX_FILE_REGEX = /\/index$/;

export function stripRouteGroups(path: string): string {
  let result = path.replace(ROUTE_GROUP_REGEX, '');
  result = result.replace(ROUTE_GROUP_TRAILING_REGEX, '');
  return result;
}

export interface ParsedRoutePath {
  route: string;
  method?: string;
  env?: string;
  /**
   * matcher 后缀剥离后、语法转换前的文件路由路径(保留 `[id]` / `[...slug]`
   * 方括号语法)。`generateRouteName` 消费文件语法而非转换后的 `:id` 语法。
   */
  cleaned?: string;
  /**
   * 路由参数 → matcher 名称的映射。
   *
   * 由 `[paramName=matcherName]` 语法解析得到,例如 `[id=numeric].vue` →
   * `{ id: 'numeric' }`。无 matcher 语法的路由此项为 `undefined`。
   */
  matchers?: Record<string, string>;
}

/**
 * 解析 `[param=matcher]` 语法,从原始路径中提取 matcher 名称映射,并把
 * `=matcher` 后缀剥离,以便后续正则能正确识别为普通动态参数。
 *
 * @example
 * parseMatchers('users/[id=numeric]') → { cleaned: 'users/[id]', matchers: { id: 'numeric' } }
 * parseMatchers('blog/[...slug=any]') → { cleaned: 'blog/[...slug]', matchers: { slug: 'any' } }
 * parseMatchers('users/[id]')         → { cleaned: 'users/[id]', matchers: undefined }
 */
export function parseMatchers(filePath: string): { cleaned: string; matchers?: Record<string, string> } {
  const matchers: Record<string, string> = {};
  let hasMatchers = false;

  // 使用 replacer 函数:剥离 `=matcher` 部分,并记录 matcher 映射
  const cleaned = filePath.replace(DYNAMIC_PARAM_WITH_MATCHER_REGEX, (full, dots, name, matcherName) => {
    if (matcherName) {
      matchers[name] = matcherName;
      hasMatchers = true;
    }
    // 重新组装为 `[name]` 或 `[...name]`(去除 `=matcher` 后缀)
    return dots ? `[${dots}${name}]` : `[${name}]`;
  });

  return hasMatchers ? { cleaned, matchers } : { cleaned: filePath };
}

export function filePathToRoute(filePath: string, prefix = '/'): ParsedRoutePath {
  // 先剥离 `[id=matcher]` 中的 `=matcher` 后缀并提取 matcher 映射,
  // 后续正则才能正确识别为普通 `[id]` 动态参数。
  const { cleaned: matcherStripped, matchers } = parseMatchers(filePath);
  let route = matcherStripped;
  let method: string | undefined;
  let env: string | undefined;

  route = route.replace(EXTENSION_REGEX, '');

  const mixedMatch = route.match(MIXED_SUFFIX_REGEX);
  if (mixedMatch && mixedMatch.index !== undefined) {
    route = route.slice(0, mixedMatch.index);
    method = mixedMatch[1].toLowerCase();
    env = mixedMatch[2];
  } else {
    const methodMatch = route.match(METHOD_SUFFIX_REGEX);
    if (methodMatch && methodMatch.index !== undefined) {
      route = route.slice(0, methodMatch.index);
      method = methodMatch[1].toLowerCase();
    }
    const envMatch = route.match(ENV_SUFFIX_REGEX);
    if (envMatch && envMatch.index !== undefined) {
      route = route.slice(0, envMatch.index);
      env = envMatch[1];
    }
  }

  route = stripRouteGroups(route);

  route = route.replace(CATCH_ALL_REGEX, (_, p) => `**:${p.replace(/[^\w-]/g, '_')}`);

  route = route.replace(OPTIONAL_PARAM_REGEX, (_, p) => `:${p.replace(/[^\w-]/g, '_')}?`);

  route = route.replace(DYNAMIC_PARAM_REGEX, (_, p) => `:${p.replace(/[^\w-]/g, '_')}`);

  route = withLeadingSlash(withoutTrailingSlash(withBase(route, prefix)));

  route = route.replace(INDEX_FILE_REGEX, '') || '/';

  return { route, method, env, cleaned: matcherStripped, matchers };
}
