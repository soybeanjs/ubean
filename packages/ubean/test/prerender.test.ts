import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'pathe';
import {
  collectPrerenderRoutes,
  extractLinks,
  shouldIgnoreRoute,
  routeToFilePath,
  resolvePrerenderConfig,
  prerender,
  writePrerenderedFile,
  generatePrerenderManifest,
  definePrerenderRoutes
} from '../src/core/prerender';
import type { ScannedPageRoute } from '../src/core/routing/types';

function makePage(path: string): ScannedPageRoute {
  return {
    path,
    filePath: `/mock/pages/${path}.vue`,
    name: path.replace(/\//g, '-').replace(/^-/, '') || 'index'
  } as ScannedPageRoute;
}

describe('Prerender utilities', () => {
  describe('resolvePrerenderConfig', () => {
    it('returns defaults when no config provided', () => {
      const config = resolvePrerenderConfig();
      expect(config.enabled).toBe(false);
      expect(config.crawlLinks).toBe(true);
      expect(config.concurrency).toBe(4);
      expect(config.failOnError).toBe(false);
      expect(config.routes).toEqual([]);
    });

    it('merges custom config with defaults', () => {
      const config = resolvePrerenderConfig({
        enabled: true,
        routes: ['/about'],
        concurrency: 2
      });
      expect(config.enabled).toBe(true);
      expect(config.routes).toEqual(['/about']);
      expect(config.concurrency).toBe(2);
      expect(config.crawlLinks).toBe(true);
    });
  });

  describe('collectPrerenderRoutes', () => {
    it('collects static page routes', () => {
      const pages = [makePage('index'), makePage('about'), makePage('contact')];
      const { routes } = collectPrerenderRoutes(pages);
      expect(routes).toContain('/');
      expect(routes).toContain('/about');
      expect(routes).toContain('/contact');
    });

    it('excludes dynamic routes with params', () => {
      const pages = [makePage('index'), makePage('users/[id]'), makePage('posts/[slug]/comments')];
      const { routes } = collectPrerenderRoutes(pages);
      expect(routes).toContain('/');
      expect(routes).not.toContain('/users/[id]');
      expect(routes).not.toContain('/posts/[slug]/comments');
    });

    it('includes routes from routeRules with prerender: true', () => {
      const pages = [makePage('index')];
      const routeRules = { '/blog/**': { prerender: true as const } };
      const { routes } = collectPrerenderRoutes(pages, routeRules);
      expect(routes).toContain('/');
      expect(routes).toContain('/blog');
    });

    it('excludes routes with prerender: false', () => {
      const pages = [makePage('index'), makePage('admin/dashboard')];
      const routeRules = { '/admin/**': { prerender: false as const } };
      const { routes } = collectPrerenderRoutes(pages, routeRules);
      expect(routes).toContain('/');
      expect(routes).not.toContain('/admin/dashboard');
    });

    it('includes extra routes', () => {
      const pages = [makePage('index')];
      const { routes } = collectPrerenderRoutes(pages, {}, ['/extra', '/landing']);
      expect(routes).toContain('/');
      expect(routes).toContain('/extra');
      expect(routes).toContain('/landing');
    });

    it('always includes / when pages exist', () => {
      const pages = [makePage('about')];
      const { routes } = collectPrerenderRoutes(pages);
      expect(routes).toContain('/');
      expect(routes).toContain('/about');
    });
  });

  describe('extractLinks', () => {
    it('extracts internal links from HTML', () => {
      const html = `
        <a href="/">Home</a>
        <a href="/about">About</a>
        <a href="/contact">Contact</a>
      `;
      const links = extractLinks(html);
      expect(links).toContain('/');
      expect(links).toContain('/about');
      expect(links).toContain('/contact');
    });

    it('ignores external links', () => {
      const html = `<a href="https://example.com">External</a><a href="/internal">Internal</a>`;
      const links = extractLinks(html);
      expect(links).not.toContain('https://example.com');
      expect(links).toContain('/internal');
    });

    it('ignores hash/anchor/mailto links', () => {
      const html = `<a href="#section">Anchor</a><a href="mailto:test@test.com">Email</a><a href="tel:123">Tel</a>`;
      const links = extractLinks(html);
      expect(links).toHaveLength(0);
    });

    it('strips query strings and hashes', () => {
      const html = `<a href="/page?foo=bar#hash">Page</a>`;
      const links = extractLinks(html);
      expect(links).toContain('/page');
    });
  });

  describe('shouldIgnoreRoute', () => {
    it('matches exact routes', () => {
      expect(shouldIgnoreRoute('/api/health', ['/api/health'])).toBe(true);
      expect(shouldIgnoreRoute('/about', ['/api/**'])).toBe(false);
    });

    it('matches wildcard patterns', () => {
      expect(shouldIgnoreRoute('/api/users', ['/api/**'])).toBe(true);
      expect(shouldIgnoreRoute('/api/users/123', ['/api/**'])).toBe(true);
      expect(shouldIgnoreRoute('/about', ['/api/**'])).toBe(false);
    });

    it('matches single segment wildcards', () => {
      expect(shouldIgnoreRoute('/users/123', ['/users/*'])).toBe(true);
      expect(shouldIgnoreRoute('/users/123/posts', ['/users/*'])).toBe(false);
    });
  });

  describe('routeToFilePath', () => {
    it('maps root to index.html', () => {
      expect(routeToFilePath('/', '/output')).toBe(join('/output', 'index.html'));
    });

    it('maps paths to directory/index.html', () => {
      expect(routeToFilePath('/about', '/output')).toBe(join('/output', 'about', 'index.html'));
      expect(routeToFilePath('/blog/post-1', '/output')).toBe(join('/output', 'blog/post-1', 'index.html'));
    });
  });

  describe('definePrerenderRoutes', () => {
    it('returns the routes array as-is', () => {
      const routes = definePrerenderRoutes(['/a', '/b', '/c']);
      expect(routes).toEqual(['/a', '/b', '/c']);
    });
  });
});

describe('writePrerenderedFile', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ubean-prerender-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('writes HTML files to disk', async () => {
    const filePath = join(tmpDir, 'test', 'page.html');
    await writePrerenderedFile(filePath, '<h1>Hello</h1>');
    const content = await readFile(filePath, 'utf-8');
    expect(content).toBe('<h1>Hello</h1>');
  });

  it('creates nested directories', async () => {
    const filePath = join(tmpDir, 'a', 'b', 'c', 'page.html');
    await writePrerenderedFile(filePath, '<p>deep</p>');
    const content = await readFile(filePath, 'utf-8');
    expect(content).toBe('<p>deep</p>');
  });
});

