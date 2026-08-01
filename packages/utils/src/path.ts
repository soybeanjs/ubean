import { kebabCase } from 'scule';
import { withBase, withLeadingSlash, withoutTrailingSlash } from 'ufo';
import { capitalize } from './string';

const EXTENSION_REGEX = /\.(mjs|js|jsx|cjs|ts|tsx|mts|cts|vue)$/i;
const METHOD_SUFFIX_REGEX = /\.(connect|delete|get|head|options|patch|post|put|trace)$/i;
const ENV_SUFFIX_REGEX = /\.(dev|prod|prerender)$/i;
const MIXED_SUFFIX_REGEX = /\.(connect|delete|get|head|options|patch|post|put|trace)\.(dev|prod|prerender)$/i;

const DYNAMIC_PARAM_REGEX = /\[([^\]]+)\]/g;
const CATCH_ALL_REGEX = /\[\.{3}([^\]]+)\]/g;
const OPTIONAL_PARAM_REGEX = /\[\[([^\]]+)\]\]/g;
const ROUTE_GROUP_REGEX = /\(([^(/\\]+)\)[/\\]/g;
const ROUTE_GROUP_TRAILING_REGEX = /\(([^(/\\]+)\)$/;

/**
 * `[id=numeric]` / `[...slug=anything]` matcher 语法解析(Task 7, P1)。
 *
 * 捕获组:
 *   $1 = 可选的 `...`(catch-all 前缀)
 *   $2 = 参数名(id / slug / ...)
 *   $3 = 可选的 `=matcherName`
 *
 * 命名子组便于在 replacer 中按名引用,而非按位置索引。
 *
 * 不匹配的情况:
 *   - `[id]`(无 `=`)—— 由 `DYNAMIC_PARAM_REGEX` 处理
 *   - `[[id]]`(可选参数)—— 由 `OPTIONAL_PARAM_REGEX` 处理
 *   - `[...slug]`(无 `=`)—— 由 `CATCH_ALL_REGEX` 处理
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
   * 路由参数 → matcher 名称的映射(Task 7, P1)。
   *
   * 由 `[paramName=matcherName]` 语法解析得到,例如 `[id=numeric].vue` →
   * `{ id: 'numeric' }`。无 matcher 语法的路由此项为 `undefined`。
   *
   * matcher 函数本身在运行时由 `defineMatcher(name, fn)` 注册,扫描阶段只
   * 记录名称映射,不加载函数。
   */
  matchers?: Record<string, string>;
}

/**
 * 解析 `[param=matcher]` 语法,从原始路径中提取 matcher 名称映射,并把
 * `=matcher` 后缀剥离,以便后续的 `DYNAMIC_PARAM_REGEX` / `CATCH_ALL_REGEX`
 * 正则能正确识别为普通动态参数。
 *
 * 匹配 `[name]` / `[...name]` / `[[name]]` / `[[name=matcher]]` 形式(可选参数
 * `[[...]]` 的 matcher 也能识别,因 regex 匹配内层 `[name=matcher]` 后由
 * `OPTIONAL_PARAM_REGEX` 进一步处理为 `:name?`)。
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
  // Task 7:先剥离 `[id=matcher]` 中的 `=matcher` 后缀并提取 matcher 映射,
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

  return { route, method, env, matchers };
}

/* -------------------------------------------------------------------------- */
/* 通用路径工具函数（从 @ubean/content 迁入）                                   */
/* -------------------------------------------------------------------------- */

/**
 * 标准化路径：替换反斜杠、去除首尾多余斜杠、合并连续斜杠。
 */
export function normalizePath(path: string): string {
  return `/${path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '').replace(/\/+/g, '/')}`;
}

/**
 * 获取路径的目录部分（不含文件名）。
 */
export function getDirname(path: string): string {
  const parts = path.split('/');
  parts.pop();
  return parts.join('/') || '/';
}

/**
 * 获取路径的文件名部分（含扩展名）。
 */
export function getBasename(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1];
}

/**
 * 获取文件名的扩展名（小写，不含点）。
 */
export function getExtension(filename: string): string {
  const match = filename.match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : '';
}

/**
 * 获取文件名（不含扩展名）。
 */
export function getStem(filename: string): string {
  return filename.replace(/\.[^.]+$/, '');
}

/**
 * 将文件路径转换为人类可读的标题。
 */
export function pathToTitle(path: string): string {
  const stem = getStem(getBasename(path));
  if (stem === 'index') {
    return kebabCase(getBasename(getDirname(path)) || 'home')
      .split('-')
      .map(capitalize)
      .join(' ');
  }
  return kebabCase(stem).split('-').map(capitalize).join(' ');
}
