/**
 * Prerender / SSG 系统测试（L2 · 只保留 HTTP 集成层）
 *
 * 原先放在这里的**函数级**用例已下沉到
 * `packages/builder/test/prerender-l1.test.ts`（54 例，不需要起示例项目）。
 * 本文件现在只保留「只有 HTTP 层能证明的东西」：
 * `/api/prerender-test` 端点可路由、状态码、响应形状。
 *
 * 已下沉到 L1 的（此处不再重复，判据 = L1 已逐条复刻纯逻辑断言）：
 * - `collectPrerenderRoutes()`（含 all/include/exclude/routeRules 自动发现）→ `prerender-l1.test.ts`
 * - `extractLinks()` / `routeToFilePath()` / `writePrerenderedFile()` / `generatePrerenderManifest()` → 同上
 * - `prerender()` 集成（写入文件、crawlLinks、exclude、failOnError、并发）→ 同上
 * - `resolvePrerenderConfig()` / `DEFAULT_PRERENDER_EXCLUDE` → `packages/config/test/resolvers.test.ts`
 * - `matchGlob()` / `matchAnyGlob()` → `packages/shared/test/glob.test.ts`
 * - `extractDataPayload()` / `routeToDataFilePath()` payload 语义 → `packages/builder/test/prerender-payload.test.ts`
 *
 * 另：原先的 `describe('definePrerenderRoutes()')` 3 例已删除 —— 那 3 例是同义反复
 * （`expect(routes).toEqual(['/landing','/pricing'])`，从不调用任何函数），且
 * `definePrerenderRoutes` 在全仓 `src` 里并不存在（P9-05 遗留）。
 */
import { describe, it, expect } from 'vitest';
import { getJson } from './helper';

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
        'concurrency',
        'payloadExtract'
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

  it('action=payloadExtract extracts SSG payload to __data.json and rewrites HTML', async () => {
    const res = await getJson('/api/prerender-test?action=payloadExtract');
    expect(res.status).toBe(200);
    const data = res.data as {
      generatedRoutes: string[];
      generatedCount: number;
      rootDataPath: string;
      aboutDataPath: string;
      rootDataMatches: boolean;
      aboutDataMatches: boolean;
      rootHtmlNoInlineScript: boolean;
      aboutHtmlNoInlineScript: boolean;
      rootHtmlHasPreload: boolean;
      aboutHtmlHasPreload: boolean;
      rootHtmlHasBootstrap: boolean;
      aboutHtmlHasBootstrap: boolean;
      standaloneExtractsData: boolean;
      standaloneDataUrl?: string;
      standaloneHtmlHasPreload?: boolean;
      standaloneHtmlNoInlineScript?: boolean;
    };

    // Both routes were prerendered
    expect(data.generatedCount).toBe(2);
    expect(data.generatedRoutes).toContain('/');
    expect(data.generatedRoutes).toContain('/about');

    // __data.json files written at expected paths
    expect(data.rootDataPath).toBe('/.output/public/__data.json');
    expect(data.aboutDataPath).toBe('/.output/public/about/__data.json');

    // __data.json content matches the inline payload
    expect(data.rootDataMatches).toBe(true);
    expect(data.aboutDataMatches).toBe(true);

    // HTML no longer contains the inline __UBEAN_DATA__ script
    expect(data.rootHtmlNoInlineScript).toBe(true);
    expect(data.aboutHtmlNoInlineScript).toBe(true);

    // HTML contains preload link with correct dataUrl
    expect(data.rootHtmlHasPreload).toBe(true);
    expect(data.aboutHtmlHasPreload).toBe(true);

    // HTML contains bootstrap script setting __UBEAN_DATA_PAYLOAD__
    expect(data.rootHtmlHasBootstrap).toBe(true);
    expect(data.aboutHtmlHasBootstrap).toBe(true);

    // Standalone extractDataPayload() also works as expected
    expect(data.standaloneExtractsData).toBe(true);
    expect(data.standaloneDataUrl).toBe('/about/__data.json');
    expect(data.standaloneHtmlHasPreload).toBe(true);
    expect(data.standaloneHtmlNoInlineScript).toBe(true);
  });
});
