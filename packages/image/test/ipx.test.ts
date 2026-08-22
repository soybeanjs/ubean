import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { serveIpxRequest, resolveLocalImage } from '../src/ipx';

let dir: string;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('serveIpxRequest', () => {
  it('serves a local file with X-IPX-Mode file', async () => {
    dir = mkdtempSync(join(tmpdir(), 'ubean-ipx-'));
    mkdirSync(join(dir, 'public'));
    writeFileSync(join(dir, 'public', 'photo.jpg'), 'fake-jpeg');
    const result = await serveIpxRequest('/_/photo.jpg', { rootDir: dir, staticDir: 'public', isDev: true });
    expect(result.status).toBe(200);
    expect(result.headers['X-IPX-Mode']).toBe('file');
    expect(result.body?.toString()).toBe('fake-jpeg');
  });

  it('rejects path traversal', () => {
    dir = mkdtempSync(join(tmpdir(), 'ubean-ipx-trav-'));
    expect(resolveLocalImage(dir, 'public', '../secret.png')).toBeUndefined();
  });

  it('redirects remote URLs', async () => {
    const result = await serveIpxRequest('/_/https://cdn.example/a.png', { rootDir: '/tmp', isDev: true });
    expect(result.status).toBe(302);
    expect(result.redirect).toBe('https://cdn.example/a.png');
    expect(result.headers['X-IPX-Mode']).toBe('redirect');
  });
});
