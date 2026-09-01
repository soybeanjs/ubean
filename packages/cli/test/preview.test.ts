import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startStaticServer } from '../src/preview';

let root: string;
let publicDir: string;
let server: Server;
let port: number;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'ubean-preview-'));
  publicDir = join(root, 'dist', 'public');

  // 模拟 SSG 构建产物结构
  mkdirSync(join(publicDir, 'assets', 'chunks'), { recursive: true });
  mkdirSync(join(publicDir, 'ui', 'components', 'button'), { recursive: true });
  writeFileSync(join(publicDir, 'index.html'), '<h1>root</h1>');
  writeFileSync(join(publicDir, 'ui', 'components', 'button', 'index.html'), '<h1>button</h1>');
  // 动态路由(如 `[...slug].vue`)产物文件名包含 `...`
  writeFileSync(join(publicDir, 'assets', 'chunks', '_...slug_-Bqlu_Muj.js'), 'export const ok = 1;');
  writeFileSync(join(publicDir, 'assets', 'chunks', 'client-CngkrO61.js'), 'export {};');
  // root 外部的敏感文件,用于验证路径穿越防护
  mkdirSync(join(root, 'secret'), { recursive: true });
  writeFileSync(join(root, 'secret', 'flag.txt'), 'top-secret');

  server = startStaticServer({ root: publicDir, port: 0, host: '127.0.0.1', mode: 'ssg' });
  await new Promise<void>(resolve => server.once('listening', () => resolve()));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('failed to resolve preview server port');
  port = addr.port;
});

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  rmSync(root, { recursive: true, force: true });
});

/** 发送原始请求路径(不经 fetch/URL 规范化),用于验证服务端对路径的原始处理 */
function rawGet(path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method: 'GET' }, res => {
      let body = '';
      res.on('data', chunk => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('startStaticServer (ssg)', () => {
  it('serves index.html at root', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('<h1>root</h1>');
  });

  it('serves nested ssg page index.html', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/ui/components/button/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('<h1>button</h1>');
  });

  it('serves chunk files whose filename contains "..." (catch-all route chunks)', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/assets/chunks/_...slug_-Bqlu_Muj.js`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('export const ok = 1;');
    expect(res.headers.get('content-type')).toContain('text/javascript');
  });

  it('serves regular chunk files', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/assets/chunks/client-CngkrO61.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/javascript');
  });

  it('returns 404 for missing files', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/assets/nope.js`);
    expect(res.status).toBe(404);
  });

  it('rejects encoded path traversal with 400', async () => {
    // `%2f` 为编码的 `/`,绕过 URL 解析的 `..` 折叠,直达服务端路径校验
    const { status, body } = await rawGet('/..%2f..%2fsecret%2fflag.txt');
    expect(status).toBe(400);
    expect(body).toBe('Bad Request');
  });

  it('does not leak files outside the root for raw ".." traversal', async () => {
    // 原始 `..` 会被 URL 解析器折叠为 `/secret/flag.txt`,位于 root 内但不存在 → 404
    const { status, body } = await rawGet('/../../secret/flag.txt');
    expect(status).toBe(404);
    expect(body).not.toContain('top-secret');
  });
});
