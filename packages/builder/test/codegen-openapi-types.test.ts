import { existsSync, statSync } from 'node:fs';
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

  // 回归（实测 soybean-agent）：spec 生成失败时 hono-openapi 返回 500 且 body 里带**根因**
  // （`standard-json: Missing dependencies "@valibot/to-json-schema"`）。此前错误信息只有状态码，
  // 用户看到的是「`.ubean/openapi.d.ts` 不存在 + 一片 TS2307」，猜不到是缺依赖。
  it('surfaces the response body when `/_openapi.json` fails, so the root cause is actionable', async () => {
    const body = '{"error":"standard-json: Missing dependencies \\"@valibot/to-json-schema\\".","statusCode":500}';
    const fetchMock = vi.fn(async () => {
      return new Response(body, { status: 500, headers: { 'content-type': 'application/json' } });
    });
    // @ts-expect-error 注入 fetch mock
    globalThis.fetch = fetchMock;

    const outDir = await mkdtemp(join(tmpdir(), 'ubean-openapi-500-'));
    await expect(generateOpenApiTypesFromServer('http://localhost:9527', { outDir })).rejects.toThrow(
      /@valibot\/to-json-schema/
    );
  });
});

describe('generateOpenApiTypes — 原子写', () => {
  it('产物路径上不会出现半截文件：写临时文件后 rename，且不留 .tmp', async () => {
    // 产物要够大，writeFile 才会跨过多个 tick —— 小文件在旧实现下也读不到空档。
    const paths = Object.fromEntries(
      Array.from({ length: 3000 }, (_, i) => [
        `/api/items/${i}`,
        {
          get: {
            responses: { 200: { description: 'ok', content: { 'application/json': { schema: { type: 'object' } } } } }
          }
        }
      ])
    );
    const schema = { openapi: '3.0.0', info: { title: 'Test', version: '1.0.0' }, paths };
    const outDir = await mkdtemp(join(tmpdir(), 'ubean-openapi-atomic-'));
    const filePath = join(outDir, 'openapi.d.ts');

    const { generateOpenApiTypes } = await import('../src/codegen/openapi-types');
    const pending = generateOpenApiTypes(schema, { outDir });

    // 生成期间轮询：产物路径要么不存在，要么已经写满 —— 绝不能是 0 字节。
    // （旧的 writeFile 是「打开即截断」，Windows 上写满能跨过几百毫秒，读者会读到空文件。）
    let sawEmpty = false;
    const poll = setInterval(() => {
      if (existsSync(filePath) && statSync(filePath).size === 0) sawEmpty = true;
    }, 1);
    await pending;
    clearInterval(poll);

    expect(sawEmpty).toBe(false);
    expect(existsSync(filePath)).toBe(true);
    expect(existsSync(`${filePath}.tmp`)).toBe(false);
    expect(await readFile(filePath, 'utf8')).toContain('export interface paths');
  });
});
