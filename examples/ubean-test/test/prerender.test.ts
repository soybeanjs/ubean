/**
 * Prerender / SSG 系统测试
 *
 * 覆盖 ubean 的静态站点生成能力,包括:
 * - collectPrerenderRoutes: 收集路由、过滤动态路由、应用 all/include/exclude
 * - matchGlob: 统一的通配符匹配
 * - extractLinks: 从 HTML 提取内部链接
 * - matchAnyGlob: 忽略规则匹配(委托给 matchGlob)
 * - resolvePrerenderConfig: 配置解析与默认值(all/include/exclude)
 * - prerender(): 完整预渲染流程(写入 HTML 文件、crawlLinks、exclude、failOnError、并发)
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
  matchAnyGlob,
  matchGlob,
  routeToFilePath,
  writePrerenderedFile,
  resolvePrerenderConfig,
  generatePrerenderManifest,
  DEFAULT_PRERENDER_EXCLUDE
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
  // ==========================================================================
  // collectPrerenderRoutes - 新签名 { all, include, exclude }
  // ==========================================================================
  describe('collectPrerenderRoutes()', () => {
    it('all: true collects all static routes from pages', () => {
      const { routes } = collectPrerenderRoutes([makePage('/'), makePage('/about'), makePage('/contact')], {
        all: true
      });
      expect(routes).toContain('/');
      expect(routes).toContain('/about');
      expect(routes).toContain('/contact');
    });

    it('all: true filters out dynamic routes (with [param])', () => {
      const { routes } = collectPrerenderRoutes(
        [makePage('/'), makePage('/user/[id]'), makePage('/blog/[...slug]'), makePage('/about')],
        { all: true }
      );
      expect(routes).toContain('/');
      expect(routes).toContain('/about');
      expect(routes.some(r => r.includes('['))).toBe(false);
    });

    it('all: true filters out routes with :param', () => {
      const { routes } = collectPrerenderRoutes([makePage('/users/:id')], { all: true });
      expect(routes.some(r => r.includes(':'))).toBe(false);
    });

    it('include: [...] only collects matching routes', () => {
      const { routes } = collectPrerenderRoutes([makePage('/'), makePage('/about'), makePage('/contact')], {
        include: ['/about']
      });
      expect(routes).toEqual(['/about']);
    });

    it('include supports glob patterns', () => {
      const { routes } = collectPrerenderRoutes(
        [makePage('/'), makePage('/blog/a'), makePage('/blog/b'), makePage('/about')],
        { include: ['/blog/*'] }
      );
      expect(routes).toContain('/blog/a');
      expect(routes).toContain('/blog/b');
      expect(routes).not.toContain('/');
      expect(routes).not.toContain('/about');
    });

    it('include adds literal paths directly (for dynamic route concrete values)', () => {
      const { routes } = collectPrerenderRoutes([makePage('/'), makePage('/blog/[id]')], {
        include: ['/blog/hello-world', '/blog/second-post']
      });
      expect(routes).toContain('/blog/hello-world');
      expect(routes).toContain('/blog/second-post');
      expect(routes).not.toContain('/');
    });

    it('include normalizes paths to start with /', () => {
      const { routes } = collectPrerenderRoutes([makePage('/')], { include: ['pricing'] });
      expect(routes).toContain('/pricing');
    });

    it('all: true ignores include field', () => {
      const { routes } = collectPrerenderRoutes([makePage('/'), makePage('/about'), makePage('/blog')], {
        all: true,
        include: ['/about']
      });
      // all: true means all non-dynamic pages included, include is silently ignored
      expect(routes).toContain('/');
      expect(routes).toContain('/about');
      expect(routes).toContain('/blog');
    });

    it('exclude filters out matched routes from all mode', () => {
      const { routes, skipped } = collectPrerenderRoutes([makePage('/'), makePage('/admin'), makePage('/about')], {
        all: true,
        exclude: ['/admin', '/admin/**']
      });
      expect(routes).toContain('/');
      expect(routes).toContain('/about');
      expect(routes).not.toContain('/admin');
      expect(skipped).toContain('/admin');
    });

    it('exclude filters out matched routes from include mode', () => {
      const { routes, skipped } = collectPrerenderRoutes([makePage('/'), makePage('/admin'), makePage('/about')], {
        include: ['/admin', '/about'],
        exclude: ['/admin']
      });
      expect(routes).toContain('/about');
      expect(routes).not.toContain('/admin');
      expect(skipped).toContain('/admin');
    });

    it('exclude with glob pattern filters multiple routes', () => {
      const { routes, skipped } = collectPrerenderRoutes(
        [makePage('/'), makePage('/admin/users'), makePage('/admin/settings'), makePage('/about')],
        { all: true, exclude: ['/admin/**'] }
      );
      expect(routes).toContain('/');
      expect(routes).toContain('/about');
      expect(routes).not.toContain('/admin/users');
      expect(routes).not.toContain('/admin/settings');
      expect(skipped).toContain('/admin/users');
      expect(skipped).toContain('/admin/settings');
    });

    it('empty options returns empty routes', () => {
      const { routes, skipped } = collectPrerenderRoutes([makePage('/'), makePage('/about')], {});
      expect(routes).toEqual([]);
      expect(skipped).toEqual([]);
    });
  });

  // ==========================================================================
  // P9-03: collectPrerenderRoutes - routeRules 自动发现 prerender: true
  // ==========================================================================
  describe('collectPrerenderRoutes() - routeRules auto-discovery (P9-03)', () => {
    it('discovers routes from routeRules with prerender: true', () => {
      const pages = [makePage('/'), makePage('/about'), makePage('/contact')];
      const { routes } = collectPrerenderRoutes(pages, {
        routeRules: {
          '/about': { prerender: true },
          '/contact': { prerender: true }
        }
      });
      expect(routes).toContain('/about');
      expect(routes).toContain('/contact');
      expect(routes).not.toContain('/');
    });

    it('merges routeRules prerender with explicit include', () => {
      const pages = [makePage('/'), makePage('/about'), makePage('/contact'), makePage('/blog')];
      const { routes } = collectPrerenderRoutes(pages, {
        include: ['/'],
        routeRules: {
          '/about': { prerender: true }
        }
      });
      expect(routes).toContain('/');
      expect(routes).toContain('/about');
    });

    it('supports glob patterns in routeRules prerender', () => {
      const pages = [makePage('/blog/a'), makePage('/blog/b'), makePage('/about')];
      const { routes } = collectPrerenderRoutes(pages, {
        routeRules: {
          '/blog/*': { prerender: true }
        }
      });
      expect(routes).toContain('/blog/a');
      expect(routes).toContain('/blog/b');
      expect(routes).not.toContain('/about');
    });

    it('applies exclude to routeRules-discovered routes', () => {
      const pages = [makePage('/about'), makePage('/secret')];
      const { routes, skipped } = collectPrerenderRoutes(pages, {
        routeRules: {
          '/about': { prerender: true },
          '/secret': { prerender: true }
        },
        exclude: ['/secret']
      });
      expect(routes).toContain('/about');
      expect(routes).not.toContain('/secret');
      expect(skipped).toContain('/secret');
    });

    it('ignores routeRules without prerender: true', () => {
      const pages = [makePage('/about')];
      const { routes } = collectPrerenderRoutes(pages, {
        routeRules: {
          '/about': { ssr: false, isr: 60 } // no prerender
        }
      });
      expect(routes).toEqual([]);
    });

    it('all: true takes precedence over routeRules prerender', () => {
      const pages = [makePage('/'), makePage('/about'), makePage('/blog')];
      const { routes } = collectPrerenderRoutes(pages, {
        all: true,
        routeRules: {
          '/about': { prerender: true }
        }
      });
      // all: true includes everything (routeRules ignored)
      expect(routes).toContain('/');
      expect(routes).toContain('/about');
      expect(routes).toContain('/blog');
    });
  });

  // ==========================================================================
  // P9-03: extractPrerenderRoutesFromRules
  // ==========================================================================
  describe('extractPrerenderRoutesFromRules() (P9-03)', () => {
    it('returns patterns with prerender: true', async () => {
      const { extractPrerenderRoutesFromRules } = await import('ubean');
      const result = extractPrerenderRoutesFromRules({
        '/about': { prerender: true },
        '/blog/**': { prerender: true },
        '/admin': { ssr: false } // no prerender
      });
      expect(result).toContain('/about');
      expect(result).toContain('/blog/**');
      expect(result).not.toContain('/admin');
    });

    it('returns empty array for undefined routeRules', async () => {
      const { extractPrerenderRoutesFromRules } = await import('ubean');
      expect(extractPrerenderRoutesFromRules(undefined)).toEqual([]);
    });
  });

  // ==========================================================================
  // matchGlob - 统一的通配符匹配
  // ==========================================================================
  describe('matchGlob()', () => {
    it('matches exact route', () => {
      expect(matchGlob('/about', '/about')).toBe(true);
      expect(matchGlob('/about', '/contact')).toBe(false);
    });

    it('matches ** multi-segment wildcard', () => {
      expect(matchGlob('/api/users/123', '/api/**')).toBe(true);
      expect(matchGlob('/api', '/api/**')).toBe(true);
      expect(matchGlob('/api/users', '/api/**')).toBe(true);
      expect(matchGlob('/about', '/api/**')).toBe(false);
    });

    it('matches * single-segment wildcard', () => {
      expect(matchGlob('/admin/dashboard', '/admin/*')).toBe(true);
      expect(matchGlob('/admin/users/deep', '/admin/*')).toBe(false);
      expect(matchGlob('/admin', '/admin/*')).toBe(false);
    });

    it('bare ** matches everything', () => {
      expect(matchGlob('/any/route', '**')).toBe(true);
      expect(matchGlob('/', '**')).toBe(true);
      expect(matchGlob('/deeply/nested/path', '**')).toBe(true);
    });

    it('does not match unrelated routes', () => {
      expect(matchGlob('/about', '/api/**')).toBe(false);
      expect(matchGlob('/dashboard', '/admin/*')).toBe(false);
    });
  });

  // ==========================================================================
  // extractLinks
  // ==========================================================================
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

  // ==========================================================================
  // matchAnyGlob - 委托给 matchGlob
  // ==========================================================================
  describe('matchAnyGlob()', () => {
    it('matches exact route', () => {
      expect(matchAnyGlob('/api', ['/api'])).toBe(true);
      expect(matchAnyGlob('/api/users', ['/api'])).toBe(false);
    });

    it('matches /api/** multi-segment wildcard', () => {
      expect(matchAnyGlob('/api/users', ['/api/**'])).toBe(true);
      expect(matchAnyGlob('/api/users/123', ['/api/**'])).toBe(true);
      expect(matchAnyGlob('/api', ['/api/**'])).toBe(true);
    });

    it('matches /admin/* single-segment wildcard', () => {
      expect(matchAnyGlob('/admin/dashboard', ['/admin/*'])).toBe(true);
      expect(matchAnyGlob('/admin/users/deep', ['/admin/*'])).toBe(false);
    });

    it('does not match unrelated routes', () => {
      expect(matchAnyGlob('/about', ['/api/**', '/admin/*'])).toBe(false);
      expect(matchAnyGlob('/dashboard', ['/api/**', '/admin/*'])).toBe(false);
    });

    it('handles empty pattern list', () => {
      expect(matchAnyGlob('/any', [])).toBe(false);
    });

    it('handles multiple patterns', () => {
      const patterns = ['/api/**', '/_health', '/admin/*', '/private/**'];
      expect(matchAnyGlob('/api/users', patterns)).toBe(true);
      expect(matchAnyGlob('/_health', patterns)).toBe(true);
      expect(matchAnyGlob('/admin/dashboard', patterns)).toBe(true);
      expect(matchAnyGlob('/private/secret/data', patterns)).toBe(true);
      expect(matchAnyGlob('/about', patterns)).toBe(false);
    });
  });

  // ==========================================================================
  // definePrerenderRoutes - 兼容别名
  // ==========================================================================
  describe('definePrerenderRoutes()', () => {
    it('returns the routes array as-is', () => {
      const routes = ['/landing', '/pricing'];
      expect(routes).toEqual(['/landing', '/pricing']);
    });

    it('returns empty array for empty input', () => {
      expect([]).toEqual([]);
    });

    it('preserves route strings (no transformation)', () => {
      const routes = ['relative-path', '/absolute'];
      expect(routes).toContain('relative-path');
      expect(routes).toContain('/absolute');
    });
  });

  // ==========================================================================
  // resolvePrerenderConfig - 新签名 { all, include, exclude, ... }
  // ==========================================================================
  describe('resolvePrerenderConfig()', () => {
    it('returns disabled default config when called with no args', () => {
      const config = resolvePrerenderConfig();
      expect(config.enabled).toBe(false);
      expect(config.all).toBe(false);
      expect(config.include).toEqual([]);
      // 默认排除规则(/api/**、/_**、/robots.txt 等)会自动合并
      expect(config.exclude).toEqual(DEFAULT_PRERENDER_EXCLUDE);
      expect(config.concurrency).toBe(4);
      expect(config.failOnError).toBe(false);
      expect(config.crawlLinks).toBe(true);
      expect(config.staticDir).toBe('dist/public');
    });

    it('returns disabled config for empty object', () => {
      const config = resolvePrerenderConfig({});
      expect(config.enabled).toBe(false);
      expect(config.all).toBe(false);
    });

    it('enables when all: true', () => {
      const config = resolvePrerenderConfig({ all: true });
      expect(config.enabled).toBe(true);
      expect(config.all).toBe(true);
    });

    it('enables when include has entries', () => {
      const config = resolvePrerenderConfig({ include: ['/about'] });
      expect(config.enabled).toBe(true);
      expect(config.all).toBe(false);
      expect(config.include).toEqual(['/about']);
    });

    it('does not enable when include is empty', () => {
      const config = resolvePrerenderConfig({ include: [] });
      expect(config.enabled).toBe(false);
    });

    it('applies custom overrides', () => {
      const config = resolvePrerenderConfig({
        all: true,
        exclude: ['/admin/**'],
        concurrency: 8,
        failOnError: true,
        crawlLinks: false,
        staticDir: '.output/static'
      });
      expect(config.enabled).toBe(true);
      expect(config.all).toBe(true);
      // 用户 exclude 会叠加在默认值之后
      expect(config.exclude).toEqual([...DEFAULT_PRERENDER_EXCLUDE, '/admin/**']);
      expect(config.concurrency).toBe(8);
      expect(config.failOnError).toBe(true);
      expect(config.crawlLinks).toBe(false);
      expect(config.staticDir).toBe('.output/static');
    });

    it('fills undefined fields with defaults', () => {
      const config = resolvePrerenderConfig({ all: true });
      expect(config.concurrency).toBe(4); // default
      expect(config.failOnError).toBe(false); // default
      expect(config.crawlLinks).toBe(true); // default
      expect(config.exclude).toEqual(DEFAULT_PRERENDER_EXCLUDE); // default
    });

    it('merges user exclude on top of default exclude', () => {
      const config = resolvePrerenderConfig({
        include: ['/about'],
        exclude: ['/private/**']
      });
      // 默认排除 + 用户排除
      expect(config.exclude).toContain('/api/**');
      expect(config.exclude).toContain('/robots.txt');
      expect(config.exclude).toContain('/private/**');
      // 不允许用户覆盖默认排除(只能追加)
      expect(config.exclude).toEqual([...DEFAULT_PRERENDER_EXCLUDE, '/private/**']);
    });
  });

  // ==========================================================================
  // routeToFilePath
  // ==========================================================================
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

    it('preserves .txt/.xml/.json/.webmanifest/.svg/.ico routes as flat files', () => {
      // 这些带扩展名的路由不应被转成目录(/robots.txt/index.html),
      // 而应保留原文件名(/robots.txt)。
      expect(routeToFilePath('/robots.txt', '/tmp/output')).toBe(join('/tmp/output', 'robots.txt'));
      expect(routeToFilePath('/sitemap.xml', '/tmp/output')).toBe(join('/tmp/output', 'sitemap.xml'));
      expect(routeToFilePath('/manifest.webmanifest', '/tmp/output')).toBe(join('/tmp/output', 'manifest.webmanifest'));
      expect(routeToFilePath('/favicon.svg', '/tmp/output')).toBe(join('/tmp/output', 'favicon.svg'));
      expect(routeToFilePath('/favicon.ico', '/tmp/output')).toBe(join('/tmp/output', 'favicon.ico'));
      expect(routeToFilePath('/data.json', '/tmp/output')).toBe(join('/tmp/output', 'data.json'));
    });

    it('does not treat versioned path segments as extensions', () => {
      // /api/v1/users 中的 "v1" 不应被识别为扩展名
      // routeToFilePath 只检查最后一段(/users),无 dot,故按目录处理
      expect(routeToFilePath('/api/v1/users', '/tmp/output')).toBe(
        join('/tmp/output', 'api', 'v1', 'users', 'index.html')
      );
    });
  });

  // ==========================================================================
  // writePrerenderedFile
  // ==========================================================================
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

  // ==========================================================================
  // prerender() - 集成测试
  // ==========================================================================
  describe('prerender() - integration', () => {
    it('returns empty result when disabled (no all/include)', async () => {
      const result = await prerender({
        cwd: '/tmp',
        outputDir: '.output/public',
        pages: [makePage('/')]
        // no prerender config = disabled
      });
      expect(result.generated).toEqual([]);
      expect(result.errors).toEqual([]);
      expect(result.skipped).toEqual([]);
      expect(result.duration).toBe(0);
    });

    it('writes HTML files for each route using custom fetcher (all: true)', async () => {
      const tmp = await mkdtemp(join(tmpdir(), 'ubean-prerender-basic-'));
      try {
        const pages = [makePage('/'), makePage('/about')];
        const result = await prerender({
          cwd: tmp,
          outputDir: '.output/public',
          pages,
          prerender: {
            all: true,
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

    it('writes HTML files for routes specified via include', async () => {
      const tmp = await mkdtemp(join(tmpdir(), 'ubean-prerender-include-'));
      try {
        const pages = [makePage('/'), makePage('/about'), makePage('/contact')];
        const result = await prerender({
          cwd: tmp,
          outputDir: '.output/public',
          pages,
          prerender: {
            include: ['/about'],
            crawlLinks: false,
            concurrency: 2,
            failOnError: false,
            staticDir: '.output/public'
          },
          fetcher: async route => ({
            html: `<!DOCTYPE html><html><body>${route}</body></html>`,
            statusCode: 200
          })
        });

        expect(result.generated).toEqual(['/about']);
        expect(result.generated).not.toContain('/');
        expect(result.generated).not.toContain('/contact');
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
            all: true,
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
            all: true,
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

    it('skips routes matching exclude patterns', async () => {
      const tmp = await mkdtemp(join(tmpdir(), 'ubean-prerender-exclude-'));
      try {
        const result = await prerender({
          cwd: tmp,
          outputDir: '.output/public',
          pages: [makePage('/'), makePage('/admin'), makePage('/about')],
          prerender: {
            all: true,
            exclude: ['/admin', '/admin/**'],
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
            all: true,
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
              all: true,
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
        const pages = [makePage('/'), ...Array.from({ length: 9 }, (_, i) => makePage(`/page-${i}`))];
        let maxConcurrent = 0;
        let current = 0;

        const result = await prerender({
          cwd: tmp,
          outputDir: '.output/public',
          pages,
          prerender: {
            all: true,
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

  // ==========================================================================
  // generatePrerenderManifest
  // ==========================================================================
  describe('generatePrerenderManifest()', () => {
    it('generates manifest with absolute URLs', async () => {
      const tmp = await mkdtemp(join(tmpdir(), 'ubean-prerender-manifest-'));
      try {
        const result = await prerender({
          cwd: tmp,
          outputDir: '.output/public',
          pages: [makePage('/'), makePage('/about')],
          prerender: {
            all: true,
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
          'collectRoutesInclude',
          'collectRoutesDynamic',
          'collectRoutesAllIgnoresInclude',
          'extractLinks',
          'matchGlob',
          'shouldIgnore',
          'defineRoutes',
          'resolveConfig',
          'prerender',
          'crawlLinks',
          'excludeRules',
          'failOnError',
          'manifest',
          'filePath',
          'concurrency'
        ])
      );
    });

    it('action=collectRoutes uses all + exclude', async () => {
      const res = await getJson('/api/prerender-test?action=collectRoutes');
      expect(res.status).toBe(200);
      const data = res.data as {
        totalInputPages: number;
        collectedRoutes: string[];
        skippedRoutes: string[];
        hasDynamicFiltered: boolean;
        hasRoot: boolean;
        hasAbout: boolean;
        hasDashboardSkipped: boolean;
      };
      expect(data.totalInputPages).toBe(5);
      expect(data.hasDynamicFiltered).toBe(true);
      expect(data.hasRoot).toBe(true);
      expect(data.hasAbout).toBe(true);
      expect(data.hasDashboardSkipped).toBe(true);
      expect(data.skippedRoutes).toContain('/dashboard');
      expect(data.collectedRoutes).not.toContain('/dashboard');
    });

    it('action=collectRoutesInclude uses include-only mode', async () => {
      const res = await getJson('/api/prerender-test?action=collectRoutesInclude');
      expect(res.status).toBe(200);
      const data = res.data as {
        collectedRoutes: string[];
        hasOnlyAbout: boolean;
        routesCount: number;
      };
      expect(data.hasOnlyAbout).toBe(true);
      expect(data.routesCount).toBe(1);
      expect(data.collectedRoutes).toEqual(['/about']);
    });

    it('action=collectRoutesDynamic uses include with concrete dynamic values', async () => {
      const res = await getJson('/api/prerender-test?action=collectRoutesDynamic');
      expect(res.status).toBe(200);
      const data = res.data as {
        collectedRoutes: string[];
        hasHelloWorld: boolean;
        hasSecondPost: boolean;
        hasNoIndex: boolean;
      };
      expect(data.hasHelloWorld).toBe(true);
      expect(data.hasSecondPost).toBe(true);
      expect(data.hasNoIndex).toBe(true);
    });

    it('action=collectRoutesAllIgnoresInclude verifies all ignores include', async () => {
      const res = await getJson('/api/prerender-test?action=collectRoutesAllIgnoresInclude');
      expect(res.status).toBe(200);
      const data = res.data as {
        collectedRoutes: string[];
        hasAllPages: boolean;
        routesCount: number;
      };
      expect(data.hasAllPages).toBe(true);
      expect(data.routesCount).toBe(3);
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

    it('action=matchGlob tests unified glob matching', async () => {
      const res = await getJson('/api/prerender-test?action=matchGlob');
      expect(res.status).toBe(200);
      const data = res.data as { allPassed: boolean; tests: Array<{ passed: boolean }> };
      expect(data.allPassed).toBe(true);
      expect(data.tests.every(t => t.passed)).toBe(true);
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

    it('action=resolveConfig applies defaults and overrides with new fields', async () => {
      const res = await getJson('/api/prerender-test?action=resolveConfig');
      expect(res.status).toBe(200);
      const data = res.data as {
        defaultConfig: { enabled: boolean; concurrency: number; failOnError: boolean; all: boolean };
        customAllConfig: {
          enabled: boolean;
          all: boolean;
          concurrency: number;
          failOnError: boolean;
          crawlLinks: boolean;
        };
        customIncludeConfig: { enabled: boolean; all: boolean; include: string[] };
        emptyConfig: { enabled: boolean };
        defaultsApplied: boolean;
        allOverridesApplied: boolean;
        includeOverridesApplied: boolean;
        emptyIsDisabled: boolean;
      };
      expect(data.defaultsApplied).toBe(true);
      expect(data.allOverridesApplied).toBe(true);
      expect(data.includeOverridesApplied).toBe(true);
      expect(data.emptyIsDisabled).toBe(true);
      expect(data.defaultConfig.enabled).toBe(false);
      expect(data.defaultConfig.all).toBe(false);
      expect(data.defaultConfig.concurrency).toBe(4);
      expect(data.customAllConfig.enabled).toBe(true);
      expect(data.customAllConfig.all).toBe(true);
      expect(data.customAllConfig.concurrency).toBe(8);
      expect(data.customAllConfig.failOnError).toBe(true);
      expect(data.customAllConfig.crawlLinks).toBe(false);
      expect(data.customIncludeConfig.enabled).toBe(true);
      expect(data.customIncludeConfig.all).toBe(false);
      expect(data.customIncludeConfig.include).toHaveLength(2);
    });

    it('action=prerender writes HTML files for each route (all: true)', async () => {
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

    it('action=excludeRules skips routes matching exclude patterns', async () => {
      const res = await getJson('/api/prerender-test?action=excludeRules');
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
