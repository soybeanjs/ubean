/**
 * 静态 SSG entry 代码生成（mode: 'ssg' 专用，见 docs/adr/0011-lightweight-ssg-direct-render.md）。
 *
 * 与 fullstack server entry 的差异：
 * - 不实例化 Hono app（无 createUbeanApp / API 路由 / 中间件 / crons / IPX）
 * - 导出 `renderStaticPage(input)` 供 `createStaticSsgRenderer` 直接调用，
 *   渲染链为 `renderPage → createVueRenderer.render → renderToString`
 * - 路由表追加 NotFound 静态路由（`/404`，优先级高于任何 catch-all，
 *   保证 404.html 产物渲染 pages/404.vue）
 *
 * `buildRendererSetup` / `buildAssetTagsSetup` 从 production.ts 抽取，
 * fullstack 与 static 两个 entry 引用同一份生成逻辑（防模板漂移）。
 */

export interface RendererSetupOptions {
  /** SSR 是否启用（fullstack 由 config.ssr.enabled 决定；ssg 恒 true） */
  ssrEnabled: boolean;
  /** 当前 app mode，仅用于注释 */
  mode: string;
  /** i18n vue-router locale 参数（如 `:locale(zh)?`），空串表示无前缀策略 */
  localeVueParam: string;
  /** static entry 专用：追加 NotFound catch-all 路由（依赖外层 `_notFoundPage` 变量） */
  notFoundCatchAll?: boolean;
}

/**
 * 生成 renderer setup 代码块（`_rendererRoutes` + `_pageRenderer`）。
 *
 * 依赖外层已定义：`_pages` / `_layouts` / `pageLoaders` / `layoutLoaders` /
 * （notFoundCatchAll 时）`_notFoundPage`，以及 `toVueRouterLocalePath` 导入。
 * ssrEnabled=false 时 `_pageRenderer = null`（与 fullstack 现状一致）。
 */
export function buildRendererSetup(options: RendererSetupOptions): string {
  const { ssrEnabled, mode, localeVueParam, notFoundCatchAll } = options;

  if (!ssrEnabled) {
    return `
// --- SSR disabled (mode=${mode}) ---
// pageRenderer is null; page requests fall back to a client-only HTML shell.
const _pageRenderer = null;`;
  }

  return `
// --- SSR renderer setup ---
const _defaultLayout = _layouts.find(l => l.isDefault)?.name || null;

// Same i18n locale param as the client virtual:ubean-pages route table, so
// language-prefixed URLs (e.g. /zh/playground) match the real page on SSR too.
const _localeVueParam = ${JSON.stringify(localeVueParam)};

const _rendererRoutes = _pages.map(p => {
  // For reuse routes, load the target page's module (the .reuse.ts file
  // only contains definePage metadata, not a Vue component).
  const _targetPage = p.isReuse && p.reuseTarget ? _pages.find(tp => tp.name === p.reuseTarget) : undefined;
  const _loaderKey = _targetPage?.relativePath || p.relativePath;
  return {
    path: _localeVueParam
      ? toVueRouterLocalePath(p.route.replace(/\\*\\*:(\\w[\\w-]*)/g, ':$1(.*)*'), _localeVueParam)
      : p.route.replace(/\\*\\*:(\\w[\\w-]*)/g, ':$1(.*)*'),
    name: p.name,
    component: async () => {
      const loader = pageLoaders[_loaderKey];
      if (!loader) throw new Error('Page loader not found: ' + _loaderKey);
      const mod = await loader();
      return mod.default || mod;
    },
    meta: {
      layout: p.layout === false ? false : p.layout || _defaultLayout,
      pageName: p.name,
      cache: p.cache === true ? true : undefined
    }
  };
});${
    notFoundCatchAll
      ? `

// 404 渲染路由：注册为静态路径 /404（而非客户端的 /:pathMatch(.*)* catch-all）。
// vue-router 中静态段确定性优先于 repeatable 参数 —— 即使应用存在根 catch-all
// 页面（如 [...slug].vue），/404 也稳定命中本路由，保证 404.html 产物
// 渲染的是 pages/404.vue 而非被 catch-all 抢占。
if (_notFoundPage) {
  const _nfLoaderKey = _notFoundPage.relativePath;
  _rendererRoutes.push({
    path: _localeVueParam
      ? toVueRouterLocalePath('/404', _localeVueParam)
      : '/404',
    name: 'NotFound',
    component: async () => {
      const loader = pageLoaders[_nfLoaderKey];
      if (!loader) throw new Error('Page loader not found: ' + _nfLoaderKey);
      const mod = await loader();
      return mod.default || mod;
    },
    meta: { pageName: 'NotFound' }
  });
}`
      : ''
  }

const _layoutMap = new Map();
for (const l of _layouts) {
  _layoutMap.set(l.name, l.relativePath);
}

const _pageRenderer = createVueRenderer({
  routes: _rendererRoutes,
  async resolveLayoutComponent(name) {
    if (name === false || name == null) return null;
    const relPath = _layoutMap.get(name);
    if (!relPath) return null;
    const loader = layoutLoaders[relPath];
    if (!loader) return null;
    const mod = await loader();
    return mod.default || mod;
  },
  defaultLayout: _defaultLayout,
  resolveAppConfig: () => _resolveAppConfig('server')
});
`;
}

