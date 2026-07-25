import { withBase, withLeadingSlash, withoutTrailingSlash } from 'ufo';

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
