/**
 * preview 的解析规则与中间件接线（RM-V24）。
 *
 * 这些用例守的是「`vite preview` 能不能真的预览产物」这件事的两个失败面：
 *
 * 1. **静态解析的方言**。spa / ssg 的规则此前只存在于 CLI 的 `startStaticServer` 里；插件侧
 *    若另写一套，两条路径会分叉（`...` 文件名误判成路径穿越就是这么来的）。
 * 2. **生产 handler 的取用面**。预览必须落在 `dist/server/entry.mjs` 的 `createFetchHandler`
 *    上 —— 不是 `server.mjs`（那会再起一个监听端口的服务器，预览的是「服务器」而不是产物），
 *    也不是每次请求重新 import（模块级单例会被反复重建，与生产行为不符）。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPreviewMiddleware, previewMimeType, resolvePreviewFile } from '../src/vite/preview';
import type { PreviewMiddleware } from '../src/vite/preview';

let root: string;
let publicDir: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'ubean-preview-plugin-'));
  publicDir = join(root, 'dist', 'public');
  mkdirSync(join(publicDir, 'assets', 'chunks'), { recursive: true });
  mkdirSync(join(publicDir, 'ui', 'components', 'button'), { recursive: true });
  writeFileSync(join(publicDir, 'index.html'), '<h1>root</h1>');
  writeFileSync(join(publicDir, 'about.html'), '<h1>about</h1>');
  writeFileSync(join(publicDir, 'ui', 'components', 'button', 'index.html'), '<h1>button</h1>');
  // 动态路由产物：文件名含合法的 `...`，历史上被 `includes('..')` 判成穿越
  writeFileSync(join(publicDir, 'assets', 'chunks', '_...slug_-Bqlu_Muj.js'), 'export const ok = 1;');
  mkdirSync(join(root, 'secret'), { recursive: true });
  writeFileSync(join(root, 'secret', 'flag.txt'), 'top-secret');
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('resolvePreviewFile', () => {
  it('根路径命中 index.html', () => {
    expect(resolvePreviewFile(publicDir, '/', 'ssg')).toEqual({
      kind: 'file',
      path: join(publicDir, 'index.html')
    });
  });

  it('ssg：目录路由命中 `<path>/index.html`', () => {
    expect(resolvePreviewFile(publicDir, '/ui/components/button/', 'ssg')).toEqual({
      kind: 'file',
      path: join(publicDir, 'ui', 'components', 'button', 'index.html')
    });
  });

  it('ssg：叶子路由命中 `<path>.html`', () => {
    expect(resolvePreviewFile(publicDir, '/about', 'ssg')).toEqual({
      kind: 'file',
      path: join(publicDir, 'about.html')
    });
  });

  it('spa：未命中的路由回退 index.html（客户端路由接管）', () => {
    expect(resolvePreviewFile(publicDir, '/whatever/deep', 'spa')).toEqual({
      kind: 'file',
      path: join(publicDir, 'index.html')
    });
  });

  it('ssg：未命中的路由是 missing（不是回退、也不是越界）', () => {
    expect(resolvePreviewFile(publicDir, '/whatever/deep', 'ssg')).toEqual({ kind: 'missing' });
  });

  it('文件名含 `...` 的产物不被误判为路径穿越', () => {
    expect(resolvePreviewFile(publicDir, '/assets/chunks/_...slug_-Bqlu_Muj.js', 'ssg')).toEqual({
      kind: 'file',
      path: join(publicDir, 'assets', 'chunks', '_...slug_-Bqlu_Muj.js')
    });
  });

  it('越界路径返回 forbidden（与 missing 区分，对应 400 而非 404）', () => {
    expect(resolvePreviewFile(publicDir, '/../secret/flag.txt', 'ssg')).toEqual({ kind: 'forbidden' });
  });

  it('MIME 推断覆盖产物里出现的类型，未知扩展名回落 octet-stream', () => {
    expect(previewMimeType('/a/b.js')).toContain('text/javascript');
    expect(previewMimeType('/a/b.css')).toContain('text/css');
    expect(previewMimeType('/a/b.woff2')).toBe('font/woff2');
    expect(previewMimeType('/a/b.bin')).toBe('application/octet-stream');
  });
});

/** 起一个中间件并做一次请求（不经过真实 socket，直接调中间件）。 */
async function requestThrough(
  middleware: PreviewMiddleware,
  path: string
): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  const headers: Record<string, string> = {};
  const chunks: string[] = [];
  let status = 0;
  let resolveDone: () => void;
  const done = new Promise<void>(resolve => (resolveDone = resolve));

  // 双桩必须实现 `write` + `end`：`sendWebResponse` 是流式转发的（先 write 再 end），
  // 只实现 `end` 会让它抛 "res.write is not a function" —— 这是测试桩的问题，不是接线的问题。
  const res = {
    setHeader: (key: string, value: string | number) => {
      headers[key.toLowerCase()] = String(value);
    },
    write: (chunk: Uint8Array | string) => {
      chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8'));
      return true;
    },
    end: (body?: string | Buffer) => {
      if (body !== undefined) chunks.push(Buffer.from(body).toString('utf-8'));
      resolveDone();
    }
  } as unknown as ServerResponse;
  Object.defineProperty(res, 'statusCode', {
    get: () => status,
    set: (value: number) => {
      status = value;
    }
  });
  Object.defineProperty(res, 'statusMessage', {
    get: () => '',
    set: () => undefined
  });

  const req = {
    url: path,
    method: 'GET',
    headers: { host: 'localhost' },
    socket: {}
  } as unknown as IncomingMessage;

  middleware(req, res, () => resolveDone());
  await done;
  return { status, body: chunks.join(''), headers };
}

