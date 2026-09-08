/**
 * 静态 SSG 渲染器测试（docs/adr/0011-lightweight-ssg-direct-render.md）。
 *
 * 覆盖：
 * - `compilePageRoute` / `matchRoutePattern`：静态段 / 动态参数 / catch-all /
 *   可选参数 / 特异性排序 / 参数解码 / 无匹配
 * - `createStaticSsgRenderer`：entry 加载失败降级 / fetcher 同构契约
 *   （404 哨兵路由、locale 前缀剥离、prefix 策略 404、无匹配 404）
 * - prerender 404 集成：`notFoundRoute: true` 产出 `404.html`，
 *   `routeToFilePath` 哨兵映射
 */
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, afterAll } from 'vitest';
import type { ScannedPageRoute } from '@ubean/scan';
import { prerender, routeToFilePath } from '../src/prerender';
import {
  STATIC_NOT_FOUND_ROUTE,
  compilePageRoute,
  matchRoutePattern,
  createStaticSsgRenderer,
  expandRoutesForLocales
} from '../src/static-render';

function page(route: string, name = route): ScannedPageRoute {
  return {
    fullPath: route,
    relativePath: route.slice(1),
    dirname: '',
    basename: route,
    name,
    route,
    path: route,
    isReuse: false,
    isMarkdown: false
  } as ScannedPageRoute;
}

/* -------------------------------------------------------------------------- */
/* compilePageRoute / matchRoutePattern                                        */
/* -------------------------------------------------------------------------- */

describe('compilePageRoute()', () => {
  it('compiles a static route', () => {
    const c = compilePageRoute(page('/about'));
    expect(c.regex.test('/about')).toBe(true);
    expect(c.regex.test('/about/')).toBe(true);
    expect(c.regex.test('/about/us')).toBe(false);
    expect(c.paramNames).toEqual([]);
    expect(c.isCatchAll).toBe(false);
    expect(c.staticSegments).toBe(1);
  });

  it('compiles the root route', () => {
    const c = compilePageRoute(page('/'));
    expect(c.regex.test('')).toBe(true);
    expect(c.regex.test('/')).toBe(true);
    expect(c.regex.test('/x')).toBe(false);
  });

  it('compiles a dynamic route and extracts params', () => {
    const c = compilePageRoute(page('/blog/:slug'));
    expect(c.regex.test('/blog/hello')).toBe(true);
    expect(c.paramNames).toEqual(['slug']);
  });

  it('compiles a catch-all route that also matches the bare pattern', () => {
    const c = compilePageRoute(page('/docs/**:path'));
    expect(c.isCatchAll).toBe(true);
    expect(c.regex.test('/docs')).toBe(true);
    expect(c.regex.test('/docs/a/b/c')).toBe(true);
    expect(c.regex.test('/other')).toBe(false);
  });

  it('compiles an optional param route', () => {
    const c = compilePageRoute(page('/users/:id?'));
    expect(c.regex.test('/users')).toBe(true);
    expect(c.regex.test('/users/42')).toBe(true);
    expect(c.regex.test('/users/42/posts')).toBe(false);
  });

  it('compiles a vue-router custom-regex param (definePage override)', () => {
    const c = compilePageRoute(page('/users/:id(\\d+)'));
    expect(c.regex.test('/users/42')).toBe(true);
    expect(c.regex.test('/users/abc')).toBe(false);
    expect(c.paramNames).toEqual(['id']);
  });

  it('compiles a vue-router repeatable catch-all (:slug(.*)*)', () => {
    const c = compilePageRoute(page('/blog/:slug(.*)*'));
    expect(c.isCatchAll).toBe(true);
    // 匹配模式自身、单段、多段
    expect(c.regex.test('/blog')).toBe(true);
    expect(c.regex.test('/blog/hello')).toBe(true);
    expect(c.regex.test('/blog/a/b/c')).toBe(true);
    expect(c.regex.test('/other')).toBe(false);

    const m = matchRoutePattern([page('/blog/:slug(.*)*')], '/blog/a/b');
    expect(m?.params).toEqual({ slug: 'a/b' });
  });

  it('ranks a repeatable catch-all below static siblings', () => {
    const mixed = [page('/blog/:slug(.*)*', 'blog-catch-all'), page('/blog/intro', 'blog-static')];
    expect(matchRoutePattern(mixed, '/blog/intro')?.page.name).toBe('blog-static');
    expect(matchRoutePattern(mixed, '/blog/deep/path')?.page.name).toBe('blog-catch-all');
  });
});

