/**
 * Hono middleware for the `POST /__server-component` endpoint (Task 9.4).
 *
 * Mounts a single `POST /__server-component` route that re-renders a registered
 * server component with new props and returns the HTML fragment. Used by
 * `defineServerIsland(Component, { rerenderOnPropsChange: true })` on the client
 * to refresh server-rendered content when props change.
 *
 * ## 请求格式
 *
 * ```json
 * POST /__server-component
 * Content-Type: application/json
 *
 * { "path": "/abs/path/Foo.server.vue", "props": { "userId": 123 } }
 * ```
 *
 * ## 响应
 *
 * - 200: HTML 片段 (Content-Type: text/html)
 * - 400: 缺少 `path` 字段
 * - 404: 组件未在注册表中找到 (路径未注册)
 * - 500: 渲染失败
 *
 * 所有响应都带 `x-ubean-server-component: true` 与 `Cache-Control: no-store` 头,
 * 便于客户端与中间件链识别。
 */
import type { MiddlewareHandler } from 'hono';
import { h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import type { UbeanEnv } from '@ubean/types';
import { SERVER_COMPONENT_ENDPOINT, getServerComponent } from './runtime';

// 重新导出常量,让消费者从 `@ubean/islands/server` 即可获取端点路径,
// 无需额外从 `@ubean/islands` 主入口导入。
export { SERVER_COMPONENT_ENDPOINT };

/**
 * 响应头:标识来自 server-component 中间件的响应。
 */
export const SERVER_COMPONENT_RESPONSE_HEADER = 'x-ubean-server-component';

/**
 * 创建 server-component 中间件 — 处理 `POST /__server-component` 请求。
 *
 * 用法 (通常由 `createUbeanApp()` 自动挂载,用户无需手动调用):
 *
 * ```ts
 * import { createUbeanApp } from 'ubean/runtime/app';
 * import { createServerComponentMiddleware, SERVER_COMPONENT_ENDPOINT } from '@ubean/islands/server';
 *
 * const app = createUbeanApp();
 * app.on('POST', SERVER_COMPONENT_ENDPOINT, createServerComponentMiddleware());
 * ```
 */
export function createServerComponentMiddleware(): MiddlewareHandler<UbeanEnv> {
  return async c => {
    const contentType = c.req.header('Content-Type') || '';
    if (!contentType.includes('application/json')) {
      return _htmlError(c, 'Content-Type must be application/json', 400);
    }

    let body: { path?: string; props?: Record<string, unknown> };
    try {
      body = (await c.req.json()) as { path?: string; props?: Record<string, unknown> };
    } catch {
      return _htmlError(c, 'Malformed JSON body', 400);
    }

    const path = body?.path;
    if (!path) {
      return _htmlError(c, 'Missing "path" field', 400);
    }

    const Component = getServerComponent(path);
    if (!Component) {
      return _htmlError(c, `Component not registered for path: ${path}`, 404);
    }

    const props = body?.props ?? {};
    try {
      const html = await renderToString(h(Component, props));
      return c.body(html, 200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        [SERVER_COMPONENT_RESPONSE_HEADER]: 'true'
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return _htmlError(c, `Render failed: ${message}`, 500);
    }
  };
}

/**
 * 检查请求是否指向 server-component 端点。
 *
 * 供路由注册器跳过将该路径注册为普通 API 路由。
 */
export function isServerComponentRequest(c: { req: { path: string; method: string } }): boolean {
  return c.req.method === 'POST' && c.req.path === SERVER_COMPONENT_ENDPOINT;
}

/**
 * 检查响应是否来自 server-component 中间件。
 */
export function isServerComponentResponse(response: Response): boolean {
  return response.headers.get(SERVER_COMPONENT_RESPONSE_HEADER) === 'true';
}

function _htmlError(
  c: Parameters<MiddlewareHandler<UbeanEnv>>[0],
  message: string,
  status: number
) {
  return c.body(message, status as 400, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    [SERVER_COMPONENT_RESPONSE_HEADER]: 'true'
  });
}
