import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  defineHandler,
  prerender,
  collectPrerenderRoutes,
  extractLinks,
  shouldIgnoreRoute,
  matchGlob,
  routeToFilePath,
  writePrerenderedFile,
  resolvePrerenderConfig,
  definePrerenderRoutes,
  generatePrerenderManifest
} from 'ubean';

// Bypass HTTP proxy for localhost requests
if (process.env.HTTP_PROXY) delete process.env.HTTP_PROXY;
if (process.env.HTTPS_PROXY) delete process.env.HTTPS_PROXY;
process.env.NO_PROXY = 'localhost,127.0.0.1';

export const GET = defineHandler(async c => {
  const action = c.req.query('action') || 'info';
  const base = `http://localhost:${process.env.PORT || 9527}`;

  switch (action) {
    // Test 1: collectPrerenderRoutes - new signature with { all, include, exclude }
    case 'collectRoutes': {
      const mockPages = [
        {
          path: '/',
          fullPath: '/pages/index.vue',
          relativePath: 'index.vue',
          dirname: '.',
          basename: 'index.vue',
          name: 'index',
          route: '/',
          isReuse: false,
          isMarkdown: false
        },
        {
          path: '/about',
          fullPath: '/pages/about.vue',
          relativePath: 'about.vue',
          dirname: '.',
          basename: 'about.vue',
          name: 'about',
          route: '/about',
          isReuse: false,
          isMarkdown: false
        },
        {
          path: '/user/[id]',
          fullPath: '/pages/user/[id].vue',
          relativePath: 'user/[id].vue',
          dirname: 'user',
          basename: '[id].vue',
          name: 'user-id',
          route: '/user/[id]',
          isReuse: false,
          isMarkdown: false
        },
        {
          path: '/dashboard',
          fullPath: '/pages/dashboard/index.vue',
          relativePath: 'dashboard/index.vue',
          dirname: 'dashboard',
          basename: 'index.vue',
          name: 'dashboard',
          route: '/dashboard',
          isReuse: false,
          isMarkdown: false
        },
        {
          path: '/blog/[...slug]',
          fullPath: '/pages/blog/[...slug].vue',
          relativePath: 'blog/[...slug].vue',
          dirname: 'blog',
          basename: '[...slug].vue',
          name: 'blog-slug',
          route: '/blog/[...slug]',
          isReuse: false,
          isMarkdown: false
        }
      ];

      // New API: use include + exclude instead of routeRules
      const { routes, skipped } = collectPrerenderRoutes(mockPages, {
        all: true,
        exclude: ['/dashboard', '/dashboard/**']
      });

      return c.json({
        totalInputPages: mockPages.length,
        collectedRoutes: routes,
        skippedRoutes: skipped,
        hasDynamicFiltered: !routes.some(r => r.includes('[')),
        hasRoot: routes.includes('/'),
        hasAbout: routes.includes('/about'),
        hasDashboardSkipped: skipped.includes('/dashboard')
      });
    }

    // Test 1b: collectPrerenderRoutes with include-only mode
    case 'collectRoutesInclude': {
      const mockPages = [
        { path: '/', name: 'index', route: '/', isReuse: false, isMarkdown: false },
        { path: '/about', name: 'about', route: '/about', isReuse: false, isMarkdown: false },
        { path: '/dashboard', name: 'dashboard', route: '/dashboard', isReuse: false, isMarkdown: false }
      ];

      const { routes } = collectPrerenderRoutes(mockPages, {
        include: ['/about']
      });

      return c.json({
        collectedRoutes: routes,
        hasOnlyAbout: routes.length === 1 && routes[0] === '/about',
        routesCount: routes.length
      });
    }

    // Test 1c: collectPrerenderRoutes with include + specific dynamic path
    case 'collectRoutesDynamic': {
      const mockPages = [
        { path: '/', name: 'index', route: '/', isReuse: false, isMarkdown: false },
        { path: '/blog/[id]', name: 'blog-id', route: '/blog/[id]', isReuse: false, isMarkdown: false }
      ];

      const { routes } = collectPrerenderRoutes(mockPages, {
        include: ['/blog/hello-world', '/blog/second-post']
      });

      return c.json({
        collectedRoutes: routes,
        hasHelloWorld: routes.includes('/blog/hello-world'),
        hasSecondPost: routes.includes('/blog/second-post'),
        hasNoIndex: !routes.includes('/')
      });
    }

    // Test 1d: collectPrerenderRoutes with all + include (include should be ignored)
    case 'collectRoutesAllIgnoresInclude': {
      const mockPages = [
        { path: '/', name: 'index', route: '/', isReuse: false, isMarkdown: false },
        { path: '/about', name: 'about', route: '/about', isReuse: false, isMarkdown: false },
        { path: '/blog', name: 'blog', route: '/blog', isReuse: false, isMarkdown: false }
      ];

      const { routes } = collectPrerenderRoutes(mockPages, {
        all: true,
        include: ['/about'] // should be ignored
      });

      return c.json({
        collectedRoutes: routes,
        // all: true means all non-dynamic pages are included, include is ignored
        hasAllPages: routes.includes('/') && routes.includes('/about') && routes.includes('/blog'),
        routesCount: routes.length
      });
    }

    // Test 2: extractLinks - extracts internal links from HTML, filters external/hash/mailto
    case 'extractLinks': {
      const sampleHtml = `
        <html>
          <body>
            <a href="/about">About</a>
            <a href="/dashboard">Dashboard</a>
            <a href="/user/123">User Profile</a>
            <a href="https://example.com">External</a>
            <a href="#section1">Hash Link</a>
            <a href="mailto:test@test.com">Email</a>
            <a href="/blog/post-1?ref=home">Blog with query</a>
            <a href="/contact#form">Contact with hash</a>
            <a href="javascript:void(0)">JS Link</a>
            <a href="/about/">Trailing slash</a>
          </body>
        </html>
      `;

      const links = extractLinks(sampleHtml, base);

      return c.json({
        totalLinksInHtml: 10,
        extractedLinks: links,
        hasAbout: links.includes('/about'),
        hasDashboard: links.includes('/dashboard'),
        hasNoExternal: !links.some(l => l.startsWith('http')),
        hasNoHash: !links.some(l => l.startsWith('#')),
        hasNoMailto: !links.some(l => l.startsWith('mailto')),
        hasNoJavascript: !links.some(l => l.startsWith('javascript')),
        hasQueryStripped: !links.some(l => l.includes('?')),
        hasHashStripped: !links.some(l => l.includes('#')),
        hasTrailingSlashNormalized: !links.some(l => l.length > 1 && l.endsWith('/'))
      });
    }

    // Test 3: matchGlob - tests unified glob matching
    case 'matchGlob': {
      const tests = [
        // exact match
        { route: '/about', pattern: '/about', expected: true },
        // ** multi-segment
        { route: '/api/users/123', pattern: '/api/**', expected: true },
        { route: '/api', pattern: '/api/**', expected: true },
        // * single-segment
        { route: '/admin/dashboard', pattern: '/admin/*', expected: true },
        { route: '/admin/users/deep', pattern: '/admin/*', expected: false },
        // non-match
        { route: '/about', pattern: '/api/**', expected: false },
        // bare ** matches everything
        { route: '/any/route', pattern: '**', expected: true }
      ];

      const results = tests.map(t => ({
        route: t.route,
        pattern: t.pattern,
        expected: t.expected,
        actual: matchGlob(t.route, t.pattern),
        passed: matchGlob(t.route, t.pattern) === t.expected
      }));

      return c.json({
        tests: results,
        allPassed: results.every(r => r.passed)
      });
    }

    // Test 3b: shouldIgnoreRoute - kept for backward compat, delegates to matchGlob
    case 'shouldIgnore': {
      const patterns = ['/api/**', '/_health', '/admin/*', '/private/**'];
      const tests = [
        { route: '/api/users', expected: true },
        { route: '/api', expected: true },
        { route: '/_health', expected: true },
        { route: '/admin/dashboard', expected: true },
        { route: '/admin', expected: false },
        { route: '/private/secret/data', expected: true },
        { route: '/about', expected: false },
        { route: '/dashboard', expected: false }
      ];

      const results = tests.map(t => ({
        route: t.route,
        expected: t.expected,
        actual: shouldIgnoreRoute(t.route, patterns),
        passed: shouldIgnoreRoute(t.route, patterns) === t.expected
      }));

      return c.json({
        patterns,
        tests: results,
        allPassed: results.every(r => r.passed)
      });
    }

    // Test 4: definePrerenderRoutes - deprecated but still functional
    case 'defineRoutes': {
      const extraRoutes = definePrerenderRoutes(['/landing', '/pricing', '/features']);
      return c.json({
        routes: extraRoutes,
        isArray: Array.isArray(extraRoutes),
        count: extraRoutes.length,
        allStartWithSlash: extraRoutes.every(r => r.startsWith('/'))
      });
    }

    // Test 5: resolvePrerenderConfig - new signature with all/include/exclude
    case 'resolveConfig': {
      const defaultConfig = resolvePrerenderConfig();
      const customAllConfig = resolvePrerenderConfig({
        all: true,
        exclude: ['/admin/**'],
        concurrency: 8,
        failOnError: true,
        crawlLinks: false,
        staticDir: '.output/static'
      });
      const customIncludeConfig = resolvePrerenderConfig({
        include: ['/about', '/pricing'],
        crawlLinks: false
      });
      const emptyConfig = resolvePrerenderConfig({});

      return c.json({
        defaultConfig,
        customAllConfig,
        customIncludeConfig,
        emptyConfig,
        defaultsApplied: !defaultConfig.enabled && defaultConfig.concurrency === 4 && !defaultConfig.failOnError,
        allOverridesApplied:
          customAllConfig.enabled &&
          customAllConfig.all === true &&
          customAllConfig.concurrency === 8 &&
          customAllConfig.failOnError &&
          customAllConfig.crawlLinks === false,
        includeOverridesApplied:
          customIncludeConfig.enabled && customIncludeConfig.all === false && customIncludeConfig.include.length === 2,
        emptyIsDisabled: !emptyConfig.enabled
      });
    }

    // Test 6: prerender() - full integration with all: true
    case 'prerender': {
      const tmpDir = await mkdtemp(join(tmpdir(), 'ubean-prerender-'));
      try {
        const mockPages = [
          {
            path: '/',
            fullPath: 'index.vue',
            relativePath: 'index.vue',
            dirname: '.',
            basename: 'index.vue',
            name: 'index',
            route: '/',
            isReuse: false,
            isMarkdown: false
          },
          {
            path: '/about',
            fullPath: 'about.vue',
            relativePath: 'about.vue',
            dirname: '.',
            basename: 'about.vue',
            name: 'about',
            route: '/about',
            isReuse: false,
            isMarkdown: false
          }
        ];

        const result = await prerender({
          cwd: tmpDir,
          outputDir: '.output/public',
          pages: mockPages,
          prerender: {
            all: true,
            crawlLinks: false,
            concurrency: 2,
            failOnError: false,
            staticDir: '.output/public'
          },
          fetcher: async (route: string) => {
            const html = `<!DOCTYPE html><html><head><title>${route}</title></head><body><h1>Prerendered: ${route}</h1></body></html>`;
            return { html, statusCode: 200 };
          }
        });

        const indexFile = join(tmpDir, '.output/public/index.html');
        const aboutFile = join(tmpDir, '.output/public/about/index.html');
        const indexContent = await readFile(indexFile, 'utf-8');
        const aboutContent = await readFile(aboutFile, 'utf-8');

        return c.json({
          generatedCount: result.generated.length,
          generatedRoutes: result.generated,
          errorCount: result.errors.length,
          skippedCount: result.skipped.length,
          duration: result.duration,
          indexFileWritten: indexContent.includes('Prerendered: /'),
          aboutFileWritten: aboutContent.includes('Prerendered: /about'),
          indexContentLength: indexContent.length,
          aboutContentLength: aboutContent.length
        });
      } finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    }

    // Test 7: prerender with crawlLinks - tests link crawling discovers new routes
    case 'crawlLinks': {
      const tmpDir = await mkdtemp(join(tmpdir(), 'ubean-prerender-crawl-'));
      try {
        const mockPages = [
          {
            path: '/',
            fullPath: 'index.vue',
            relativePath: 'index.vue',
            dirname: '.',
            basename: 'index.vue',
            name: 'index',
            route: '/',
            isReuse: false,
            isMarkdown: false
          }
        ];

        const fetchedRoutes: string[] = [];

        const result = await prerender({
          cwd: tmpDir,
          outputDir: '.output/public',
          pages: mockPages,
          prerender: {
            all: true,
            crawlLinks: true,
            concurrency: 2,
            failOnError: false,
            staticDir: '.output/public'
          },
          fetcher: async (route: string) => {
            fetchedRoutes.push(route);
            if (route === '/') {
              const html = `<html><body><a href="/about">About</a><a href="/features">Features</a></body></html>`;
              return { html, statusCode: 200 };
            }
            const html = `<html><body><h1>${route}</h1></body></html>`;
            return { html, statusCode: 200 };
          }
        });

        return c.json({
          fetchedRoutes,
          generatedRoutes: result.generated,
          crawledAbout: fetchedRoutes.includes('/about'),
          crawledFeatures: fetchedRoutes.includes('/features'),
          totalGenerated: result.generated.length,
          duration: result.duration
        });
      } finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    }

    // Test 8: prerender with exclude - tests exclude filtering integration
    case 'excludeRules': {
      const tmpDir = await mkdtemp(join(tmpdir(), 'ubean-prerender-exclude-'));
      try {
        const mockPages = [
          { path: '/', name: 'index', route: '/', isReuse: false, isMarkdown: false },
          { path: '/admin', name: 'admin', route: '/admin', isReuse: false, isMarkdown: false },
          { path: '/about', name: 'about', route: '/about', isReuse: false, isMarkdown: false }
        ];

        const result = await prerender({
          cwd: tmpDir,
          outputDir: '.output/public',
          pages: mockPages,
          prerender: {
            all: true,
            exclude: ['/admin', '/admin/**'],
            crawlLinks: false,
            concurrency: 2,
            failOnError: false,
            staticDir: '.output/public'
          },
          fetcher: async (route: string) => ({ html: `<html><body>${route}</body></html>`, statusCode: 200 })
        });

        return c.json({
          generatedRoutes: result.generated,
          skippedRoutes: result.skipped,
          adminSkipped: result.skipped.includes('/admin'),
          homeGenerated: result.generated.includes('/'),
          aboutGenerated: result.generated.includes('/about')
        });
      } finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    }

    // Test 9: prerender with failOnError
    case 'failOnError': {
      const tmpDir = await mkdtemp(join(tmpdir(), 'ubean-prerender-error-'));
      try {
        const mockPages = [
          { path: '/', name: 'index', route: '/', isReuse: false, isMarkdown: false },
          { path: '/broken', name: 'broken', route: '/broken', isReuse: false, isMarkdown: false },
          { path: '/after-broken', name: 'after-broken', route: '/after-broken', isReuse: false, isMarkdown: false }
        ];

        const resultLenient = await prerender({
          cwd: tmpDir,
          outputDir: '.output/public',
          pages: mockPages,
          prerender: {
            all: true,
            crawlLinks: false,
            concurrency: 1,
            failOnError: false,
            staticDir: '.output/public'
          },
          fetcher: async (route: string) => {
            if (route === '/broken') return { html: 'Not Found', statusCode: 404 };
            return { html: `<html><body>${route}</body></html>`, statusCode: 200 };
          }
        });

        let threwOnError = false;
        let errorMessage = '';
        try {
          await prerender({
            cwd: tmpDir,
            outputDir: '.output/public-strict',
            pages: mockPages,
            prerender: {
              all: true,
              crawlLinks: false,
              concurrency: 1,
              failOnError: true,
              staticDir: '.output/public-strict'
            },
            fetcher: async (route: string) => {
              if (route === '/broken') return { html: 'Not Found', statusCode: 404 };
              return { html: `<html><body>${route}</body></html>`, statusCode: 200 };
            }
          });
        } catch (e) {
          threwOnError = true;
          errorMessage = e instanceof Error ? e.message : String(e);
        }

        return c.json({
          lenient: {
            generatedCount: resultLenient.generated.length,
            errorCount: resultLenient.errors.length,
            errors: resultLenient.errors.map(e => ({ route: e.route, message: e.error?.message })),
            continuedAfterError: resultLenient.generated.length > 0
          },
          strict: {
            threwOnError,
            errorMessage
          }
        });
      } finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    }

    // Test 10: generatePrerenderManifest
    case 'manifest': {
      const tmpDir = await mkdtemp(join(tmpdir(), 'ubean-prerender-manifest-'));
      try {
        const mockPages = [
          { path: '/', name: 'index', route: '/', isReuse: false, isMarkdown: false },
          { path: '/about', name: 'about', route: '/about', isReuse: false, isMarkdown: false }
        ];

        const result = await prerender({
          cwd: tmpDir,
          outputDir: '.output/public',
          pages: mockPages,
          prerender: {
            all: true,
            crawlLinks: false,
            concurrency: 2,
            failOnError: false,
            staticDir: '.output/public'
          },
          fetcher: async (route: string) => ({ html: `<html><body>${route}</body></html>`, statusCode: 200 })
        });

        const manifest = generatePrerenderManifest(result, 'https://example.com');

        return c.json({
          manifest,
          hasRoutes: manifest.routes.length > 0,
          hasGeneratedAt: !!manifest.generatedAt,
          routesAreAbsolute: manifest.routes.every(r => r.startsWith('http')),
          routeCount: manifest.routes.length,
          errorCount: manifest.errors.length
        });
      } finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    }

    // Test 11: routeToFilePath and writePrerenderedFile
    case 'filePath': {
      const tmpDir = await mkdtemp(join(tmpdir(), 'ubean-prerender-path-'));
      try {
        const rootPath = routeToFilePath('/', tmpDir);
        const aboutPath = routeToFilePath('/about', tmpDir);
        const nestedPath = routeToFilePath('/dashboard/settings', tmpDir);

        await writePrerenderedFile(rootPath, '<html>root</html>');
        await writePrerenderedFile(aboutPath, '<html>about</html>');
        await writePrerenderedFile(nestedPath, '<html>nested</html>');

        const rootStat = await stat(rootPath);
        const aboutStat = await stat(aboutPath);
        const nestedStat = await stat(nestedPath);

        const rootContent = await readFile(rootPath, 'utf-8');
        const aboutContent = await readFile(aboutPath, 'utf-8');
        const nestedContent = await readFile(nestedPath, 'utf-8');

        return c.json({
          paths: {
            root: rootPath.replace(tmpDir, ''),
            about: aboutPath.replace(tmpDir, ''),
            nested: nestedPath.replace(tmpDir, '')
          },
          rootIsIndexHtml: rootPath.endsWith('index.html'),
          aboutHasIndexHtml: aboutPath.endsWith('about/index.html'),
          nestedHasIndexHtml: nestedPath.endsWith('dashboard/settings/index.html'),
          allFilesExist: rootStat.isFile() && aboutStat.isFile() && nestedStat.isFile(),
          contentVerified:
            rootContent === '<html>root</html>' &&
            aboutContent === '<html>about</html>' &&
            nestedContent === '<html>nested</html>'
        });
      } finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    }

    // Test 12: concurrency control
    case 'concurrency': {
      const tmpDir = await mkdtemp(join(tmpdir(), 'ubean-prerender-conc-'));
      try {
        const mockPages = [
          { path: '/', name: 'index', route: '/', isReuse: false, isMarkdown: false },
          ...Array.from({ length: 9 }, (_, i) => ({
            path: `/page-${i}`,
            name: `page-${i}`,
            route: `/page-${i}`,
            isReuse: false,
            isMarkdown: false
          }))
        ];

        let maxConcurrent = 0;
        let currentConcurrent = 0;

        const result = await prerender({
          cwd: tmpDir,
          outputDir: '.output/public',
          pages: mockPages,
          prerender: {
            all: true,
            crawlLinks: false,
            concurrency: 3,
            failOnError: false,
            staticDir: '.output/public'
          },
          fetcher: async (route: string) => {
            currentConcurrent++;
            maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
            await new Promise(resolve => setTimeout(resolve, 50));
            currentConcurrent--;
            return { html: `<html>${route}</html>`, statusCode: 200 };
          }
        });

        return c.json({
          totalPages: mockPages.length,
          generatedCount: result.generated.length,
          maxConcurrentObserved: maxConcurrent,
          concurrencyConfig: 3,
          respectedConcurrency: maxConcurrent <= 3,
          duration: result.duration
        });
      } finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    }

    default:
      return c.json({
        actions: [
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
        ]
      });
  }
});