describe('matchRoutePattern()', () => {
  const pages = [page('/about'), page('/blog/:slug', 'blog-slug'), page('/docs/**:path', 'docs-catch-all'), page('/')];

  it('matches a static route', () => {
    const m = matchRoutePattern(pages, '/about');
    expect(m?.page.name).toBe('/about');
    expect(m?.params).toEqual({});
  });

  it('matches a dynamic route and extracts decoded params', () => {
    const m = matchRoutePattern(pages, '/blog/hello%20world');
    expect(m?.page.name).toBe('blog-slug');
    expect(m?.params).toEqual({ slug: 'hello world' });
  });

  it('prefers static over dynamic over catch-all (specificity order)', () => {
    const mixed = [
      page('/docs/**:path', 'catch-all'),
      page('/docs/:section', 'dynamic'),
      page('/docs/intro', 'static')
    ];
    expect(matchRoutePattern(mixed, '/docs/intro')?.page.name).toBe('static');
    expect(matchRoutePattern(mixed, '/docs/guide')?.page.name).toBe('dynamic');
    expect(matchRoutePattern(mixed, '/docs/a/b/c')?.page.name).toBe('catch-all');
  });

  it('matches catch-all against the bare pattern too', () => {
    const m = matchRoutePattern([page('/docs/**:path', 'docs')], '/docs');
    expect(m?.page.name).toBe('docs');
    expect(m?.params).toEqual({});
  });

  it('matches the root route', () => {
    expect(matchRoutePattern(pages, '/')?.page.name).toBe('/');
  });

  it('returns null when no pattern matches', () => {
    expect(matchRoutePattern(pages, '/nonexistent')).toBeNull();
  });

  it('accepts pre-compiled routes', () => {
    const compiled = pages.map(compilePageRoute);
    expect(matchRoutePattern(compiled, '/about')?.page.name).toBe('/about');
  });
});

/* -------------------------------------------------------------------------- */
/* routeToFilePath 404 映射                                                    */
/* -------------------------------------------------------------------------- */

describe('routeToFilePath 404 sentinel mapping', () => {
  it('maps STATIC_NOT_FOUND_ROUTE to 404.html', () => {
    expect(routeToFilePath(STATIC_NOT_FOUND_ROUTE, 'dist')).toBe(join('dist', '404.html'));
  });

  it('keeps regular routes unchanged', () => {
    expect(routeToFilePath('/about', 'dist')).toBe(join('dist', 'about', 'index.html'));
  });
});

/* -------------------------------------------------------------------------- */
/* expandRoutesForLocales（i18n 多语言展开）                                    */
/* -------------------------------------------------------------------------- */

describe('expandRoutesForLocales()', () => {
  const i18n = (strategy: string, defaultLocale = 'en') => ({
    enabled: true,
    strategy,
    defaultLocale,
    locales: ['en', 'zh', 'ja']
  });

  it('returns routes unchanged when i18n is disabled', () => {
    expect(expandRoutesForLocales(['/about', '/'], { enabled: false, locales: ['en'] })).toEqual(['/about', '/']);
  });

  it('returns routes unchanged under no_prefix', () => {
    expect(expandRoutesForLocales(['/about', '/'], i18n('no_prefix'))).toEqual(['/about', '/']);
  });

  it('expands default unprefixed + others prefixed under prefix_except_default', () => {
    expect(expandRoutesForLocales(['/about'], i18n('prefix_except_default'))).toEqual([
      '/about',
      '/zh/about',
      '/ja/about'
    ]);
  });

  it('expands the root route without double slashes', () => {
    expect(expandRoutesForLocales(['/'], i18n('prefix_except_default'))).toEqual(['/', '/zh', '/ja']);
  });

  it('expands all locales prefixed under prefix (no unprefixed variant)', () => {
    expect(expandRoutesForLocales(['/about'], i18n('prefix'))).toEqual(['/en/about', '/zh/about', '/ja/about']);
  });

  it('expands all locales + default unprefixed under prefix_and_default', () => {
    expect(expandRoutesForLocales(['/about'], i18n('prefix_and_default'))).toEqual([
      '/about',
      '/en/about',
      '/zh/about',
      '/ja/about'
    ]);
  });

  it('keeps already-prefixed URLs as-is (crawlLinks discovery)', () => {
    expect(expandRoutesForLocales(['/zh/about'], i18n('prefix_except_default'))).toEqual(['/zh/about']);
  });

  it('does not expand the 404 sentinel route', () => {
    expect(expandRoutesForLocales([STATIC_NOT_FOUND_ROUTE], i18n('prefix_except_default'))).toEqual([
      STATIC_NOT_FOUND_ROUTE
    ]);
  });

  it('deduplicates expanded routes', () => {
    const result = expandRoutesForLocales(['/about', '/about'], i18n('prefix_except_default'));
    expect(result).toEqual(['/about', '/zh/about', '/ja/about']);
  });

  it('treats object-shaped locales', () => {
    expect(
      expandRoutesForLocales(['/about'], {
        enabled: true,
        strategy: 'prefix_except_default',
        defaultLocale: 'en',
        locales: [{ code: 'en' }, { code: 'zh' }]
      })
    ).toEqual(['/about', '/zh/about']);
  });
});

