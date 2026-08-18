/**
 * @ubean/scan 服务端 API 路由 ID 生成单测。
 *
 * `generateRouteName` / `generateLayoutName`(页面路由名)所有权已在
 * `@ubean/vue`(测试随迁),此处仅覆盖服务端专用的 `generateApiRouteId`。
 */
import { describe, it, expect } from 'vitest';
import { generateApiRouteId } from '../src/api-route-id';

describe('generateApiRouteId()', () => {
  it('method 小写 + RouteName', () => {
    expect(generateApiRouteId('GET', '/users')).toBe('getUsers');
    expect(generateApiRouteId('POST', '/users')).toBe('postUsers');
  });

  it('动态参数路径', () => {
    // 处理文件路由语法 [id]，不处理 Hono :id 语法
    expect(generateApiRouteId('DELETE', '/users/[id]')).toBe('deleteUsersId');
  });

  it('根路径', () => {
    expect(generateApiRouteId('GET', '/')).toBe('getIndex');
  });

  it('catch-all 路径', () => {
    expect(generateApiRouteId('GET', '/[...path]')).toBe('getAllPath');
  });

  it('method 大小写不敏感（统一小写）', () => {
    expect(generateApiRouteId('get', '/users')).toBe('getUsers');
    expect(generateApiRouteId('Get', '/users')).toBe('getUsers');
  });
});
