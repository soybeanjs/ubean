/**
 * Prerender / SSG 系统测试
 *
 * 覆盖 ubean 的静态站点生成能力,包括:
 * - collectPrerenderRoutes: 收集路由、过滤动态路由、应用 routeRules
 * - extractLinks: 从 HTML 提取内部链接
 * - shouldIgnoreRoute: 忽略规则匹配
 * - definePrerenderRoutes: 声明额外预渲染路由
 * - resolvePrerenderConfig: 配置解析与默认值
 * - prerender(): 完整预渲染流程(写入 HTML 文件、crawlLinks、ignore、failOnError、并发)
 * - generatePrerenderManifest: 生成清单
 * - routeToFilePath / writePrerenderedFile: 文件路径解析与写入
 *
 * 测试策略:
 * - 函数级: 直接调用 ubean 导出的纯函数
 * - HTTP 集成级: 通过 /api/prerender-test?action=xxx 端点验证端到端行为
 */
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  prerender,
  collectPrerenderRoutes,
  extractLinks,
  shouldIgnoreRoute,
  routeToFilePath,
  writePrerenderedFile,
  resolvePrerenderConfig,
  definePrerenderRoutes,
  generatePrerenderManifest
} from 'ubean';
import { getJson } from './helper';

// 模拟一个扫描到的页面路由对象(符合 ScannedPageRoute 形状)
function makePage(path: string, name = ''): any {
  const basename = path.split('/').pop() || 'index';
  return {
    path,
    fullPath: `${path === '/' ? 'index' : path.slice(1)}.vue`,
    relativePath: `${path === '/' ? 'index' : path.slice(1)}.vue`,
    dirname: path === '/' ? '.' : path.slice(1),
    basename: `${basename}.vue`,
    name: name || basename.replace(/[^a-zA-Z0-9]/g, '-'),
    route: path,
    isReuse: false,
    isMarkdown: false
  };
}

