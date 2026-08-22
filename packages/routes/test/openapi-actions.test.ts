import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import type { UbeanEnv } from '@ubean/shared';
import { clearActions, defineAction } from '../src/actions';
import { registerOpenAPIRoutes } from '../src/openapi';

describe('registerOpenAPIRoutes', () => {
  beforeEach(() => {
    clearActions();
  });
  afterEach(() => {
    clearActions();
  });

  it('merges POST /__actions into /_openapi.json', async () => {
    defineAction(async () => 'pong', { name: 'ping', filePath: 'src/actions/ping.ts' });

    const app = new Hono<UbeanEnv>();
    registerOpenAPIRoutes(app);
    const res = await app.request('/_openapi.json');
    expect(res.status).toBe(200);
    const spec = (await res.json()) as {
      paths?: Record<string, { post?: { operationId?: string; description?: string } }>;
    };
    expect(spec.paths?.['/__actions']?.post?.operationId).toBe('ubeanActionsRpc');
    expect(spec.paths?.['/__actions']?.post?.description).toContain('ping');
  });
});
