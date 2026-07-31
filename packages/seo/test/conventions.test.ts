import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
/**
 * P9-05 文件约定 SEO 单元测试
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  SEO_CONVENTIONS,
  listSeoConventions,
  registerSeoConventions,
  discoverSeoConventions
} from '../src/conventions';
import type { SeoConventionApp, SeoConventionContext } from '../src/conventions';

describe('P9-05 SEO conventions', () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'ubean-seo-conv-'));
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  describe('SEO_CONVENTIONS descriptor', () => {
    it('covers all expected convention kinds', () => {
      const kinds = SEO_CONVENTIONS.map(c => c.kind);
      expect(kinds).toContain('sitemap');
      expect(kinds).toContain('robots');
      expect(kinds).toContain('manifest');
      expect(kinds).toContain('opengraph-image');
      expect(kinds).toContain('icon');
      expect(kinds).toContain('apple-icon');
    });

    it('sitemap maps to /sitemap.xml', () => {
      const sitemap = SEO_CONVENTIONS.find(c => c.kind === 'sitemap');
      expect(sitemap?.routePath).toBe('/sitemap.xml');
      expect(sitemap?.contentType).toContain('xml');
    });

    it('robots maps to /robots.txt', () => {
      const robots = SEO_CONVENTIONS.find(c => c.kind === 'robots');
      expect(robots?.routePath).toBe('/robots.txt');
      expect(robots?.contentType).toContain('text/plain');
    });

    it('manifest maps to /manifest.webmanifest', () => {
      const manifest = SEO_CONVENTIONS.find(c => c.kind === 'manifest');
      expect(manifest?.routePath).toBe('/manifest.webmanifest');
      expect(manifest?.contentType).toContain('manifest+json');
    });
  });

  describe('listSeoConventions', () => {
    it('returns empty array when srcDir has no convention files', () => {
      const found = listSeoConventions({ srcDir: tmpRoot });
      expect(found).toEqual([]);
    });

    it('detects existing sitemap.ts', async () => {
      await writeFile(join(tmpRoot, 'sitemap.ts'), 'export default () => []');
      const found = listSeoConventions({ srcDir: tmpRoot });
      expect(found).toContain('sitemap');
    });

    it('detects multiple conventions', async () => {
      await writeFile(join(tmpRoot, 'robots.ts'), 'export default () => ({})');
      await writeFile(join(tmpRoot, 'manifest.ts'), 'export default () => ({})');
      const found = listSeoConventions({ srcDir: tmpRoot });
      expect(found).toContain('robots');
      expect(found).toContain('manifest');
      expect(found).not.toContain('sitemap');
    });

    it('respects custom extensions', async () => {
      await writeFile(join(tmpRoot, 'sitemap.mjs'), 'export default () => []');
      const found = listSeoConventions({ srcDir: tmpRoot, extensions: ['.mjs'] });
      expect(found).toContain('sitemap');
    });
  });

  describe('discoverSeoConventions', () => {
    it('returns empty array when no convention files exist', async () => {
      const loaded = await discoverSeoConventions({ srcDir: tmpRoot });
      expect(loaded).toEqual([]);
    });

    it('loads sitemap handler from .ts file', async () => {
      await writeFile(join(tmpRoot, 'sitemap.ts'), 'export default () => [{ loc: "https://example.com" }]');
      const loaded = await discoverSeoConventions({ srcDir: tmpRoot });
      expect(loaded).toHaveLength(1);
      expect(loaded[0].descriptor.kind).toBe('sitemap');
      expect(typeof loaded[0].handler).toBe('function');
    });

    it('skips files with non-function default export', async () => {
      await writeFile(join(tmpRoot, 'sitemap.ts'), 'export default { not: "a function" }');
      const loaded = await discoverSeoConventions({ srcDir: tmpRoot });
      expect(loaded).toEqual([]);
    });

    it('respects disabled list', async () => {
      await writeFile(join(tmpRoot, 'sitemap.ts'), 'export default () => []');
      await writeFile(join(tmpRoot, 'robots.ts'), 'export default () => ({})');
      const loaded = await discoverSeoConventions({
        srcDir: tmpRoot,
        disabled: ['sitemap']
      });
      expect(loaded.map(l => l.descriptor.kind)).toEqual(['robots']);
    });

    it('respects enabled list', async () => {
      await writeFile(join(tmpRoot, 'sitemap.ts'), 'export default () => []');
      await writeFile(join(tmpRoot, 'robots.ts'), 'export default () => ({})');
      const loaded = await discoverSeoConventions({
        srcDir: tmpRoot,
        enabled: ['sitemap']
      });
      expect(loaded.map(l => l.descriptor.kind)).toEqual(['sitemap']);
    });
  });

  describe('registerSeoConventions', () => {
    function makeFakeApp(): SeoConventionApp & {
      routes: Map<string, (c: SeoConventionContext) => unknown>;
    } {
      const routes = new Map<string, (c: SeoConventionContext) => unknown>();
      return {
        routes,
        get(path: string, handler: (c: SeoConventionContext) => unknown) {
          routes.set(path, handler);
        }
      };
    }

    it('registers GET /sitemap.xml when sitemap.ts exists', async () => {
      await writeFile(join(tmpRoot, 'sitemap.ts'), 'export default () => [{ loc: "https://example.com" }]');
      const app = makeFakeApp();
      const registered = await registerSeoConventions(app, { srcDir: tmpRoot });
      expect(registered).toContain('sitemap');
      expect(app.routes.has('/sitemap.xml')).toBe(true);
    });

    it('sitemap handler returns XML response', async () => {
      await writeFile(join(tmpRoot, 'sitemap.ts'), 'export default () => [{ loc: "https://example.com" }]');
      const app = makeFakeApp();
      await registerSeoConventions(app, { srcDir: tmpRoot });
      const handler = app.routes.get('/sitemap.xml')!;
      const res = (await handler({
        req: { method: 'GET', path: '/sitemap.xml', url: 'http://localhost/sitemap.xml' }
      })) as Response;
      expect(res).toBeInstanceOf(Response);
      expect(res.headers.get('Content-Type')).toContain('xml');
      const body = await res.text();
      expect(body).toContain('<urlset');
      expect(body).toContain('https://example.com');
    });

    it('robots handler returns text/plain response', async () => {
      await writeFile(join(tmpRoot, 'robots.ts'), 'export default () => ({ userAgent: "*", allow: "/" })');
      const app = makeFakeApp();
      await registerSeoConventions(app, { srcDir: tmpRoot });
      const handler = app.routes.get('/robots.txt')!;
      const res = (await handler({
        req: { method: 'GET', path: '/robots.txt', url: 'http://localhost/robots.txt' }
      })) as Response;
      expect(res.headers.get('Content-Type')).toContain('text/plain');
      const body = await res.text();
      expect(body).toContain('User-agent: *');
    });

    it('manifest handler returns manifest+json response', async () => {
      await writeFile(join(tmpRoot, 'manifest.ts'), 'export default () => ({ name: "Test App", short_name: "Test" })');
      const app = makeFakeApp();
      await registerSeoConventions(app, { srcDir: tmpRoot });
      const handler = app.routes.get('/manifest.webmanifest')!;
      const res = (await handler({
        req: { method: 'GET', path: '/manifest.webmanifest', url: 'http://localhost/manifest.webmanifest' }
      })) as Response;
      expect(res.headers.get('Content-Type')).toContain('manifest+json');
      const data = JSON.parse(await res.text());
      expect(data.name).toBe('Test App');
    });

    it('opengraph-image handler returns Response as-is', async () => {
      await writeFile(
        join(tmpRoot, 'opengraph-image.ts'),
        'export default () => new Response("png-bytes", { headers: { "Content-Type": "image/png" } })'
      );
      const app = makeFakeApp();
      await registerSeoConventions(app, { srcDir: tmpRoot });
      const handler = app.routes.get('/opengraph-image')!;
      const res = (await handler({
        req: { method: 'GET', path: '/opengraph-image', url: 'http://localhost/opengraph-image' }
      })) as Response;
      expect(res.headers.get('Content-Type')).toBe('image/png');
      // Should have default Cache-Control applied
      expect(res.headers.get('Cache-Control')).toContain('public');
    });

    it('returns 500 when image handler returns non-Response', async () => {
      await writeFile(join(tmpRoot, 'icon.ts'), 'export default () => "not a response"');
      const app = makeFakeApp();
      await registerSeoConventions(app, { srcDir: tmpRoot });
      const handler = app.routes.get('/icon')!;
      const res = (await handler({ req: { method: 'GET', path: '/icon', url: 'http://localhost/icon' } })) as Response;
      expect(res.status).toBe(500);
    });

    it('does not register anything when no convention files exist', async () => {
      const app = makeFakeApp();
      const registered = await registerSeoConventions(app, { srcDir: tmpRoot });
      expect(registered).toEqual([]);
      expect(app.routes.size).toBe(0);
    });
  });
});