describe('Prerender / SSG system', () => {
  describe('collectPrerenderRoutes()', () => {
    it('collects static routes from pages', () => {
      const { routes } = collectPrerenderRoutes([makePage('/'), makePage('/about'), makePage('/contact')], {}, []);
      expect(routes).toContain('/');
      expect(routes).toContain('/about');
      expect(routes).toContain('/contact');
    });

    it('filters out dynamic routes (with [param])', () => {
      const { routes } = collectPrerenderRoutes(
        [makePage('/'), makePage('/user/[id]'), makePage('/blog/[...slug]'), makePage('/about')],
        {},
        []
      );
      expect(routes).toContain('/');
      expect(routes).toContain('/about');
      expect(routes.some(r => r.includes('['))).toBe(false);
    });

    it('filters out routes with :param', () => {
      const { routes } = collectPrerenderRoutes([makePage('/users/:id')], {}, []);
      expect(routes.some(r => r.includes(':'))).toBe(false);
    });

    it('always includes "/" (home) even when no static routes', () => {
      const { routes } = collectPrerenderRoutes([makePage('/user/[id]')], {}, []);
      expect(routes).toContain('/');
    });

    it('adds extra routes from third argument', () => {
      const { routes } = collectPrerenderRoutes([makePage('/')], {}, ['/landing', '/pricing']);
      expect(routes).toContain('/landing');
      expect(routes).toContain('/pricing');
    });

    it('normalizes extra routes to start with /', () => {
      const { routes } = collectPrerenderRoutes([makePage('/')], {}, ['pricing']);
      expect(routes).toContain('/pricing');
    });

    it('applies routeRules with prerender:false to skip routes', () => {
      const { routes, ignoredRoutes } = collectPrerenderRoutes(
        [makePage('/'), makePage('/admin'), makePage('/about')],
        { '/admin/**': { prerender: false } },
        []
      );
      expect(routes).toContain('/');
      expect(routes).toContain('/about');
      expect(ignoredRoutes.has('/admin')).toBe(true);
      expect(routes).not.toContain('/admin');
    });
  });

  describe('extractLinks()', () => {
    it('extracts internal anchor links', () => {
      const html = '<a href="/about">About</a><a href="/contact">Contact</a>';
      const links = extractLinks(html);
      expect(links).toContain('/about');
      expect(links).toContain('/contact');
    });

    it('filters out external http(s) links', () => {
      const html = '<a href="/internal">Internal</a><a href="https://example.com">External</a>';
      const links = extractLinks(html);
      expect(links).toContain('/internal');
      expect(links.some(l => l.startsWith('http'))).toBe(false);
    });

    it('filters out mailto: links', () => {
      const html = '<a href="/page">Page</a><a href="mailto:test@test.com">Email</a>';
      const links = extractLinks(html);
      expect(links.some(l => l.startsWith('mailto'))).toBe(false);
    });

    it('filters out javascript: links', () => {
      const html = '<a href="/page">Page</a><a href="javascript:void(0)">JS</a>';
      const links = extractLinks(html);
      expect(links.some(l => l.startsWith('javascript'))).toBe(false);
    });

    it('filters out # hash-only links', () => {
      const html = '<a href="#section">Hash</a><a href="/real">Real</a>';
      const links = extractLinks(html);
      expect(links.some(l => l.startsWith('#'))).toBe(false);
      expect(links).toContain('/real');
    });

    it('strips query string from links', () => {
      const html = '<a href="/blog/post?ref=home">Blog</a>';
      const links = extractLinks(html);
      expect(links).toContain('/blog/post');
      expect(links.some(l => l.includes('?'))).toBe(false);
    });

    it('strips hash fragment from links', () => {
      const html = '<a href="/contact#form">Contact</a>';
      const links = extractLinks(html);
      expect(links).toContain('/contact');
      expect(links.some(l => l.includes('#'))).toBe(false);
    });

    it('normalizes trailing slash', () => {
      const html = '<a href="/about/">About</a>';
      const links = extractLinks(html);
      expect(links).toContain('/about');
      expect(links.some(l => l.length > 1 && l.endsWith('/'))).toBe(false);
    });

    it('returns unique links (dedup)', () => {
      const html = '<a href="/a">A</a><a href="/a">A2</a><a href="/b">B</a>';
      const links = extractLinks(html);
      expect(links.filter(l => l === '/a')).toHaveLength(1);
    });

    it('treats same-origin absolute URLs as internal', () => {
      const html = '<a href="http://localhost:3000/about">About</a>';
      const links = extractLinks(html, 'http://localhost:3000');
      expect(links).toContain('/about');
    });

    it('returns empty array for html with no anchors', () => {
      const links = extractLinks('<div>no links</div>');
      expect(links).toEqual([]);
    });
  });

  describe('shouldIgnoreRoute()', () => {
    it('matches exact route', () => {
      expect(shouldIgnoreRoute('/api', ['/api'])).toBe(true);
      expect(shouldIgnoreRoute('/api/users', ['/api'])).toBe(false);
    });

    it('matches /api/** multi-segment wildcard', () => {
      expect(shouldIgnoreRoute('/api/users', ['/api/**'])).toBe(true);
      expect(shouldIgnoreRoute('/api/users/123', ['/api/**'])).toBe(true);
      expect(shouldIgnoreRoute('/api', ['/api/**'])).toBe(true);
    });

    it('matches /admin/* single-segment wildcard', () => {
      expect(shouldIgnoreRoute('/admin/dashboard', ['/admin/*'])).toBe(true);
      expect(shouldIgnoreRoute('/admin/users/deep', ['/admin/*'])).toBe(false);
    });

    it('does not match unrelated routes', () => {
      expect(shouldIgnoreRoute('/about', ['/api/**', '/admin/*'])).toBe(false);
      expect(shouldIgnoreRoute('/dashboard', ['/api/**', '/admin/*'])).toBe(false);
    });

    it('handles empty pattern list', () => {
      expect(shouldIgnoreRoute('/any', [])).toBe(false);
    });

    it('handles multiple patterns', () => {
      const patterns = ['/api/**', '/_health', '/admin/*', '/private/**'];
      expect(shouldIgnoreRoute('/api/users', patterns)).toBe(true);
      expect(shouldIgnoreRoute('/_health', patterns)).toBe(true);
      expect(shouldIgnoreRoute('/admin/dashboard', patterns)).toBe(true);
      expect(shouldIgnoreRoute('/private/secret/data', patterns)).toBe(true);
      expect(shouldIgnoreRoute('/about', patterns)).toBe(false);
    });
  });

  describe('definePrerenderRoutes()', () => {
    it('returns the routes array as-is', () => {
      const routes = definePrerenderRoutes(['/landing', '/pricing']);
      expect(routes).toEqual(['/landing', '/pricing']);
    });

    it('returns empty array for empty input', () => {
      expect(definePrerenderRoutes([])).toEqual([]);
    });

    it('preserves route strings (no transformation)', () => {
      const routes = definePrerenderRoutes(['relative-path', '/absolute']);
      expect(routes).toContain('relative-path');
      expect(routes).toContain('/absolute');
    });
  });

  describe('resolvePrerenderConfig()', () => {
    it('returns default config when called with no args', () => {
      const config = resolvePrerenderConfig();
      expect(config.enabled).toBe(false);
      expect(config.concurrency).toBe(4);
      expect(config.failOnError).toBe(false);
      expect(config.crawlLinks).toBe(true);
      expect(config.routes).toEqual([]);
      expect(config.ignore).toEqual([]);
    });

    it('applies custom overrides', () => {
      const config = resolvePrerenderConfig({
        enabled: true,
        concurrency: 8,
        failOnError: true,
        crawlLinks: false,
        routes: ['/extra'],
        ignore: ['/admin/**'],
        staticDir: '.output/static'
      });
      expect(config.enabled).toBe(true);
      expect(config.concurrency).toBe(8);
      expect(config.failOnError).toBe(true);
      expect(config.crawlLinks).toBe(false);
      expect(config.routes).toEqual(['/extra']);
      expect(config.ignore).toEqual(['/admin/**']);
      expect(config.staticDir).toBe('.output/static');
    });

    it('fills undefined fields with defaults', () => {
      const config = resolvePrerenderConfig({ enabled: true });
      expect(config.enabled).toBe(true);
      expect(config.concurrency).toBe(4); // default
      expect(config.failOnError).toBe(false); // default
    });
  });

  describe('routeToFilePath()', () => {
    it('resolves "/" to index.html', () => {
      const path = routeToFilePath('/', '/tmp/output');
      expect(path).toBe(join('/tmp/output', 'index.html'));
    });

    it('resolves "/about" to about/index.html', () => {
      const path = routeToFilePath('/about', '/tmp/output');
      expect(path).toBe(join('/tmp/output', 'about', 'index.html'));
    });

    it('resolves nested route to nested directory', () => {
      const path = routeToFilePath('/dashboard/settings', '/tmp/output');
      expect(path).toBe(join('/tmp/output', 'dashboard', 'settings', 'index.html'));
    });

    it('preserves .html suffix routes', () => {
      const path = routeToFilePath('/custom.html', '/tmp/output');
      expect(path).toBe(join('/tmp/output', 'custom.html'));
    });
  });

  describe('writePrerenderedFile()', () => {
    it('writes HTML content to disk', async () => {
      const tmp = await mkdtemp(join(tmpdir(), 'ubean-prender-write-'));
      try {
        const filePath = join(tmp, 'about', 'index.html');
        await writePrerenderedFile(filePath, '<html><body>about</body></html>');
        const content = await readFile(filePath, 'utf-8');
        expect(content).toBe('<html><body>about</body></html>');
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    });

    it('creates nested directories if missing', async () => {
      const tmp = await mkdtemp(join(tmpdir(), 'ubean-prender-nested-'));
      try {
        const filePath = join(tmp, 'a', 'b', 'c', 'index.html');
        await writePrerenderedFile(filePath, '<html></html>');
        const s = await stat(filePath);
        expect(s.isFile()).toBe(true);
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    });

    it('overwrites existing file', async () => {
      const tmp = await mkdtemp(join(tmpdir(), 'ubean-prender-overwrite-'));
      try {
        const filePath = join(tmp, 'index.html');
        await writePrerenderedFile(filePath, 'v1');
        await writePrerenderedFile(filePath, 'v2');
        const content = await readFile(filePath, 'utf-8');
        expect(content).toBe('v2');
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    });
  });

  describe('prerender() - integration', () => {
    it('returns empty result when disabled', async () => {
      const result = await prerender({
        cwd: '/tmp',
        outputDir: '.output/public',
        pages: [makePage('/')],
        prerender: {
          enabled: false,
          routes: [],
          ignore: [],
          crawlLinks: false,
          concurrency: 1,
          failOnError: false,
          staticDir: '.output/public'
        }
      });
      expect(result.generated).toEqual([]);
      expect(result.errors).toEqual([]);
      expect(result.skipped).toEqual([]);
      expect(result.duration).toBe(0);
    });

    it('writes HTML files for each route using custom fetcher', async () => {
      const tmp = await mkdtemp(join(tmpdir(), 'ubean-prerender-basic-'));
      try {
        const pages = [makePage('/'), makePage('/about')];
        const result = await prerender({
          cwd: tmp,
          outputDir: '.output/public',
          pages,
          prerender: {
            enabled: true,
            routes: [],
            ignore: [],
            crawlLinks: false,
            concurrency: 2,
            failOnError: false,
            staticDir: '.output/public'
          },
          fetcher: async route => ({
            html: `<!DOCTYPE html><html><body>Prerendered: ${route}</body></html>`,
            statusCode: 200
          })
        });

        expect(result.generated).toContain('/');
        expect(result.generated).toContain('/about');
        expect(result.errors).toHaveLength(0);

        const indexContent = await readFile(join(tmp, '.output/public/index.html'), 'utf-8');
        const aboutContent = await readFile(join(tmp, '.output/public/about/index.html'), 'utf-8');
        expect(indexContent).toContain('Prerendered: /');
        expect(aboutContent).toContain('Prerendered: /about');
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    });

    it('writes placeholder HTML when no fetcher is provided', async () => {
      const tmp = await mkdtemp(join(tmpdir(), 'ubean-prerender-placeholder-'));
      try {
        const result = await prerender({
          cwd: tmp,
          outputDir: '.output/public',
          pages: [makePage('/')],
          prerender: {
            enabled: true,
            routes: [],
            ignore: [],
            crawlLinks: false,
            concurrency: 1,
            failOnError: false,
            staticDir: '.output/public'
          }
        });
        expect(result.generated).toContain('/');
        const content = await readFile(join(tmp, '.output/public/index.html'), 'utf-8');
        expect(content).toContain('<html');
        expect(content).toContain('Prerendered content placeholder');
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    });

    it('crawls links and generates additional routes', async () => {
      const tmp = await mkdtemp(join(tmpdir(), 'ubean-prerender-crawl-'));
      try {
        const fetchedRoutes: string[] = [];
        const result = await prerender({
          cwd: tmp,
          outputDir: '.output/public',
          pages: [makePage('/')],
          prerender: {
            enabled: true,
            routes: [],
            ignore: [],
            crawlLinks: true,
            concurrency: 2,
            failOnError: false,
            staticDir: '.output/public'
          },
          fetcher: async route => {
            fetchedRoutes.push(route);
            if (route === '/') {
              return {
                html: `<html><body><a href="/about">About</a><a href="/features">Features</a></body></html>`,
                statusCode: 200
              };
            }
            return { html: `<html><body>${route}</body></html>`, statusCode: 200 };
          }
        });

        expect(fetchedRoutes).toContain('/about');
        expect(fetchedRoutes).toContain('/features');
        expect(result.generated).toContain('/about');
        expect(result.generated).toContain('/features');
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    });

    it('skips routes matching ignore patterns', async () => {
      const tmp = await mkdtemp(join(tmpdir(), 'ubean-prerender-ignore-'));
      try {
        const result = await prerender({
          cwd: tmp,
          outputDir: '.output/public',
          pages: [makePage('/'), makePage('/admin'), makePage('/about')],
          prerender: {
            enabled: true,
            routes: [],
            ignore: ['/admin/**', '/admin'],
            crawlLinks: false,
            concurrency: 2,
            failOnError: false,
            staticDir: '.output/public'
          },
          fetcher: async route => ({ html: `<html>${route}</html>`, statusCode: 200 })
        });
        expect(result.skipped).toContain('/admin');
        expect(result.generated).toContain('/');
        expect(result.generated).toContain('/about');
        expect(result.generated).not.toContain('/admin');
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    });

    it('collects errors but continues when failOnError=false', async () => {
      const tmp = await mkdtemp(join(tmpdir(), 'ubean-prerender-lenient-'));
      try {
        const result = await prerender({
          cwd: tmp,
          outputDir: '.output/public',
          pages: [makePage('/'), makePage('/broken'), makePage('/after-broken')],
          prerender: {
            enabled: true,
            routes: [],
            ignore: [],
            crawlLinks: false,
            concurrency: 1,
            failOnError: false,
            staticDir: '.output/public'
          },
          fetcher: async route => {
            if (route === '/broken') return { html: 'Not Found', statusCode: 404 };
            return { html: `<html>${route}</html>`, statusCode: 200 };
          }
        });
        expect(result.errors.some(e => e.route === '/broken')).toBe(true);
        expect(result.generated).toContain('/');
        expect(result.generated).toContain('/after-broken');
        expect(result.generated).not.toContain('/broken');
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    });

    it('throws on error when failOnError=true', async () => {
      const tmp = await mkdtemp(join(tmpdir(), 'ubean-prerender-strict-'));
      try {
        await expect(
          prerender({
            cwd: tmp,
            outputDir: '.output/public',
            pages: [makePage('/'), makePage('/broken')],
            prerender: {
              enabled: true,
              routes: [],
              ignore: [],
              crawlLinks: false,
              concurrency: 1,
              failOnError: true,
              staticDir: '.output/public'
            },
            fetcher: async route => {
              if (route === '/broken') return { html: 'Not Found', statusCode: 404 };
              return { html: `<html>${route}</html>`, statusCode: 200 };
            }
          })
        ).rejects.toThrow();
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    });

    it('respects concurrency limit', async () => {
      const tmp = await mkdtemp(join(tmpdir(), 'ubean-prerender-conc-'));
      try {
        // Include '/' as one of the 10 pages so collectPrerenderRoutes
        // doesn't auto-add it (which would yield 11 generated routes).
        const pages = [
          makePage('/'),
          ...Array.from({ length: 9 }, (_, i) => makePage(`/page-${i}`))
        ];
        let maxConcurrent = 0;
        let current = 0;

        const result = await prerender({
          cwd: tmp,
          outputDir: '.output/public',
          pages,
          prerender: {
            enabled: true,
            routes: [],
            ignore: [],
            crawlLinks: false,
            concurrency: 3,
            failOnError: false,
            staticDir: '.output/public'
          },
          fetcher: async route => {
            current++;
            maxConcurrent = Math.max(maxConcurrent, current);
            await new Promise(r => setTimeout(r, 30));
            current--;
            return { html: `<html>${route}</html>`, statusCode: 200 };
          }
        });
        expect(maxConcurrent).toBeLessThanOrEqual(3);
        expect(result.generated).toHaveLength(10);
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    });
  });

  describe('generatePrerenderManifest()', () => {
    it('generates manifest with absolute URLs', async () => {
      const tmp = await mkdtemp(join(tmpdir(), 'ubean-prerender-manifest-'));
      try {
        const result = await prerender({
          cwd: tmp,
          outputDir: '.output/public',
          pages: [makePage('/'), makePage('/about')],
          prerender: {
            enabled: true,
            routes: [],
            ignore: [],
            crawlLinks: false,
            concurrency: 2,
            failOnError: false,
            staticDir: '.output/public'
          },
          fetcher: async route => ({ html: `<html>${route}</html>`, statusCode: 200 })
        });
        const manifest = generatePrerenderManifest(result, 'https://example.com');
        expect(manifest.routes.length).toBeGreaterThan(0);
        expect(manifest.routes.every(r => r.startsWith('http'))).toBe(true);
        expect(manifest.generatedAt).toBeDefined();
        expect(Array.isArray(manifest.errors)).toBe(true);
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    });

    it('uses "/" as default baseUrl', async () => {
      const manifest = generatePrerenderManifest({
        routes: [],
        generated: ['/', '/about'],
        errors: [],
        skipped: [],
        duration: 10
      });
      // Default baseUrl is "/", so '/about' becomes '/' + 'about' = '/about'
      expect(manifest.routes[0]).toBe('/');
      expect(manifest.routes[1]).toBe('/about');
    });

    it('includes errors in manifest', () => {
      const manifest = generatePrerenderManifest({
        routes: [],
        generated: [],
        errors: [{ route: '/broken', error: new Error('HTTP 500') }],
        skipped: [],
        duration: 5
      });
      expect(manifest.errors).toHaveLength(1);
      expect(manifest.errors[0].route).toBe('/broken');
      expect(manifest.errors[0].message).toContain('HTTP 500');
    });
  });

  // ==========================================================================
  // HTTP 集成测试 - 通过 /api/prerender-test 验证端到端
  // ==========================================================================
  describe('HTTP integration - /api/prerender-test', () => {
    it('default action returns list of available actions', async () => {
      const res = await getJson('/api/prerender-test');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('actions');
      expect((res.data as { actions: string[] }).actions).toEqual(
        expect.arrayContaining([
          'collectRoutes',
          'extractLinks',
          'shouldIgnore',
          'defineRoutes',
          'resolveConfig',
          'prerender',
          'crawlLinks',
          'ignoreRules',
          'failOnError',
          'manifest',
          'filePath',
          'concurrency'
        ])
      );
    });

    it('action=collectRoutes collects static routes and filters dynamic', async () => {
      const res = await getJson('/api/prerender-test?action=collectRoutes');
      expect(res.status).toBe(200);
      const data = res.data as {
        totalInputPages: number;
        collectedRoutes: string[];
        ignoredRoutes: string[];
        hasDynamicFiltered: boolean;
        hasRoot: boolean;
        hasCustomRoute: boolean;
        hasIgnoredDashboard: boolean;
      };
      expect(data.totalInputPages).toBe(5);
      expect(data.hasDynamicFiltered).toBe(true);
      expect(data.hasRoot).toBe(true);
      expect(data.hasCustomRoute).toBe(true);
      expect(data.hasIgnoredDashboard).toBe(true);
      expect(data.ignoredRoutes).toContain('/dashboard');
      expect(data.collectedRoutes).not.toContain('/dashboard');
    });

    it('action=extractLinks extracts internal links and filters external/hash/mailto', async () => {
      const res = await getJson('/api/prerender-test?action=extractLinks');
      expect(res.status).toBe(200);
      const data = res.data as {
        extractedLinks: string[];
        hasAbout: boolean;
        hasDashboard: boolean;
        hasNoExternal: boolean;
        hasNoHash: boolean;
        hasNoMailto: boolean;
        hasNoJavascript: boolean;
        hasQueryStripped: boolean;
        hasHashStripped: boolean;
        hasTrailingSlashNormalized: boolean;
      };
      expect(data.hasAbout).toBe(true);
      expect(data.hasDashboard).toBe(true);
      expect(data.hasNoExternal).toBe(true);
      expect(data.hasNoHash).toBe(true);
      expect(data.hasNoMailto).toBe(true);
      expect(data.hasNoJavascript).toBe(true);
      expect(data.hasQueryStripped).toBe(true);
      expect(data.hasHashStripped).toBe(true);
      expect(data.hasTrailingSlashNormalized).toBe(true);
    });

    it('action=shouldIgnore matches patterns correctly', async () => {
      const res = await getJson('/api/prerender-test?action=shouldIgnore');
      expect(res.status).toBe(200);
      const data = res.data as { allPassed: boolean; tests: Array<{ passed: boolean }> };
      expect(data.allPassed).toBe(true);
      expect(data.tests.every(t => t.passed)).toBe(true);
    });

    it('action=defineRoutes declares additional routes', async () => {
      const res = await getJson('/api/prerender-test?action=defineRoutes');
      expect(res.status).toBe(200);
      const data = res.data as {
        routes: string[];
        isArray: boolean;
        count: number;
        allStartWithSlash: boolean;
      };
      expect(data.isArray).toBe(true);
      expect(data.count).toBe(3);
      expect(data.allStartWithSlash).toBe(true);
      expect(data.routes).toEqual(['/landing', '/pricing', '/features']);
    });

    it('action=resolveConfig applies defaults and overrides', async () => {
      const res = await getJson('/api/prerender-test?action=resolveConfig');
      expect(res.status).toBe(200);
      const data = res.data as {
        defaultConfig: { enabled: boolean; concurrency: number; failOnError: boolean };
        customConfig: { enabled: boolean; concurrency: number; failOnError: boolean; crawlLinks: boolean };
        defaultsApplied: boolean;
        overridesApplied: boolean;
      };
      expect(data.defaultsApplied).toBe(true);
      expect(data.overridesApplied).toBe(true);
      expect(data.defaultConfig.enabled).toBe(false);
      expect(data.defaultConfig.concurrency).toBe(4);
      expect(data.customConfig.enabled).toBe(true);
      expect(data.customConfig.concurrency).toBe(8);
      expect(data.customConfig.failOnError).toBe(true);
      expect(data.customConfig.crawlLinks).toBe(false);
    });

    it('action=prerender writes HTML files for each route', async () => {
      const res = await getJson('/api/prerender-test?action=prerender');
      expect(res.status).toBe(200);
      const data = res.data as {
        generatedCount: number;
        generatedRoutes: string[];
        errorCount: number;
        indexFileWritten: boolean;
        aboutFileWritten: boolean;
        indexContentLength: number;
        aboutContentLength: number;
      };
      expect(data.generatedCount).toBe(2);
      expect(data.generatedRoutes).toContain('/');
      expect(data.generatedRoutes).toContain('/about');
      expect(data.errorCount).toBe(0);
      expect(data.indexFileWritten).toBe(true);
      expect(data.aboutFileWritten).toBe(true);
      expect(data.indexContentLength).toBeGreaterThan(0);
      expect(data.aboutContentLength).toBeGreaterThan(0);
    });

    it('action=crawlLinks discovers new routes via link crawling', async () => {
      const res = await getJson('/api/prerender-test?action=crawlLinks');
      expect(res.status).toBe(200);
      const data = res.data as {
        fetchedRoutes: string[];
        generatedRoutes: string[];
        crawledAbout: boolean;
        crawledFeatures: boolean;
        totalGenerated: number;
      };
      expect(data.crawledAbout).toBe(true);
      expect(data.crawledFeatures).toBe(true);
      expect(data.fetchedRoutes).toContain('/about');
      expect(data.fetchedRoutes).toContain('/features');
      expect(data.totalGenerated).toBeGreaterThanOrEqual(3);
    });

    it('action=ignoreRules skips routes matching ignore patterns', async () => {
      const res = await getJson('/api/prerender-test?action=ignoreRules');
      expect(res.status).toBe(200);
      const data = res.data as {
        generatedRoutes: string[];
        skippedRoutes: string[];
        adminSkipped: boolean;
        homeGenerated: boolean;
        aboutGenerated: boolean;
      };
      expect(data.adminSkipped).toBe(true);
      expect(data.homeGenerated).toBe(true);
      expect(data.aboutGenerated).toBe(true);
      expect(data.skippedRoutes).toContain('/admin');
      expect(data.generatedRoutes).not.toContain('/admin');
    });

    it('action=failOnError verifies lenient vs strict error handling', async () => {
      const res = await getJson('/api/prerender-test?action=failOnError');
      expect(res.status).toBe(200);
      const data = res.data as {
        lenient: {
          generatedCount: number;
          errorCount: number;
          continuedAfterError: boolean;
          errors: Array<{ route: string; message?: string }>;
        };
        strict: { threwOnError: boolean; errorMessage: string };
      };
      // Lenient mode: continues after error, collects errors
      expect(data.lenient.continuedAfterError).toBe(true);
      expect(data.lenient.errorCount).toBeGreaterThan(0);
      expect(data.lenient.errors.some(e => e.route === '/broken')).toBe(true);
      // Strict mode: throws on error
      expect(data.strict.threwOnError).toBe(true);
      expect(data.strict.errorMessage).toBeTruthy();
    });

    it('action=manifest generates prerender manifest', async () => {
      const res = await getJson('/api/prerender-test?action=manifest');
      expect(res.status).toBe(200);
      const data = res.data as {
        manifest: { routes: string[]; generatedAt: string };
        hasRoutes: boolean;
        hasGeneratedAt: boolean;
        routesAreAbsolute: boolean;
        routeCount: number;
        errorCount: number;
      };
      expect(data.hasRoutes).toBe(true);
      expect(data.hasGeneratedAt).toBe(true);
      expect(data.routesAreAbsolute).toBe(true);
      expect(data.routeCount).toBeGreaterThan(0);
      expect(data.errorCount).toBe(0);
    });

    it('action=filePath resolves routes to file paths and writes files', async () => {
      const res = await getJson('/api/prerender-test?action=filePath');
      expect(res.status).toBe(200);
      const data = res.data as {
        paths: { root: string; about: string; nested: string };
        rootIsIndexHtml: boolean;
        aboutHasIndexHtml: boolean;
        nestedHasIndexHtml: boolean;
        allFilesExist: boolean;
        contentVerified: boolean;
      };
      expect(data.rootIsIndexHtml).toBe(true);
      expect(data.aboutHasIndexHtml).toBe(true);
      expect(data.nestedHasIndexHtml).toBe(true);
      expect(data.allFilesExist).toBe(true);
      expect(data.contentVerified).toBe(true);
    });

    it('action=concurrency respects configured concurrency limit', async () => {
      const res = await getJson('/api/prerender-test?action=concurrency');
      expect(res.status).toBe(200);
      const data = res.data as {
        totalPages: number;
        generatedCount: number;
        maxConcurrentObserved: number;
        concurrencyConfig: number;
        respectedConcurrency: boolean;
      };
      expect(data.concurrencyConfig).toBe(3);
      expect(data.respectedConcurrency).toBe(true);
      expect(data.maxConcurrentObserved).toBeLessThanOrEqual(3);
      expect(data.generatedCount).toBe(10);
    });
  });
});
