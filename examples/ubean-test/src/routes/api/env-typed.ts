import { defineHandler } from 'ubean/server';
import { EXAMPLE_API_PREFIX, EXAMPLE_APP_TITLE } from 'ubean:env/client';
import { EXAMPLE_PORT, EXAMPLE_REDIS_URL, EXAMPLE_SECRET } from 'ubean:env/server';

/**
 * `ubean:env/*` 端到端夹具（contract: docs/contracts/env-v1.md）。
 *
 * 存在的理由：单测只能证明插件把模块内容拼对了，证明不了真实 `vite build` 会把
 * `.ubean/env.d.ts` 生成出来、两个虚拟模块都能解析、且服务端密钥不进客户端产物。
 * 这个路由把两侧的值都读一遍 —— 类型不对就 typecheck 红，模块没解析就构建红。
 */
export const GET = defineHandler(c => {
  return c.json({
    client: {
      appTitle: EXAMPLE_APP_TITLE,
      apiPrefix: EXAMPLE_API_PREFIX
    },
    server: {
      port: EXAMPLE_PORT,
      portType: typeof EXAMPLE_PORT,
      hasSecret: Boolean(EXAMPLE_SECRET),
      // optional 且 `.env` 里没有 → undefined；有值时也不回显原文
      hasRedisUrl: EXAMPLE_REDIS_URL !== undefined
    }
  });
});
