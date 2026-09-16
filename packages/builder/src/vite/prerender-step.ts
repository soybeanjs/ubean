/**
 * 预渲染步骤（RM-V21 的最后一环）。
 *
 * 原先这段逻辑长在 `cli/src/build.ts` 里 —— 于是 `vite build`（插件驱动的编排）永远产不出
 * 静态 HTML：实测两条路径的产物清单逐项一致，唯一差异就是 9 个预渲染页面。把它搬进
 * `runEnvBuilds`（两条路径共用）之后，`vite build` 与 `ubean build` 才有可比性。
 *
 * 包含三件事：SSG 静态渲染器 / SSR fetcher 的选择、`prerender()` 调用、内容搜索索引
 * （`__search.json` + 可选 Pagefind）。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolvePrerenderConfig } from '@ubean/config';
import type { ResolvedConfig } from '@ubean/config';
import type { ScanResult } from '@ubean/scan';
import { getLogger } from '@ubean/shared/logger';
import { join, resolve } from 'pathe';
import { prerender } from '../prerender';
import type { BuildManifest } from '../production';
import { createStaticSsgRenderer } from '../static-render';

const logger = getLogger('build');

type Fetcher = (url: string) => Promise<{ html: string; statusCode: number }>;

/**
 * 用构建好的 SSR entry 驱动渲染：import `entry.mjs`，取其 `createFetchHandler()`，再用合成的
 * `http://localhost<path>` 请求驱动。
 */
export async function createSsrFetcher(cwd: string, manifest: BuildManifest): Promise<Fetcher | undefined> {
  try {
    const entryPath = resolve(cwd, manifest.serverDir, 'entry.mjs');
    const entryUrl = pathToFileURL(entryPath).href;
    const mod = await import(entryUrl);
    const createFetchHandler = mod.default ?? mod.createFetchHandler;
    if (typeof createFetchHandler !== 'function') {
      logger.warn('SSR entry does not export createFetchHandler; falling back to placeholder prerender.');
      return undefined;
    }
    const fetch = await createFetchHandler();
    if (typeof fetch !== 'function') {
      logger.warn('SSR entry did not return a fetch handler; falling back to placeholder prerender.');
      return undefined;
    }
    return async (url: string) => {
      const req = new Request(`http://localhost${url || '/'}`, { headers: { 'x-ubean-prerender': '1' } });
      const res = await fetch(req);
      const html = typeof res.text === 'function' ? await res.text() : String(res.body ?? '');
      return { html, statusCode: res.status ?? 200 };
    };
  } catch (err) {
    logger.warn(
      `Failed to load SSR entry for prerender: ${err instanceof Error ? err.message : String(err)}. Falling back to placeholder prerender.`
    );
    return undefined;
  }
}

export interface RunPrerenderStepOptions {
  cwd: string;
  config: ResolvedConfig;
  scanResult: ScanResult;
  manifest: BuildManifest;
  /** 内容集合快照（content 启用时有值）——用于派生内容路由与搜索索引。 */
  /**
   * 内容集合快照。类型刻意宽松（`ContentDocument` 在 `@ubean/content` 里，builder 不依赖它）：
   * 这里只做转发，形状由调用方（CLI / 插件）保证。
   */
  contentSnapshot?: Record<string, unknown[]> | undefined;
}

/**
 * 预渲染 + 内容搜索索引。未启用预渲染（`prerender.enabled` 为假且 routeRules 无
 * `prerender: true`）时整段跳过。
 */
export async function runPrerenderStep(options: RunPrerenderStepOptions): Promise<void> {
  const { cwd, config, scanResult, manifest, contentSnapshot } = options;

  // P9-03: routeRules 中 `prerender: true` 的路由同样触发预渲染
  const hasPrerenderRules = Object.values(config.routeRules || {}).some(rule => rule?.prerender === true);
  if (!config.prerender.enabled && !hasPrerenderRules) return;

  logger.info('Prerendering static pages...');

  // 内容路由（content 启用时）：从快照派生，不需要调用方额外传参
  let contentRoutes: string[] = [];
  if (contentSnapshot) {
    try {
      const contentMod = await import('@ubean/content');
      contentRoutes = contentMod.extractContentPageRoutes(Object.values(contentSnapshot).flat() as never);
    } catch {
      /* `@ubean/content` 不可用（非 content 项目或未安装）：无需内容路由 */
    }
  }

  let fetcher: Fetcher | undefined;
  let notFoundRoute = false;
  let expandRoutes: ((routes: string[]) => string[]) | undefined;

  if (config.mode === 'ssg') {
    // 静态 SSG 模式：直接渲染路径（绕过 Hono 请求管道，见 ADR-0011）
    const staticRenderer = await createStaticSsgRenderer(cwd, manifest, {
      pages: scanResult.pages,
      notFoundPage: scanResult.notFoundPage ?? null,
      i18n: config.i18n
    });
    if (staticRenderer) {
      fetcher = staticRenderer.fetcher;
      expandRoutes = staticRenderer.expandRoutes;
      // 无 pages/404.vue 时不入队哨兵路由（fetcher 会 404，徒增错误噪音）
      notFoundRoute = Boolean(scanResult.notFoundPage);
      logger.info('Using static SSG renderer (direct render, no HTTP pipeline)');
    }
  } else {
    fetcher = await createSsrFetcher(cwd, manifest);
  }

  await prerender({
    cwd,
    outputDir: config.build.outputDir,
    pages: scanResult.pages,
    prerender: config.prerender,
    routeRules: config.routeRules,
    contentRoutes,
    fetcher,
    notFoundRoute,
    expandRoutes
  });

  if (!contentSnapshot) return;

  // SSG / 预渲染全文搜索索引：sections JSON（`__search.json`）+ 可选 Pagefind 分片
  try {
    const contentMod = await import('@ubean/content');
    const searchConfig = contentMod.resolveContentSearchConfig(config.content as never, {
      ssg: config.mode === 'ssg'
    });
    const staticDir = resolve(cwd, resolvePrerenderConfig(config.prerender).staticDir);

    if (searchConfig.sections) {
      const payload = contentMod.generateSearchSectionsSnapshot(contentSnapshot as never);
      await mkdir(staticDir, { recursive: true });
      await writeFile(join(staticDir, '__search.json'), JSON.stringify(payload), 'utf-8');
      const sectionCount = Object.values(payload).reduce((sum, sections) => sum + sections.length, 0);
      logger.info(`Search: wrote __search.json (${sectionCount} sections)`);
    }

    if (searchConfig.pagefind) {
      const res = await contentMod.runPagefindIndex({
        siteDir: staticDir,
        createIndexOptions: searchConfig.pagefindOptions,
        logger: { info: msg => logger.info(msg), warn: msg => logger.warn(msg) }
      });
      if (res.indexed) logger.info('Search: pagefind index generated');
      else if (res.reason === 'pagefind-not-installed') {
        logger.info('Search: pagefind is not installed — skipping index. Run `pnpm add -D pagefind` to enable.');
      } else {
        logger.warn(`Search: pagefind indexing failed — ${res.error ?? res.reason}`);
      }
    }
  } catch (err) {
    logger.warn(`Search index generation skipped: ${err instanceof Error ? err.message : String(err)}`);
  }
}
