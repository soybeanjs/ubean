/**
 * prender 预渲染/SSG 纯逻辑测试（L1）。
 *
 * 本文件是「L2 → L1 下沉」的一部分：把原先只存在于
 * `examples/ubean-test/test/prerender.test.ts`（L2）里的**函数级**用例搬到这里，
 * 让它们在包自己的单测层就能跑（不需要起示例项目、不需要 HTTP）。
 *
 * 只保留 L2 的是「只有 HTTP 层能证明的东西」：`/api/prerender-test` 端点可路由、
 * 状态码、响应形状。判据与 `packages/server/test/*-l1.test.ts` 一致。
 *
 * 不在本文件的符号（已有 L1 覆盖，L2 侧直接删）：
 * - `matchGlob` / `matchAnyGlob` → `packages/shared/test/glob.test.ts`（18 例，含全部形状）
 * - `resolvePrerenderConfig` / `DEFAULT_PRERENDER_EXCLUDE` →
 *   `packages/config/test/resolvers.test.ts`
 * - `routeToDataFilePath` / `extractDataPayload` / `writePrerenderedFile` 的 payload 语义 →
 *   `packages/builder/test/prerender-payload.test.ts`
 *
 * 本文件补的是 L1 此前 **0 命中** 的符号：`extractLinks`、`generatePrerenderManifest`、
 * `extractPrerenderRoutesFromRules`，以及 `collectPrerenderRoutes` / `prerender()` 的
 * 完整分支（L1 原先只有 1 + 5 例）。
 */
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, it, expect } from 'vitest';
import { DATA_PAYLOAD_ID } from '@ubean/pages';
import type { ScannedPageRoute } from '@ubean/scan';
// pathe（不是 node:path）：`routeToFilePath` / `prerender()` 内部走 pathe，断言必须同形态。
import { join } from 'pathe';
import {
  prerender,
  collectPrerenderRoutes,
  extractLinks,
  extractPrerenderRoutesFromRules,
  routeToFilePath,
  writePrerenderedFile,
  generatePrerenderManifest
} from '../src/prerender';

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** 模拟一个扫描到的页面路由对象（符合 ScannedPageRoute 形状）。 */
function makePage(path: string, name = ''): ScannedPageRoute {
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
  } as ScannedPageRoute;
}

