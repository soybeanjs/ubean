import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  defineHandler,
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

// Bypass HTTP proxy for localhost requests
if (process.env.HTTP_PROXY) delete process.env.HTTP_PROXY;
if (process.env.HTTPS_PROXY) delete process.env.HTTPS_PROXY;
process.env.NO_PROXY = 'localhost,127.0.0.1';

export const GET = defineHandler(async c => {
  const action = c.req.query('action') || 'info';
  const base = `http://localhost:${process.env.PORT || 9527}`;

  switch (action) {
    // Test 1: collectPrerenderRoutes - collects static routes, filters dynamic ones, applies routeRules
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

      const { routes, ignoredRoutes } = collectPrerenderRoutes(
        mockPages,
        {
          '/dashboard/**': { prerender: false }
        },
        ['/custom-route']
      );

      return c.json({
        totalInputPages: mockPages.length,
        collectedRoutes: routes,
        ignoredRoutes: Array.from(ignoredRoutes),
        hasDynamicFiltered: !routes.some(r => r.includes('[')),
        hasRoot: routes.includes('/'),
        hasCustomRoute: routes.includes('/custom-route'),
        hasIgnoredDashboard: ignoredRoutes.has('/dashboard')
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

    // Test 3: shouldIgnoreRoute - tests various ignore pattern matching
    case 'shouldIgnore': {
      const patterns = ['/api/**', '/_health', '/admin/*', '/private/**'];
      const tests = [
        { route: '/api/users', expected: true },
        { route: '/api', expected: true },
        { route: '/_health', expected: true },
        { route: '/admin/dashboard', expected: true },
        { route: '/admin', expected: true },
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

    // Test 4: definePrerenderRoutes - declares additional prerender routes
    case 'defineRoutes': {
      const extraRoutes = definePrerenderRoutes(['/landing', '/pricing', '/features']);
      return c.json({
        routes: extraRoutes,
        isArray: Array.isArray(extraRoutes),
        count: extraRoutes.length,
        allStartWithSlash: extraRoutes.every(r => r.startsWith('/'))
      });
    }

    // Test 5: resolvePrerenderConfig - tests config resolution with defaults and overrides
    case 'resolveConfig': {
      const defaultConfig = resolvePrerenderConfig();
      const customConfig = resolvePrerenderConfig({
        enabled: true,
        concurrency: 8,
        failOnError: true,
        ignore: ['/api/**', '/admin/**'],
        crawlLinks: false,
        routes: ['/extra'],
        staticDir: '.output/static'
      });

      return c.json({
        defaultConfig,
        customConfig,
        defaultsApplied: !defaultConfig.enabled && defaultConfig.concurrency === 4 && !defaultConfig.failOnError,
        overridesApplied:
          customConfig.enabled &&
          customConfig.concurrency === 8 &&
          customConfig.failOnError &&
          customConfig.crawlLinks === false
      });
    }

    // Test 6: prerender() - full integration test with custom fetcher, writes HTML files to temp dir
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
            enabled: true,
            routes: [],
            ignore: [],
            crawlLinks: false,
            concurrency: 2,
            failOnError: false,
            staticDir: '.output/public'
          },
          fetcher: async (route: string) => {
            // Simulate fetching HTML for the route
            const html = `<!DOCTYPE html><html><head><title>${route}</title></head><body><h1>Prerendered: ${route}</h1></body></html>`;
            return { html, statusCode: 200 };
          }
        });

        // Verify files were written
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

        // Track which routes were fetched to verify crawling
        const fetchedRoutes: string[] = [];

        const result = await prerender({
          cwd: tmpDir,
          outputDir: '.output/public',
          pages: mockPages,
          prerender: {
            enabled: true,
            routes: [],
            ignore: [],
            crawlLinks: true,
            concurrency: 2,
            failOnError: false,
            staticDir: '.output/public'
          },
          fetcher: async (route: string) => {
            fetchedRoutes.push(route);
            // Home page links to /about and /features
            if (route === '/') {
              const html = `<html><body><a href="/about">About</a><a href="/features">Features</a></body></html>`;
              return { html, statusCode: 200 };
            }
            // Linked pages have no further links
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

    // Test 8: prerender with ignore rules - tests shouldIgnoreRoute integration
    case 'ignoreRules': {
      const tmpDir = await mkdtemp(join(tmpdir(), 'ubean-prerender-ignore-'));
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
            path: '/admin',
            fullPath: 'admin.vue',
            relativePath: 'admin.vue',
            dirname: '.',
            basename: 'admin.vue',
            name: 'admin',
            route: '/admin',
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
            enabled: true,
            routes: [],
            ignore: ['/admin/**', '/admin'],
            crawlLinks: false,
            concurrency: 2,
            failOnError: false,
            staticDir: '.output/public'
          },
          fetcher: async (route: string) => {
            return { html: `<html><body>${route}</body></html>`, statusCode: 200 };
          }
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

    // Test 9: prerender with failOnError - tests error handling behavior
    case 'failOnError': {
      const tmpDir = await mkdtemp(join(tmpdir(), 'ubean-prerender-error-'));
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
            path: '/broken',
            fullPath: 'broken.vue',
            relativePath: 'broken.vue',
            dirname: '.',
            basename: 'broken.vue',
            name: 'broken',
            route: '/broken',
            isReuse: false,
            isMarkdown: false
          },
          {
            path: '/after-broken',
            fullPath: 'after-broken.vue',
            relativePath: 'after-broken.vue',
            dirname: '.',
            basename: 'after-broken.vue',
            name: 'after-broken',
            route: '/after-broken',
            isReuse: false,
            isMarkdown: false
          }
        ];

        // Test with failOnError: false (should continue and collect errors)
        const resultLenient = await prerender({
          cwd: tmpDir,
          outputDir: '.output/public',
          pages: mockPages,
          prerender: {
            enabled: true,
            routes: [],
            ignore: [],
            crawlLinks: false,
            concurrency: 1, // sequential to ensure order
            failOnError: false,
            staticDir: '.output/public'
          },
          fetcher: async (route: string) => {
            if (route === '/broken') {
              return { html: 'Not Found', statusCode: 404 };
            }
            return { html: `<html><body>${route}</body></html>`, statusCode: 200 };
          }
        });

        // Test with failOnError: true (should throw on error)
        let threwOnError = false;
        let errorMessage = '';
        try {
          await prerender({
            cwd: tmpDir,
            outputDir: '.output/public-strict',
            pages: mockPages,
            prerender: {
              enabled: true,
              routes: [],
              ignore: [],
              crawlLinks: false,
              concurrency: 1,
              failOnError: true,
              staticDir: '.output/public-strict'
            },
            fetcher: async (route: string) => {
              if (route === '/broken') {
                return { html: 'Not Found', statusCode: 404 };
              }
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

    // Test 10: generatePrerenderManifest - generates manifest from prerender result
    case 'manifest': {
      const tmpDir = await mkdtemp(join(tmpdir(), 'ubean-prerender-manifest-'));
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
            enabled: true,
            routes: [],
            ignore: [],
            crawlLinks: false,
            concurrency: 2,
            failOnError: false,
            staticDir: '.output/public'
          },
          fetcher: async (route: string) => {
            return { html: `<html><body>${route}</body></html>`, statusCode: 200 };
          }
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

    // Test 11: routeToFilePath and writePrerenderedFile - tests file path resolution and writing
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

    // Test 12: concurrency control - tests that routes are processed in batches
    case 'concurrency': {
      const tmpDir = await mkdtemp(join(tmpdir(), 'ubean-prerender-conc-'));
      try {
        const mockPages = Array.from({ length: 10 }, (_, i) => ({
          path: `/page-${i}`,
          fullPath: `page-${i}.vue`,
          relativePath: `page-${i}.vue`,
          dirname: '.',
          basename: `page-${i}.vue`,
          name: `page-${i}`,
          route: `/page-${i}`,
          isReuse: false,
          isMarkdown: false
        }));

        let maxConcurrent = 0;
        let currentConcurrent = 0;

        const result = await prerender({
          cwd: tmpDir,
          outputDir: '.output/public',
          pages: mockPages,
          prerender: {
            enabled: true,
            routes: [],
            ignore: [],
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
        ]
      });
  }
});