/**
 * 生成 client asset tags 代码块（读取 `.vite/manifest.json`）。
 * 依赖外层已定义 `readFileSync` / `join` / `dirname` / `fileURLToPath` 导入。
 */
export function buildAssetTagsSetup(favicon?: string | null): string {
  return `
// --- Client asset tags from Vite manifest ---
const __dirname = dirname(fileURLToPath(import.meta.url));
let _assetTags = { css: '', preloads: '', body: '', favicon: ${JSON.stringify(favicon)} };
try {
  const manifestPath = join(__dirname, '..', 'public', '.vite', 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  const entry = Object.values(manifest).find(m => m.isEntry);
  if (entry) {
    _assetTags.body = '<script type="module" src="/' + entry.file + '"></script>';
    if (Array.isArray(entry.css)) {
      _assetTags.css = entry.css.map(c => '<link rel="stylesheet" href="/' + c + '">').join('\\n');
    }
  }
} catch (e) {
  console.warn('[ubean] Failed to load client manifest:', e.message || e);
}
`;
}

export interface StaticSsgEntryInput {
  /** JSON 字符串字面量：pages glob（import.meta.glob 参数） */
  pagesGlob: string;
  /** JSON 字符串字面量：layouts glob */
  layoutsGlob: string;
  /** JSON 字符串字面量：src 前缀（normalizeKey 用） */
  srcPrefix: string;
  /** JSON 字面量：ScannedPageRoute[] 元数据（与 fullstack entry 相同的序列化字段） */
  pagesJson: string;
  /** JSON 字面量：ScannedLayout[] 元数据 */
  layoutsJson: string;
  /** JSON 字面量：notFoundPage 元数据或 `null` */
  notFoundPageJson: string;
  /** i18n vue-router locale 参数（空串表示无前缀） */
  localeVueParam: string;
  /** content collections 引导代码（import + registerContent），可为空串 */
  contentBootstrap: string;
  /** 预渲染的 no-FOUC color-mode 脚本（空串表示禁用） */
  colorModeScript: string;
  /** favicon HREF（与 fullstack entry 的 config.favicon 一致） */
  favicon?: string | null;
}

/**
 * 生成静态 SSG entry 源码（写入 virtualDir/server-entry.mjs，由 SSR build
 * 产出 dist/server/entry.mjs）。
 *
 * 导出契约：
 * - `renderStaticPage({ pageName, params, url, locale }) → { html, statusCode }`
 * - `pageLoaders`（调试用）
 */
