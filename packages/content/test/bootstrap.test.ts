import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { bootstrapContentFromDisk, queryCollection } from '../src/runtime';
import { scanContentSources } from '../src/scan';

let dir: string | undefined;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('scanContentSources / bootstrapContentFromDisk', () => {
  it('registers collections so queryCollection works without Vite', async () => {
    dir = mkdtempSync(join(tmpdir(), 'ubean-content-boot-'));
    mkdirSync(join(dir, 'content/blog'), { recursive: true });
    writeFileSync(join(dir, 'content/blog/hello.md'), '---\ntitle: Hello\n---\nHi\n');

    const scanned = scanContentSources(dir, {
      sources: { blog: { dir: 'content/blog', prefix: '/blog' } }
    });
    expect(scanned.blog).toHaveLength(1);
    expect(scanned.blog[0]?._path).toBe('/blog/hello');

    bootstrapContentFromDisk(dir, {
      sources: { blog: { dir: 'content/blog', prefix: '/blog' } }
    });
    const q = await queryCollection('blog');
    const docs = await q.find();
    expect(docs).toHaveLength(1);
    expect(docs[0]?.title).toBe('Hello');
  });
});