/** 建一个临时输出目录并在测试结束时清掉。 */
async function withTmp(prefix: string, fn: (tmp: string, out: string) => Promise<void>): Promise<void> {
  const tmp = await mkdtemp(join(tmpdir(), prefix));
  try {
    await fn(tmp, '.output/public');
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/* -------------------------------------------------------------------------- */
/* collectPrerenderRoutes                                                      */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* collectPrerenderRoutes + routeRules 自动发现（P9-03/04）                     */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* extractPrerenderRoutesFromRules（P9-03 + P9-04）                             */
/* -------------------------------------------------------------------------- */

describe('extractPrerenderRoutesFromRules() (P9-03)', () => {
  it('returns patterns with prerender: true', () => {
    const result = extractPrerenderRoutesFromRules({
      '/about': { prerender: true },
      '/blog/**': { prerender: true },
      '/admin': { ssr: false } // no prerender
    });
    expect(result).toContain('/about');
    expect(result).toContain('/blog/**');
    expect(result).not.toContain('/admin');
  });

  it('returns empty array for undefined routeRules', () => {
    expect(extractPrerenderRoutesFromRules(undefined)).toEqual([]);
  });

  // P9-04: `ppr: true` implies `prerender: true` (static shell generation)
  it('discovers routes with ppr: true (P9-04 implies prerender)', () => {
    const result = extractPrerenderRoutesFromRules({
      '/dashboard': { ppr: true },
      '/dashboard/stats': { ppr: true },
      '/about': { prerender: true },
      '/admin': { ssr: false } // neither prerender nor ppr
    });
    expect(result).toContain('/dashboard');
    expect(result).toContain('/dashboard/stats');
    expect(result).toContain('/about');
    expect(result).not.toContain('/admin');
  });
});

/* -------------------------------------------------------------------------- */
/* extractLinks                                                                */
/* -------------------------------------------------------------------------- */

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

  it('filters out mailto: links (exact result)', () => {
    const html = '<a href="/page">Page</a><a href="mailto:test@test.com">Email</a>';
    // 精确结果而非「不含 mailto 前缀」：后者对「过滤后误留其它垃圾值」无感
    expect(extractLinks(html)).toEqual(['/page']);
  });

  it('filters out javascript: / tel: / protocol-relative links (exact result)', () => {
    const html =
      '<a href="/page">Page</a><a href="javascript:void(0)">JS</a>' +
      '<a href="tel:+123">Tel</a><a href="//cdn.example.com/x">Proto-rel</a>';
    expect(extractLinks(html)).toEqual(['/page']);
  });

  it('filters out # hash-only links (exact result)', () => {
    // 精确结果：只把 `#section` 从过滤清单里去掉会得到 `['/', '/real']`（normalizeHref
    // 把空路径归一成 `/`），「不含 # 前缀」的断言抓不到这个退化。
    const html = '<a href="#section">Hash</a><a href="/real">Real</a>';
    expect(extractLinks(html)).toEqual(['/real']);
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

/* -------------------------------------------------------------------------- */
/* routeToFilePath                                                             */
/* -------------------------------------------------------------------------- */

describe('routeToFilePath()', () => {
  it('resolves "/" to index.html', () => {
    expect(routeToFilePath('/', '/tmp/output')).toBe(join('/tmp/output', 'index.html'));
  });

  it('resolves "/about" to about/index.html', () => {
    expect(routeToFilePath('/about', '/tmp/output')).toBe(join('/tmp/output', 'about', 'index.html'));
  });

  it('resolves nested route to nested directory', () => {
    expect(routeToFilePath('/dashboard/settings', '/tmp/output')).toBe(
      join('/tmp/output', 'dashboard', 'settings', 'index.html')
    );
  });

  it('preserves .html suffix routes', () => {
    expect(routeToFilePath('/custom.html', '/tmp/output')).toBe(join('/tmp/output', 'custom.html'));
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

/* -------------------------------------------------------------------------- */
/* writePrerenderedFile                                                        */
/* -------------------------------------------------------------------------- */

describe('writePrerenderedFile()', () => {
  it('writes HTML content to disk', async () => {
    await withTmp('ubean-prender-write-', async tmp => {
      const filePath = join(tmp, 'about', 'index.html');
      await writePrerenderedFile(filePath, '<html><body>about</body></html>');
      expect(await readFile(filePath, 'utf-8')).toBe('<html><body>about</body></html>');
    });
  });

  it('creates nested directories if missing', async () => {
    await withTmp('ubean-prender-nested-', async tmp => {
      const filePath = join(tmp, 'a', 'b', 'c', 'index.html');
      await writePrerenderedFile(filePath, '<html></html>');
      expect((await stat(filePath)).isFile()).toBe(true);
    });
  });

  it('overwrites existing file', async () => {
    await withTmp('ubean-prender-overwrite-', async tmp => {
      const filePath = join(tmp, 'index.html');
      await writePrerenderedFile(filePath, 'v1');
      await writePrerenderedFile(filePath, 'v2');
      expect(await readFile(filePath, 'utf-8')).toBe('v2');
    });
  });
});

/* -------------------------------------------------------------------------- */
/* prerender() 集成（临时目录，无 HTTP）                                        */
/* -------------------------------------------------------------------------- */

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
    await withTmp('ubean-prerender-basic-', async (tmp, out) => {
      const result = await prerender({
        cwd: tmp,
        outputDir: out,
        pages: [makePage('/'), makePage('/about')],
        prerender: { all: true, crawlLinks: false, concurrency: 2, failOnError: false, staticDir: out },
        fetcher: async route => ({
          html: `<!DOCTYPE html><html><body>Prerendered: ${route}</body></html>`,
          statusCode: 200
        })
      });

      expect(result.generated).toContain('/');
      expect(result.generated).toContain('/about');
      expect(result.errors).toHaveLength(0);

      expect(await readFile(join(tmp, out, 'index.html'), 'utf-8')).toContain('Prerendered: /');
      expect(await readFile(join(tmp, out, 'about', 'index.html'), 'utf-8')).toContain('Prerendered: /about');
    });
  });

  it('writes HTML files for routes specified via include', async () => {
    await withTmp('ubean-prerender-include-', async (tmp, out) => {
      const result = await prerender({
        cwd: tmp,
        outputDir: out,
        pages: [makePage('/'), makePage('/about'), makePage('/contact')],
        prerender: { include: ['/about'], crawlLinks: false, concurrency: 2, failOnError: false, staticDir: out },
        fetcher: async route => ({ html: `<!DOCTYPE html><html><body>${route}</body></html>`, statusCode: 200 })
      });

      expect(result.generated).toEqual(['/about']);
      expect(result.generated).not.toContain('/');
      expect(result.generated).not.toContain('/contact');
    });
  });

  it('writes placeholder HTML when no fetcher is provided', async () => {
    await withTmp('ubean-prerender-placeholder-', async (tmp, out) => {
      const result = await prerender({
        cwd: tmp,
        outputDir: out,
        pages: [makePage('/')],
        prerender: { all: true, crawlLinks: false, concurrency: 1, failOnError: false, staticDir: out }
      });
      expect(result.generated).toContain('/');
      const content = await readFile(join(tmp, out, 'index.html'), 'utf-8');
      expect(content).toContain('<html');
      expect(content).toContain('Prerendered content placeholder');
    });
  });

  it('crawls links and generates additional routes', async () => {
    await withTmp('ubean-prerender-crawl-', async (tmp, out) => {
      const fetchedRoutes: string[] = [];
      const result = await prerender({
        cwd: tmp,
        outputDir: out,
        pages: [makePage('/')],
        prerender: { all: true, crawlLinks: true, concurrency: 2, failOnError: false, staticDir: out },
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
    });
  });

  it('skips routes matching exclude patterns', async () => {
    await withTmp('ubean-prerender-exclude-', async (tmp, out) => {
      const result = await prerender({
        cwd: tmp,
        outputDir: out,
        pages: [makePage('/'), makePage('/admin'), makePage('/about')],
        prerender: {
          all: true,
          exclude: ['/admin', '/admin/**'],
          crawlLinks: false,
          concurrency: 2,
          failOnError: false,
          staticDir: out
        },
        fetcher: async route => ({ html: `<html>${route}</html>`, statusCode: 200 })
      });
      expect(result.skipped).toContain('/admin');
      expect(result.generated).toContain('/');
      expect(result.generated).toContain('/about');
      expect(result.generated).not.toContain('/admin');
    });
  });

  it('collects errors but continues when failOnError=false', async () => {
    await withTmp('ubean-prerender-lenient-', async (tmp, out) => {
      const result = await prerender({
        cwd: tmp,
        outputDir: out,
        pages: [makePage('/'), makePage('/broken'), makePage('/after-broken')],
        prerender: { all: true, crawlLinks: false, concurrency: 1, failOnError: false, staticDir: out },
        fetcher: async route => {
          if (route === '/broken') return { html: 'Not Found', statusCode: 404 };
          return { html: `<html>${route}</html>`, statusCode: 200 };
        }
      });
      expect(result.errors.some(e => e.route === '/broken')).toBe(true);
      expect(result.generated).toContain('/');
      expect(result.generated).toContain('/after-broken');
      expect(result.generated).not.toContain('/broken');
    });
  });

  it('throws on error when failOnError=true', async () => {
    await withTmp('ubean-prerender-strict-', async (tmp, out) => {
      await expect(
        prerender({
          cwd: tmp,
          outputDir: out,
          pages: [makePage('/'), makePage('/broken')],
          prerender: { all: true, crawlLinks: false, concurrency: 1, failOnError: true, staticDir: out },
          fetcher: async route => {
            if (route === '/broken') return { html: 'Not Found', statusCode: 404 };
            return { html: `<html>${route}</html>`, statusCode: 200 };
          }
        })
      ).rejects.toThrow();
    });
  });

  it('respects concurrency limit', async () => {
    await withTmp('ubean-prerender-conc-', async (tmp, out) => {
      const pages = [makePage('/'), ...Array.from({ length: 9 }, (_, i) => makePage(`/page-${i}`))];
      let maxConcurrent = 0;
      let current = 0;

      const result = await prerender({
        cwd: tmp,
        outputDir: out,
        pages,
        prerender: { all: true, crawlLinks: false, concurrency: 3, failOnError: false, staticDir: out },
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
    });
  });
});

/* -------------------------------------------------------------------------- */
/* generatePrerenderManifest                                                   */
/* -------------------------------------------------------------------------- */

describe('generatePrerenderManifest()', () => {
  it('generates manifest with absolute URLs', async () => {
    await withTmp('ubean-prerender-manifest-', async (tmp, out) => {
      const result = await prerender({
        cwd: tmp,
        outputDir: out,
        pages: [makePage('/'), makePage('/about')],
        prerender: { all: true, crawlLinks: false, concurrency: 2, failOnError: false, staticDir: out },
        fetcher: async route => ({ html: `<html>${route}</html>`, statusCode: 200 })
      });
      const manifest = generatePrerenderManifest(result, 'https://example.com');
      expect(manifest.routes.length).toBeGreaterThan(0);
      expect(manifest.routes.every(r => r.startsWith('http'))).toBe(true);
      expect(manifest.generatedAt).toBeDefined();
      expect(Array.isArray(manifest.errors)).toBe(true);
    });
  });

  it('uses "/" as default baseUrl', () => {
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

/* -------------------------------------------------------------------------- */
/* prerender() 的 payload 提取开关（此前只在 L2 的 HTTP 集成里被顺带覆盖）      */
/* -------------------------------------------------------------------------- */

describe('prerender() - extractDataPayload 开关', () => {
  const PAYLOAD_OPEN = `<script id="${DATA_PAYLOAD_ID}" type="application/json">`;
  const wrapPayload = (json: string) =>
    `<!DOCTYPE html><html><head>${PAYLOAD_OPEN}${json}</script></head><body><div id="app">x</div></body></html>`;

  it('extractDataPayload: false 时保留内联 script 且不写 __data.json', async () => {
    await withTmp('ubean-prender-nopayload-', async (tmp, out) => {
      await prerender({
        cwd: tmp,
        outputDir: out,
        pages: [makePage('/')],
        prerender: { all: true, crawlLinks: false, concurrency: 1, staticDir: out, extractDataPayload: false },
        fetcher: async () => ({
          html: wrapPayload(JSON.stringify({ k: { data: 1, error: null, timestamp: 0 } })),
          statusCode: 200
        })
      });

      const html = await readFile(join(tmp, out, 'index.html'), 'utf-8');
      expect(html).toContain(`id="${DATA_PAYLOAD_ID}"`);
      expect(html).not.toContain('window.__UBEAN_DATA_PAYLOAD__');
      await expect(readFile(join(tmp, out, '__data.json'), 'utf-8')).rejects.toThrow();
    });
  });
});