export function buildStaticSsgEntry(input: StaticSsgEntryInput): string {
  const {
    pagesGlob,
    layoutsGlob,
    srcPrefix,
    pagesJson,
    layoutsJson,
    notFoundPageJson,
    localeVueParam,
    contentBootstrap,
    colorModeScript,
    favicon
  } = input;

  return `// Auto-generated ubean static SSG entry (mode: ssg)
import { renderPage } from '@ubean/pages';
import { createVueRenderer } from 'ubean/ssr';
import { toVueRouterLocalePath } from '@ubean/i18n';
import { i18nConfig as _i18nConfig, loadLocales as _loadLocales } from 'ubean:locales';
import { resolveAppConfig as _resolveAppConfig } from 'virtual:ubean-app';
${contentBootstrap}
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pageModules = import.meta.glob(${pagesGlob}, { eager: false });
const layoutModules = import.meta.glob(${layoutsGlob}, { eager: false });

const _srcPrefix = ${srcPrefix};
function normalizeKey(p) {
  const prefixes = ['/pages/', '/layouts/'];
  for (const prefix of prefixes) {
    const fullPrefix = _srcPrefix + prefix;
    if (p.includes(fullPrefix)) {
      const idx = p.indexOf(fullPrefix);
      return p.slice(idx + fullPrefix.length);
    }
  }
  return p;
}

export const pageLoaders = {};
for (const [key, loader] of Object.entries(pageModules)) {
  pageLoaders[normalizeKey(key)] = loader;
}

const layoutLoaders = {};
for (const [key, loader] of Object.entries(layoutModules)) {
  layoutLoaders[normalizeKey(key)] = loader;
}

const _pages = ${pagesJson};
const _layouts = ${layoutsJson};
const _notFoundPage = ${notFoundPageJson};
const _hasDefaultLayout = _layouts.some(l => l.isDefault);
${buildRendererSetup({ ssrEnabled: true, mode: 'ssg', localeVueParam, notFoundCatchAll: true })}
${buildAssetTagsSetup(favicon)}
const _colorModeScript = ${JSON.stringify(colorModeScript)};

// --- i18n ---
const _i18nEnabled = _i18nConfig && _i18nConfig.enabled !== false;
const _localeCodes = _i18nEnabled
  ? (_i18nConfig.locales || []).map(l => (typeof l === 'string' ? l : l.code))
  : [];
const _defaultLocale = (_i18nEnabled && _i18nConfig.defaultLocale) || '';
let _localesReady = false;

async function _ensureLocales() {
  if (_localesReady) return;
  _localesReady = true;
  if (!_i18nEnabled || _localeCodes.length === 0) return;
  try {
    await _loadLocales();
  } catch (e) {
    console.warn('[ubean-ssg] Failed to load locales:', (e && e.message) || e);
  }
}

// 静态模式不执行 loader —— 检测到页面导出 loader 时警告一次（每页）
const _loaderWarned = new Set();

/**
 * 渲染单个静态页面（由 createStaticSsgRenderer 调用）。
 *
 * @param input.pageName 目标页面名（ScannedPageRoute.name）或 'NotFound'
 * @param input.params   路由参数（matchRoutePattern 提取）
 * @param input.url      完整 URL path（含 locale 前缀与 query）
 * @param input.locale   渲染语言（prefix 策略下已从 URL 提取）
 */
export async function renderStaticPage(input) {
  const pageName = input && input.pageName;
  const page = pageName === 'NotFound' ? _notFoundPage : _pages.find(p => p.name === pageName);
  if (!page) return { html: '', statusCode: 404 };

  await _ensureLocales();

  // loader 检测 warn（模块加载有缓存，此处与渲染共用同一实例）
  const _targetPage =
    page.isReuse && page.reuseTarget ? _pages.find(tp => tp.name === page.reuseTarget) : undefined;
  const _loaderKey = (_targetPage && _targetPage.relativePath) || page.relativePath;
  const _modLoader = pageLoaders[_loaderKey];
  if (_modLoader && !_loaderWarned.has(page.name)) {
    try {
      const mod = await _modLoader();
      if (mod && typeof mod.loader === 'function') {
        _loaderWarned.add(page.name);
        console.warn(
          '[ubean-ssg] page "' + page.name + '" exports \`loader\`, which is not executed in static SSG mode'
        );
      }
    } catch {}
  }

  // renderContext 构造与 routes/router.ts 的页面渲染路径保持一致
  const renderContext = {};
  const locale = (input && input.locale) || _defaultLocale;
  if (_i18nEnabled && locale) {
    renderContext.locale = locale;
    renderContext.localeDir = 'ltr';
    renderContext.routing = {
      defaultLocale: _i18nConfig.defaultLocale || 'en',
      locales: _localeCodes,
      strategy: _i18nConfig.strategy || 'prefix_except_default'
    };
    const cookieName =
      _i18nConfig.detectBrowserLanguage && _i18nConfig.detectBrowserLanguage.cookieName;
    if (cookieName) renderContext.cookieName = cookieName;
    if (_i18nConfig.baseUrl) renderContext.baseUrl = _i18nConfig.baseUrl;
    try {
      const i18nMod = await import('ubean/i18n');
      renderContext.localeDir = i18nMod.getLocaleDir(locale);
      renderContext.messages = i18nMod.getLocaleMessages(locale);
      const fallback = i18nMod.getFallbackLocale();
      renderContext.fallbackLocale = fallback;
      if (fallback !== locale) {
        renderContext.fallbackMessages = i18nMod.getLocaleMessages(fallback);
      }
      renderContext.availableLocales = i18nMod.getRegisteredLocalesMeta();
    } catch {}
  }

  // pageObj 构造与 routes/router.ts handlePageRequest 保持一致
  const pageObj = {
    component: page.reuseTarget || page.name,
    props: {},
    params: (input && input.params) || {},
    url: (input && input.url) || '/',
    layout: page.layout === false
      ? false
      : page.layout || (page.pageMeta && page.pageMeta.layout) || (_hasDefaultLayout ? 'default' : false),
    errors: null,
    head: page.pageMeta && page.pageMeta.head
  };

  let html = await renderPage(pageObj, _assetTags, _pageRenderer, 'app', renderContext);
  if (_colorModeScript) {
    html = html.replace('<head>', '<head>\\n    ' + _colorModeScript);
  }
  return { html, statusCode: 200 };
}
`;
}
