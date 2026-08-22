import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverContentPageRoutes, extractContentPageRoutes } from '../src/routing';

let dir: string | undefined;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('extractContentPageRoutes', () => {
  it('maps collection paths onto a file-route prefix', () => {
    const routes = extractContentPageRoutes(
      [
        { _path: '/hello', _draft: false, _partial: false },
        { _path: '/draft', _draft: true, _partial: false },
        { _path: '/partial', _draft: false, _partial: true }
      ],
      { prefix: '/blog' }
    );
    expect(routes).toEqual(['/blog/hello']);
  });

  it('can include drafts', () => {
    const routes = extractContentPageRoutes([{ _path: '/x', _draft: true, _partial: false }], {
      prefix: '/posts',
      includeDrafts: true
    });
    expect(routes).toEqual(['/posts/x']);
  });
});

describe('discoverContentPageRoutes', () => {
  it('walks markdown sources and prefixes URLs', () => {
    dir = mkdtempSync(join(tmpdir(), 'ubean-content-routes-'));
    mkdirSync(join(dir, 'content/blog'), { recursive: true });
    writeFileSync(join(dir, 'content/blog/hello.md'), '---\ntitle: Hello\n---\nHi\n');
    const routes = discoverContentPageRoutes(dir, {
      sources: { blog: { dir: 'content/blog', prefix: '/blog' } }
    });
    expect(routes).toEqual(['/blog/hello']);
  });
});