describe('prerender function', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ubean-prerender-run-'));
    await mkdir(join(tmpDir, '.output', 'public'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('does nothing when prerender is disabled', async () => {
    const result = await prerender({
      cwd: tmpDir,
      outputDir: join(tmpDir, '.output/public'),
      pages: [makePage('index')],
      prerender: { enabled: false }
    });
    expect(result.generated).toHaveLength(0);
  });

  it('generates placeholder pages when no fetcher provided', async () => {
    const result = await prerender({
      cwd: tmpDir,
      outputDir: join(tmpDir, '.output/public'),
      pages: [makePage('index'), makePage('about')],
      prerender: { enabled: true, crawlLinks: false, concurrency: 1 }
    });
    expect(result.generated).toContain('/');
    expect(result.generated).toContain('/about');
    expect(result.errors).toHaveLength(0);
    expect(result.duration).toBeGreaterThanOrEqual(0);

    const indexHtml = await readFile(join(tmpDir, '.output', 'public', 'index.html'), 'utf-8');
    expect(indexHtml).toContain('/');
  });

  it('uses fetcher to get HTML content', async () => {
    const htmlMap: Record<string, string> = {
      '/': '<html><body><a href="/about">About</a></body></html>',
      '/about': '<html><body><a href="/">Home</a></body></html>'
    };

    const result = await prerender({
      cwd: tmpDir,
      outputDir: join(tmpDir, '.output/public'),
      pages: [makePage('index')],
      prerender: { enabled: true, crawlLinks: true, concurrency: 2 },
      fetcher: async (url: string) => ({ html: htmlMap[url] || 'not found', statusCode: 200 })
    });

    expect(result.generated).toContain('/');
    expect(result.generated).toContain('/about');

    const aboutHtml = await readFile(join(tmpDir, '.output', 'public', 'about', 'index.html'), 'utf-8');
    expect(aboutHtml).toContain('Home');
  });

  it('handles errors gracefully', async () => {
    const result = await prerender({
      cwd: tmpDir,
      outputDir: join(tmpDir, '.output/public'),
      pages: [makePage('index'), makePage('error')],
      prerender: { enabled: true, crawlLinks: false, concurrency: 1, failOnError: false },
      fetcher: async (url: string) => {
        if (url === '/error') return { html: 'error', statusCode: 500 };
        return { html: '<html></html>', statusCode: 200 };
      }
    });
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('skips ignored routes', async () => {
    const result = await prerender({
      cwd: tmpDir,
      outputDir: join(tmpDir, '.output/public'),
      pages: [makePage('index'), makePage('api/health')],
      prerender: { enabled: true, crawlLinks: false, concurrency: 1, ignore: ['/api/**'] }
    });
    expect(result.generated).toContain('/');
    expect(result.skipped).toContain('/api/health');
  });
});

describe('generatePrerenderManifest', () => {
  it('generates a manifest object', () => {
    const manifest = generatePrerenderManifest({
      routes: [],
      generated: ['/', '/about', '/contact'],
      errors: [],
      skipped: [],
      duration: 100
    });
    expect(manifest.routes).toContain('/');
    expect(manifest.routes).toContain('/about');
    expect(manifest.generatedAt).toBeDefined();
    expect(manifest.errors).toHaveLength(0);
  });

  it('includes errors in manifest', () => {
    const manifest = generatePrerenderManifest({
      routes: [],
      generated: ['/'],
      errors: [{ route: '/broken', error: new Error('fail') }],
      skipped: [],
      duration: 50
    });
    expect(manifest.errors).toHaveLength(1);
    expect(manifest.errors[0].message).toBe('fail');
  });
});
