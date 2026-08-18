export interface RouteLocationRaw {
  name?: string;
  path?: string;
  params?: Record<string, string | number>;
  query?: Record<string, string | number | boolean | undefined | null>;
  hash?: string;
}

export type RouteLocation = string | RouteLocationRaw;

export function resolveRoute(to: RouteLocation, routeMap?: Record<string, { path: string; route: string }>): string {
  if (typeof to === 'string') {
    if (to.startsWith('/') || to.startsWith('http') || to.startsWith('#')) {
      return to;
    }
    return `/${to.replace(/^\//, '')}`;
  }

  let path = to.path || '/';

  if (to.name && routeMap) {
    const route = routeMap[to.name];
    if (route) {
      path = route.route;
    }
  }

  if (to.params) {
    for (const [key, value] of Object.entries(to.params)) {
      path = path.replace(`:${key}`, String(value));
    }
  }

  if (to.query) {
    const qs = Object.entries(to.query)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    if (qs) {
      path += (path.includes('?') ? '&' : '?') + qs;
    }
  }

  if (to.hash) {
    path += to.hash.startsWith('#') ? to.hash : `#${to.hash}`;
  }

  return path;
}

export type RouteNamesFromMap<_T extends Record<string, { path: string; route: string }>> = keyof _T & string;

export type TypedLinkProps = {
  to?: RouteLocation;
  href?: string;
  replace?: boolean;
  prefetch?: boolean;
  as?: string;
  activeClass?: string;
  exactActiveClass?: string;
};

export function isActiveRoute(currentPath: string, targetHref: string, exact = false): boolean {
  if (targetHref === '/' || targetHref === '') {
    return currentPath === '/';
  }
  if (exact) {
    return currentPath === targetHref || currentPath === `${targetHref}/`;
  }
  return (
    currentPath === targetHref || currentPath.startsWith(`${targetHref}/`) || currentPath.startsWith(`${targetHref}?`)
  );
}
