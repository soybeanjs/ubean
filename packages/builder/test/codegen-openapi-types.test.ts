import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { join } from 'pathe';
import { generateOpenApiTypesFromServer } from '../src/codegen/openapi-types';

describe('generateOpenApiTypesFromServer', () => {
  it('generates types from a JSON `/_openapi.json` schema', async () => {
    const schema = { openapi: '3.0.0', info: { title: 'Test', version: '1.0.0' }, paths: {} };
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify(schema), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    });
    // @ts-expect-error 注入 fetch mock
    globalThis.fetch = fetchMock;

    const outDir = await mkdtemp(join(tmpdir(), 'ubean-openapi-'));
    const filePath = await generateOpenApiTypesFromServer('http://localhost:9527', { outDir });
    expect(filePath).toBe(join(outDir, 'openapi.d.ts'));
    const content = await readFile(filePath!, 'utf8');
    expect(content).toContain('export type paths');
  });

  it('returns null (graceful skip) when server responds with HTML instead of JSON (SSG/SPA)', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response('<!doctype html><html></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' }
      });
    });
    // @ts-expect-error 注入 fetch mock
    globalThis.fetch = fetchMock;

    const outDir = await mkdtemp(join(tmpdir(), 'ubean-openapi-html-'));
    const result = await generateOpenApiTypesFromServer('http://localhost:9527', { outDir });
    expect(result).toBeNull();
  });
});