/* -------------------------------------------------------------------------- */
/* createStaticSsgRenderer                                                     */
/* -------------------------------------------------------------------------- */

const tempDirs: string[] = [];
afterAll(async () => {
  await Promise.all(tempDirs.map(d => rm(d, { recursive: true, force: true })));
});

/** 写入一个 mock 静态 entry（回显渲染输入，便于断言 fetcher 契约） */
async function writeMockEntry(root: string): Promise<void> {
  const serverDir = join(root, 'server');
  await mkdir(serverDir, { recursive: true });
  await writeFile(
    join(serverDir, 'entry.mjs'),
    `export async function renderStaticPage(input) {
  return {
    html: JSON.stringify(input),
    statusCode: 200
  };
}
`,
    'utf-8'
  );
}

describe('createStaticSsgRenderer()', () => {
  it('returns undefined when the entry file is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ubean-ssg-'));
    tempDirs.push(root);
    const renderer = await createStaticSsgRenderer(root, { serverDir: 'server' }, { pages: [] });
    expect(renderer).toBeUndefined();
  });

  it('returns undefined when the entry does not export renderStaticPage', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ubean-ssg-'));
    tempDirs.push(root);
    await mkdir(join(root, 'server'), { recursive: true });
    await writeFile(join(root, 'server', 'entry.mjs'), 'export const x = 1;\n', 'utf-8');
    const renderer = await createStaticSsgRenderer(root, { serverDir: 'server' }, { pages: [] });
    expect(renderer).toBeUndefined();
  });

  it('exposes a fetcher with the prerender contract (no i18n)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ubean-ssg-'));
    tempDirs.push(root);
    await writeMockEntry(root);

    const renderer = await createStaticSsgRenderer(
      root,
      { serverDir: 'server' },
      {
        pages: [page('/'), page('/about', 'about'), page('/blog/:slug', 'blog-slug')],
        notFoundPage: page('/404', 'NotFound')
      }
    );
    expect(renderer).toBeDefined();

    // 普通页面：pageName + params + url
    const about = await renderer!.fetcher('/about');
    expect(about.statusCode).toBe(200);
    expect(JSON.parse(about.html)).toMatchObject({ pageName: 'about', params: {}, url: '/about' });

    // 动态路由：参数提取
    const blog = await renderer!.fetcher('/blog/hello');
    expect(JSON.parse(blog.html)).toMatchObject({ pageName: 'blog-slug', params: { slug: 'hello' } });

    // 404 哨兵路由 → NotFound 页
    const notFound = await renderer!.fetcher(STATIC_NOT_FOUND_ROUTE);
    expect(notFound.statusCode).toBe(200);
    expect(JSON.parse(notFound.html)).toMatchObject({ pageName: 'NotFound' });

    // 未匹配 → 404
    const miss = await renderer!.fetcher('/nonexistent');
    expect(miss.statusCode).toBe(404);
    expect(miss.html).toBe('');
  });

  it('strips locale prefixes under prefix_except_default', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ubean-ssg-'));
    tempDirs.push(root);
    await writeMockEntry(root);

    const renderer = await createStaticSsgRenderer(
      root,
      { serverDir: 'server' },
      {
        pages: [page('/about', 'about')],
        i18n: { enabled: true, strategy: 'prefix_except_default', defaultLocale: 'en', locales: ['en', 'zh'] }
      }
    );

    const zh = await renderer!.fetcher('/zh/about');
    expect(JSON.parse(zh.html)).toMatchObject({ pageName: 'about', locale: 'zh', url: '/zh/about' });

    const en = await renderer!.fetcher('/about');
    expect(JSON.parse(en.html)).toMatchObject({ pageName: 'about', locale: 'en' });
  });

  it('returns 404 for unprefixed URLs under the strict prefix strategy', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ubean-ssg-'));
    tempDirs.push(root);
    await writeMockEntry(root);

    const renderer = await createStaticSsgRenderer(
      root,
      { serverDir: 'server' },
      {
        pages: [page('/about', 'about')],
        i18n: { enabled: true, strategy: 'prefix', defaultLocale: 'en', locales: ['en', 'zh'] }
      }
    );

    const res = await renderer!.fetcher('/about');
    expect(res.statusCode).toBe(404);
    expect(res.html).toBe('');
  });

  it('exposes expandRoutes bound to the i18n config', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ubean-ssg-'));
    tempDirs.push(root);
    await writeMockEntry(root);

    const renderer = await createStaticSsgRenderer(
      root,
      { serverDir: 'server' },
      {
        pages: [page('/about', 'about')],
        i18n: { enabled: true, strategy: 'prefix_except_default', defaultLocale: 'en', locales: ['en', 'zh'] }
      }
    );

    expect(renderer!.expandRoutes(['/about'])).toEqual(['/about', '/zh/about']);
    // 哨兵不展开
    expect(renderer!.expandRoutes([STATIC_NOT_FOUND_ROUTE])).toEqual([STATIC_NOT_FOUND_ROUTE]);
  });
});

