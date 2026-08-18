import { generateRouteName } from '@ubean/vue/vite';

/**
 * 服务端专用:生成 API 路由的唯一 ID(`${method}${RouteName}`)。
 * (页面路由名生成器 `generateRouteName` 所有权在 `@ubean/vue`。)
 */
export function generateApiRouteId(method: string, routePath: string): string {
  const routeName = generateRouteName(routePath);
  return `${method.toLowerCase()}${routeName}`;
}
