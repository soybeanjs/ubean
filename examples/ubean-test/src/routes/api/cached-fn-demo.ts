import { cacheLife, cacheTag, defineCachedFunction, defineHandler, revalidateTag } from 'ubean/server';

/**
 * 组件级缓存（P9-08）：`defineCachedFunction` 包装的函数按 `name + args` 缓存返回值，
 * `cacheLife()` / `cacheTag()` 在函数体内通过 AsyncLocalStorage 设置作用域（TTL 与标签），
 * `revalidateTag()` 可按标签精确失效。
 *
 * 走查用法：GET 两次拿同一个 token；GET `?action=revalidate` 清掉标签；再 GET 拿到新 token。
 */
const getToken = defineCachedFunction(
  async () => {
    cacheLife(60);
    cacheTag('cached-fn-demo');
    return { token: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
  },
  { name: 'cached-fn-demo' }
);

export const GET = defineHandler(async c => {
  if (c.req.query('action') === 'revalidate') {
    const removed = await revalidateTag('cached-fn-demo');
    return c.json({ removed });
  }
  return c.json(await getToken());
});
