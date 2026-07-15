import { createTypedInternalFetch } from 'ubean';
import type { paths } from '../../.ubean/openapi';

/**
 * server 端类型化内部 fetch
 *
 * 在 API 路由或 useData 的 fetcher 中使用,自动转发 cookie/authorization 等请求头。
 * 与 client.ts 的 api 接口一致,但通过 server 端 fetch 发起请求(自动转发请求头)。
 *
 * baseURL 会自动从当前请求的 URL 中推断,无需手动设置。
 *
 * @example
 * // src/routes/api/posts.ts
 * import { defineHandler } from 'ubean';
 * import { createServerApi } from '../request/internal';
 *
 * export const GET = defineHandler(async (c) => {
 *   const api = createServerApi(c);
 *   const user = await api.get('/api/users/{id}', { params: { path: { id: 1 } } });
 *   return c.json(user);
 * });
 *
 * @example
 * // 在 useData 中使用
 * import { useData, defineHandler } from 'ubean';
 * import { createServerApi } from '../request/internal';
 *
 * export const GET = defineHandler(async (c) => {
 *   const api = createServerApi(c);
 *   const result = await useData({
 *     fetcher: async () => api.get('/api/users/{id}', { params: { path: { id: 1 } } })
 *   });
 *   return c.json(result.data);
 * });
 */
export function createServerApi(context: Parameters<typeof createTypedInternalFetch>[0]) {
  // createTypedInternalFetch 会自动从 context.req.url 推断 baseURL
  return createTypedInternalFetch<paths>(context);
}