/* -------------------------------------------------------------------------- */
/* prerender 404 集成                                                          */
/* -------------------------------------------------------------------------- */

describe('prerender notFoundRoute integration', () => {
  it('renders the sentinel route to 404.html and reports /404', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ubean-ssg-'));
    tempDirs.push(root);

    const result = await prerender({
      cwd: root,
      outputDir: 'dist/public',
      pages: [page('/')],
      prerender: { all: true, crawlLinks: false, staticDir: 'dist/public' },
      notFoundRoute: true,
      fetcher: async url => {
        if (url === STATIC_NOT_FOUND_ROUTE) {
          return { html: '<html><body>Not Found page</body></html>', statusCode: 200 };
        }
        return { html: `<html><body>${url}</body></html>`, statusCode: 200 };
      }
    });

    expect(result.errors).toEqual([]);
    expect(result.generated).toContain('/404');
    expect(result.generated).toContain('/');

    const html = await readFile(join(root, 'dist/public/404.html'), 'utf-8');
    expect(html).toContain('Not Found page');
  });

  it('does not emit 404.html when notFoundRoute is not set', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ubean-ssg-'));
    tempDirs.push(root);

    const result = await prerender({
      cwd: root,
      outputDir: 'dist/public',
      pages: [page('/')],
      prerender: { all: true, crawlLinks: false, staticDir: 'dist/public' },
      fetcher: async url => ({ html: `<html><body>${url}</body></html>`, statusCode: 200 })
    });

    expect(result.generated).not.toContain('/404');
    expect(result.generated).not.toContain(STATIC_NOT_FOUND_ROUTE);
  });
});

/* -------------------------------------------------------------------------- */
/* prerender expandRoutes 集成                                                 */
/* -------------------------------------------------------------------------- */

describe('prerender expandRoutes integration', () => {
  it('applies the expandRoutes hook after route collection', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ubean-ssg-'));
    tempDirs.push(root);

    const result = await prerender({
      cwd: root,
      outputDir: 'dist/public',
      pages: [page('/'), page('/about', 'about')],
      prerender: { all: true, crawlLinks: false, staticDir: 'dist/public' },
      expandRoutes: routes =>
        expandRoutesForLocales(routes, {
          enabled: true,
          strategy: 'prefix_except_default',
          defaultLocale: 'en',
          locales: ['en', 'zh']
        }),
      fetcher: async url => ({ html: `<html><body>${url}</body></html>`, statusCode: 200 })
    });

    expect(result.errors).toEqual([]);
    // 全语言产物：en（无前缀）+ zh（带前缀）
    expect(result.generated).toContain('/');
    expect(result.generated).toContain('/about');
    expect(result.generated).toContain('/zh');
    expect(result.generated).toContain('/zh/about');
    // 文件落盘
    const zhHtml = await readFile(join(root, 'dist/public/zh/about/index.html'), 'utf-8');
    expect(zhHtml).toContain('/zh/about');
  });
});
