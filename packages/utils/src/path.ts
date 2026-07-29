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
}

export function filePathToRoute(filePath: string, prefix = '/'): ParsedRoutePath {
  let route = filePath;
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

  return { route, method, env };
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