describe('createPreviewMiddleware（fullstack / backend）', () => {
  it('把请求交给产物里的 fetch handler，且 handler 只加载一次', async () => {
    const serverDir = join(root, 'dist', 'server');
    mkdirSync(serverDir, { recursive: true });
    // 伪造产物：模块级计数证明「只加载一次」，与真实 entry.mjs 的模块级单例同形
    writeFileSync(
      join(serverDir, 'entry.mjs'),
      [
        'globalThis.__ubeanPreviewLoads = (globalThis.__ubeanPreviewLoads || 0) + 1;',
        'export default async function createFetchHandler() {',
        '  return async function fetch(req) {',
        '    return new Response(',
        '      JSON.stringify({ url: new URL(req.url).pathname, loads: globalThis.__ubeanPreviewLoads }),',
        '      { headers: { "content-type": "application/json" } }',
        '    );',
        '  };',
        '}'
      ].join('\n')
    );

    const middleware = createPreviewMiddleware({ rootDir: root, outputDir: 'dist', mode: 'backend' });
    const first = await requestThrough(middleware, '/api/hello');
    const second = await requestThrough(middleware, '/api/hello');

    expect(first.status).toBe(200);
    expect(first.headers['content-type']).toContain('application/json');
    expect(JSON.parse(first.body)).toEqual({ url: '/api/hello', loads: 1 });
    // 第二次仍是同一份 handler（模块级单例保留），没有重复 import
    expect(JSON.parse(second.body)).toEqual({ url: '/api/hello', loads: 1 });
  });

  it('产物缺失时返回 500 且提示先构建（预览最常见的失败）', async () => {
    const missingRoot = mkdtempSync(join(tmpdir(), 'ubean-preview-missing-'));
    try {
      const middleware = createPreviewMiddleware({
        rootDir: missingRoot,
        outputDir: 'dist',
        mode: 'fullstack'
      });
      const res = await requestThrough(middleware, '/');
      expect(res.status).toBe(500);
      expect(res.body).toContain('ubean build');
    } finally {
      rmSync(missingRoot, { recursive: true, force: true });
    }
  });
});

describe('createPreviewMiddleware（spa / ssg）', () => {
  it('spa：未知路由回退 index.html', async () => {
    const middleware = createPreviewMiddleware({ rootDir: root, outputDir: 'dist', mode: 'spa' });
    const res = await requestThrough(middleware, '/deep/link');
    expect(res.status).toBe(200);
    expect(res.body).toBe('<h1>root</h1>');
  });

  it('ssg：未命中返回 404，命中的 `<path>.html` 正常返回', async () => {
    const middleware = createPreviewMiddleware({ rootDir: root, outputDir: 'dist', mode: 'ssg' });
    expect((await requestThrough(middleware, '/nope')).status).toBe(404);
    const about = await requestThrough(middleware, '/about');
    expect(about.status).toBe(200);
    expect(about.body).toBe('<h1>about</h1>');
  });

  it('越界路径返回 400（不是 404）', async () => {
    const middleware = createPreviewMiddleware({ rootDir: root, outputDir: 'dist', mode: 'ssg' });
    const res = await requestThrough(middleware, '/..%2f..%2fsecret%2fflag.txt');
    expect(res.status).toBe(400);
    expect(res.body).toBe('Bad Request');
  });
});
