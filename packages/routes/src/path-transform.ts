/**
 * Apply a rewrite/proxy target to a request path (Nuxt-style wildcards).
 *
 * - `/old` + `/new` → `/new`
 * - rule `/blog/**`, request `/blog/a/b`, target `/news/**` → `/news/a/b`
 * - target containing `$1` receives the captured suffix without a leading slash
 * - absolute `https://…` targets keep the origin and transform the pathname
 */
export function applyPathTransform(requestPath: string, rulePath: string, target: string): string {
  const suffix = captureWildcardSuffix(requestPath, rulePath);
  const absolute = parseAbsoluteTarget(target);
  if (absolute) {
    const nextPath = substitutePath(absolute.pathname || '/', suffix);
    return `${absolute.origin}${nextPath}${absolute.search}`;
  }
  return substitutePath(target, suffix);
}

function parseAbsoluteTarget(target: string): { origin: string; pathname: string; search: string } | undefined {
  if (!/^https?:\/\//.test(target)) return undefined;
  try {
    const url = new URL(target);
    return { origin: url.origin, pathname: url.pathname, search: url.search };
  } catch {
    return undefined;
  }
}

function captureWildcardSuffix(requestPath: string, rulePath: string): string {
  const doubleIdx = rulePath.indexOf('/**');
  if (doubleIdx !== -1) {
    const prefix = rulePath.slice(0, doubleIdx);
    if (requestPath === prefix || requestPath === `${prefix}/`) return '';
    if (requestPath.startsWith(`${prefix}/`)) return requestPath.slice(prefix.length);
    return '';
  }
  const singleIdx = rulePath.indexOf('/*');
  if (singleIdx !== -1 && !rulePath.includes('**')) {
    const prefix = rulePath.slice(0, singleIdx);
    if (requestPath.startsWith(`${prefix}/`)) {
      const rest = requestPath.slice(prefix.length + 1);
      return `/${rest.split('/')[0] ?? ''}`;
    }
  }
  return '';
}

function substitutePath(targetPath: string, suffix: string): string {
  const trimmedSuffix = suffix.replace(/^\//, '');
  if (targetPath.includes('$1')) {
    return targetPath.replaceAll('$1', trimmedSuffix);
  }
  if (targetPath.includes('/**')) {
    const replaced = targetPath.replace('/**', suffix || '');
    return normalizePath(replaced);
  }
  if (targetPath.includes('/*')) {
    const first = suffix.split('/').filter(Boolean)[0];
    const replaced = targetPath.replace('/*', first ? `/${first}` : '');
    return normalizePath(replaced);
  }
  return normalizePath(targetPath);
}

function normalizePath(path: string): string {
  if (!path) return '/';
  const withSlash = path.startsWith('/') ? path : `/${path}`;
  return withSlash.replace(/\/{2,}/g, '/');
}
