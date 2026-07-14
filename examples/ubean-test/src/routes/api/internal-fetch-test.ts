import { defineHandler, callInternal } from 'ubean';

export const GET = defineHandler(async c => {
  const target = c.req.query('target') || 'hello';

  const targetMap: Record<string, string> = {
    hello: '/api/hello',
    health: '/api/health',
    users: '/api/users',
    env: '/api/env'
  };

  const path = targetMap[target] || target;

  try {
    const result = await callInternal(path, {
      method: 'GET',
      headers: c.req.raw.headers,
      query: Object.fromEntries(new URLSearchParams(c.req.query() as Record<string, string>))
    });

    return c.json({
      action: 'internal-fetch',
      target: path,
      status: result.status,
      ok: result.ok,
      data: result.data,
      headers: Object.fromEntries(result.headers.entries())
    });
  } catch (err) {
    return c.json(
      {
        action: 'internal-fetch',
        target: path,
        error: err instanceof Error ? err.message : String(err)
      },
      500
    );
  }
});
