/**
 * 通配符匹配,支持:
 * - `**` 多段递归  ('/blog/**' 匹配 '/blog/a/b/c' 与 '/blog')
 * - `*`  单段     ('/blog/*' 匹配 '/blog/a' 不匹配 '/blog/a/b')
 * - 字面量         ('/about' 仅匹配 '/about')
 *
 * 提取自 `@ubean/prerender`,供 SSR exclude / prerender / 其他需要 glob 匹配的模块共享。
 */
export function matchGlob(route: string, pattern: string): boolean {
  if (pattern === route) return true;
  if (pattern === '**') return true;

  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return route === prefix || route.startsWith(`${prefix}/`);
  }

  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2);
    return route.startsWith(`${prefix}/`) && !route.slice(prefix.length + 1).includes('/');
  }

  if (pattern === '/**') {
    return true;
  }

  // 一般 glob:转正则(* → [^/]*, ** → .*)
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*');
  return new RegExp(`^${escaped}$`).test(route);
}

/**
 * 检查 route 是否匹配任意一个 patterns。
 */
export function matchAnyGlob(route: string, patterns: string[]): boolean {
  return patterns.some(p => matchGlob(route, p));
}
