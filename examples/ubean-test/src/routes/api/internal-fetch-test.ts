import { defineHandler, createInternalAdapter } from 'ubean';
import { createRequest } from '@soybeanjs/fetch';

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
    const adapter = createInternalAdapter(c);
    const request = createRequest(
      { retry: { retries: 0 }, adapter },
      { isBackendSuccess: () => true }
    );
    const query = Object.fromEntries(new URLSearchParams(c.req.query() as Record<string, string>));
    const data = await request.get(path, { query });

    return c.json({
      action: 'internal-fetch',
      target: path,
      ok: true,
      data
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
