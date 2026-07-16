import { defineHandler, describeRoute } from 'ubean';
import { createServerApi } from '../../request/internal';

/**
 * 类型化内部 fetch 示例路由
 *
 * 演示在 server 端使用 createServerApi(c) 进行进程内调度:
 * - 自动转发 cookie/authorization 等请求头
 * - 路径、参数、返回值均类型安全(基于 .ubean/openapi.d.ts)
 * - 接口与浏览器端 ~/request/client 的 api 一致
 */
export const GET = defineHandler(
  describeRoute({
    summary: 'Typed internal fetch demo',
    description: 'Demonstrates server-side typed internal fetch by calling other API routes in-process.',
    tags: ['Demo'],
    responses: {
      200: {
        description: 'Aggregated results from internal calls',
        content: {
          'application/json': {
            schema: { type: 'object' }
          }
        }
      }
    }
  }),
  async c => {
    const api = createServerApi(c);

    // 1. 调用 /api/hello(JSON,默认)
    const hello = await api.get('/api/hello');

    // 2. 调用 /api/users(JSON,带 path 参数)
    const user = await api.get('/api/users/{id}', {
      params: { path: { id: '1' } }
    });

    // 3. 调用 /api/text(responseType: 'text' → 返回 string)
    const text = await api.get('/api/text', { responseType: 'text' });

    return c.json({
      source: 'internal-fetch',
      hello,
      user,
      textPreview: text.slice(0, 60)
    });
  }
);
