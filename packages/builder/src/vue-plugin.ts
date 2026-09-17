import { createRequire } from 'node:module';
import { transformWithOxc } from 'vite';
import type { Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import Components from 'unplugin-vue-components/vite';
import Markdown from 'unplugin-vue-markdown/vite';
import AutoImport from 'unplugin-auto-import/vite';
import { getColorModeScript, resolveColorModeConfig, getPartyTownScript, resolvePartyTownConfig } from '@ubean/client';
import type { ResolvedConfig as UbeanResolvedConfig } from '@ubean/config';
import { getVueLocaleParam } from '@ubean/i18n';
import { ubeanMdxPlugin } from '@ubean/markdown';
import { renderFaviconLink } from '@ubean/pages';
import { scanProject } from '@ubean/scan';
import type { ScanResult } from '@ubean/scan';
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite';
import { join, resolve } from 'pathe';
import { getAutoImportPresets, resolveAutoImportsConfig, resolveComponentsConfig, toArray } from './codegen';
import { isFrameworkHtmlPage } from './dev/dev-request-router';
import { getDevScanCoordinator } from './dev/dev-scan';
import { getComponentResolvers } from './registry';
import { ssrSingletonDevPolicy } from './ssr-singleton';
import { createVirtualRegistry } from './virtual-registry';
import type { VirtualModuleRegistry } from './virtual-registry';
import {
  createVuePagesVirtualModule,
  createVueAppEntryVirtualModule,
  createClientEntryVirtualModule,
  createServerEntryVirtualModule
} from './vue-virtual-modules';

export interface UbeanViteOptions {
  config: UbeanResolvedConfig;
  ssr?: boolean;
  /** 虚拟模块注册表（RM-V02）：与 `ubeanPlugin` 注入同一个实例，插件侧只读。 */
  registry?: VirtualModuleRegistry;
  /**
   * 是否由本插件注册 `@vitejs/plugin-vue`（默认 **true**）。
   *
   * RM-V14：`ubeanPlugin()` 是用户 `vite.config.ts` 里的唯一入口，`vite dev` 要能独立
   * 服务应用，.vue 就必须有人编译 —— 此前这一步由 CLI 的 dev server 代劳（`builtinPlugins`
   * 里单独 `vue({ include: VUE_PLUGIN_INCLUDE })`），于是同一份 `ubeanPlugin()` 在
   * `ubean dev` 下可用、在 `vite dev` 下直接报 “Install @vitejs/plugin-vue”。现在由本插件
   * 拥有该注册，两条路径拿到的插件集合一致；CLI 不再重复添加（重复注册会让 .vue 被编译两次）。
   * 需要自带 vue 插件配置（如自定义 `template.compilerOptions`）时传 `false`。
   */
  vue?: boolean;
}

export const VUE_PLUGIN_INCLUDE = [/\.vue$/, /\.md$/];

const VIRTUAL_PAGES = 'virtual:ubean-pages';
const VIRTUAL_APP = 'virtual:ubean-app';
const VIRTUAL_CLIENT = 'virtual:ubean-client-entry';
const VIRTUAL_SERVER = 'virtual:ubean-server';
const CLIENT_ENTRY_URL = `/@id/${VIRTUAL_CLIENT}`;

// Virtual modules that contain TypeScript code
const TS_VIRTUAL_IDS = [VIRTUAL_PAGES, VIRTUAL_APP, VIRTUAL_SERVER];
const VIRTUAL_IDS = [VIRTUAL_PAGES, VIRTUAL_APP, VIRTUAL_CLIENT, VIRTUAL_SERVER];

// 兼容旧 ID 映射
const HASH_ID_TO_VIRTUAL: Record<string, string> = {
  '#ubean-pages': VIRTUAL_PAGES,
  '#ubean-app': VIRTUAL_APP,
  '#ubean-client-entry': VIRTUAL_CLIENT,
  '#ubean-server': VIRTUAL_SERVER
};

// Vite convention: \0 prefix prevents other plugins from processing virtual modules.
// We append `.ts` so Vite's esbuild parser uses the TypeScript loader — without it,
// syntax like `as const` and `export type` in the generated virtual modules fails
// to parse (esbuild defaults to the JS loader for IDs without a TS extension).
const NULL_PREFIX = '\0';
const VIRTUAL_EXT = '.ts';

function toResolvedVirtualId(virtualId: string): string {
  return NULL_PREFIX + virtualId + VIRTUAL_EXT;
}

function parseResolvedVirtualId(resolvedId: string): string | undefined {
  if (!resolvedId.startsWith(NULL_PREFIX)) return undefined;
  const withoutPrefix = resolvedId.slice(NULL_PREFIX.length);
  if (!withoutPrefix.endsWith(VIRTUAL_EXT)) return undefined;
  const virtualId = withoutPrefix.slice(0, -VIRTUAL_EXT.length);
  return VIRTUAL_IDS.includes(virtualId) ? virtualId : undefined;
}

function localeVueParamFromConfig(config: UbeanResolvedConfig): string | undefined {
  if (config.i18n?.enabled === false) return undefined;
  const codes = (config.i18n?.locales || []).map(l => l.code);
  if (codes.length === 0) return undefined;
  const param = getVueLocaleParam({
    defaultLocale: config.i18n.defaultLocale,
    locales: codes,
    strategy: config.i18n.strategy
  });
  return param || undefined;
}

export function ubeanVite(options: UbeanViteOptions): Plugin[] {
  const { config: ubeanConfig } = options;
  const virtualRegistry = options.registry ?? createVirtualRegistry();
  // ResolvedConfig.srcDir 已是绝对路径（loader 保证），resolve 不会像 join 那样二次拼接
  const srcDir = resolve(ubeanConfig.rootDir, ubeanConfig.srcDir);
  const dtsDir = join(ubeanConfig.rootDir, '.ubean');
  const markdownEnabled = ubeanConfig.markdown?.enabled !== false;
  const mdxEnabled = ubeanConfig.markdown?.mdx === true;
  const autoImports = resolveAutoImportsConfig(ubeanConfig.autoImports);
  const componentsAutoImport = resolveComponentsConfig(ubeanConfig.components);
  const markdownComponentsAutoImport = ubeanConfig.markdown?.components?.autoImport !== false;

  const composablesDirName = ubeanConfig.dir.composables || 'composables';
  const componentsDirName = ubeanConfig.dir.components || 'components';
  const composablesDirs = [join(srcDir, composablesDirName), ...(autoImports.options.dirs ?? [])];
  const componentsDirs = [join(srcDir, componentsDirName), ...(componentsAutoImport.options.dirs ?? [])];

  const mdExtensions = mdxEnabled ? ['md', 'mdx'] : ['md'];

  function getVirtualModule(virtualId: string) {
    return virtualRegistry.getModules().find(m => m.id === virtualId);
  }

  async function loadVirtualModule(virtualId: string): Promise<string | undefined> {
    const mod = getVirtualModule(virtualId);
    if (!mod) return undefined;
    return mod.load();
  }

  function scanProjectOnce() {
    return scanProject({
      cwd: ubeanConfig.rootDir,
      srcDir: ubeanConfig.srcDir,
      dirs: ubeanConfig.dir,
      ignore: ubeanConfig.scanOptions?.ignore
    });
  }

  async function scanAndRegister() {
    applyScan(await scanProjectOnce());
  }

  /**
   * 依据扫描结果重建本插件的虚拟模块。
   *
   * 与扫描分离（RM-V13）：dev 下扫描由 `dev-scan.ts` 的协调器统一触发一次，core / vue / CLI
   * 三个订阅者各取所需；`buildStart` 与构建期则继续走 `scanAndRegister()`。
   */
  function applyScan(result: ScanResult): void {
    virtualRegistry.register(
      createVuePagesVirtualModule(
        result.pages,
        result.layouts,
        result.notFoundPage,
        result.loadingPage,
        result.errorPage,
        localeVueParamFromConfig(ubeanConfig)
      )
    );
    virtualRegistry.register(createVueAppEntryVirtualModule(result.appEntry));
    virtualRegistry.register(createServerEntryVirtualModule(result.serverEntry));
    virtualRegistry.register(createClientEntryVirtualModule());
  }

  const HASH_IDS = Object.keys(HASH_ID_TO_VIRTUAL);

  const corePlugin: Plugin = {
    name: 'ubean:vue',
    enforce: 'pre',

    async buildStart() {
      await scanAndRegister();
    },

    resolveId(id, importer, opts) {
      // 兼容旧 #ubean-xxx ID
      if (HASH_ID_TO_VIRTUAL[id]) {
        return toResolvedVirtualId(HASH_ID_TO_VIRTUAL[id]);
      }
      // virtual:ubean-xxx ID — resolve with \0 prefix + `.ts` so Vite parses
      // the generated TypeScript content with the proper loader.
      if (VIRTUAL_IDS.includes(id)) {
        return toResolvedVirtualId(id);
      }
      // Client must never load the ALS / `@intlify/core` entry.
      if (id === '@ubean/i18n' && !opts?.ssr) {
        return this.resolve('@ubean/i18n/browser', importer, { skipSelf: true, ...opts });
      }
      return undefined;
    },

    async load(id) {
      const virtualId = parseResolvedVirtualId(id);
      if (virtualId) {
        let code = await loadVirtualModule(virtualId);
        if (code && TS_VIRTUAL_IDS.includes(virtualId)) {
          // Use Vite's transformWithOxc to strip TypeScript types for SSR compatibility
          const result = await transformWithOxc(code, `${virtualId}.ts`);
          code = result.code;
        }
        return code;
      }
      return undefined;
    },

    config() {
      const require = createRequire(import.meta.url);
      let vueI18nEntry = 'vue-i18n';
      let intlifyCoreEntry = '@intlify/core';
      let intlifyBaseEntry = '@intlify/core-base';
      try {
        vueI18nEntry = require.resolve('vue-i18n/dist/vue-i18n.esm-bundler.js');
      } catch {
        try {
          vueI18nEntry = require.resolve('vue-i18n');
        } catch {
          /* keep specifier */
        }
      }
      try {
        intlifyCoreEntry = require.resolve('@intlify/core/dist/core.node.mjs');
      } catch {
        /* keep specifier */
      }
      try {
        intlifyBaseEntry = require.resolve('@intlify/core-base/dist/core-base.mjs');
      } catch {
        /* keep specifier */
      }
      const singleton = ssrSingletonDevPolicy();
      return {
        appType: 'custom',
        resolve: {
          ...singleton.resolve,
          alias: {
            'vue-i18n': vueI18nEntry,
            '@intlify/core': intlifyCoreEntry,
            '@intlify/core-base': intlifyBaseEntry
          }
        },
        optimizeDeps: {
          exclude: [...singleton.optimizeDeps.exclude, ...VIRTUAL_IDS, ...HASH_IDS],
          include: singleton.optimizeDeps.include
        },
        ssr: singleton.ssr
      };
    },

    transformIndexHtml(html, ctx) {
      // 框架内置的 HTML 页面（DevTools SPA、Scalar 文档页）自带入口与文档结构，注入应用的客户端
      // 入口只会让 Vue 在缺 `#app` 的文档里报错。判据与 dev 请求路由同源（`isFrameworkHtmlPage`）。
      if (ctx?.path && isFrameworkHtmlPage(ctx.path)) {
        return html;
      }
      let result = html;
      // P9-21: Inject color mode no-FOUC script as the first element in <head>
      // so the correct class/attribute is set before the browser paints.
      const colorModeConfig = ubeanConfig.colorMode;
      if (colorModeConfig !== false) {
        const script = getColorModeScript(resolveColorModeConfig(colorModeConfig));
        result = result.replace('<head>', `<head>\n    ${script}`);
      }
      // P9-22: Inject Partytown config script when enabled.
      // Partytown must be configured before third-party scripts that use
      // `type="text/partytown"` so it can intercept them and run in a Web Worker.
      const partyTownConfig = ubeanConfig.partyTown;
      if (partyTownConfig !== false && partyTownConfig !== undefined) {
        const resolved = resolvePartyTownConfig(partyTownConfig === true ? { enabled: true } : partyTownConfig);
        if (resolved.enabled) {
          const script = getPartyTownScript(resolved);
          if (script) {
            result = result.replace('</head>', `    ${script}\n</head>`);
          }
        }
      }
      // Inject the resolved favicon if the user hasn't declared any
      // <link rel="icon"> of their own. Reads config.favicon — the same
      // value the SSR shell uses — so the dev HTML stays in sync with the
      // prerendered output. Null (favicon: false or none found) injects
      // nothing. Users override by adding their own link or via definePage().
      if (!/<link\b[^>]*rel=["']icon["']/i.test(result)) {
        const faviconLink = renderFaviconLink(ubeanConfig.favicon ?? undefined);
        if (faviconLink) {
          result = result.replace('<head>', `<head>\n    ${faviconLink}`);
        }
      }
      if (result.includes(CLIENT_ENTRY_URL) || result.includes(VIRTUAL_CLIENT)) return result;
      return result.replace('</body>', `  <script type="module" src="${CLIENT_ENTRY_URL}"></script>\n</body>`);
    },

    configureServer(server) {
      // RM-V13：不再自建监听、不再自己扫盘，也不再自己发 `full-reload`。
      // 扫描由 dev-scan 协调器统一触发一次；重载由协调器在所有订阅者（含 CLI 的 app 重建）
      // 完成之后发出 —— 原实现在这里立刻 `full-reload`，会与 CLI 的重建抢跑，让浏览器带着
      // 旧的 `definePage` 元数据刷新。
      const coordinator = getDevScanCoordinator(server, source => ({
        rootDir: ubeanConfig.rootDir,
        srcDir: ubeanConfig.srcDir,
        dirs: ubeanConfig.dir,
        ignore: ubeanConfig.scanOptions?.ignore,
        source,
        scan: scanProjectOnce,
        reload: () => server.ws.send({ type: 'full-reload' })
      }));

      coordinator.subscribe(result => {
        applyScan(result);
        for (const vid of VIRTUAL_IDS) {
          const mod = server.moduleGraph.getModuleById(toResolvedVirtualId(vid));
          if (mod) {
            server.moduleGraph.invalidateModule(mod);
          }
        }
      });
    }
  };

  const plugins: Plugin[] = [corePlugin];

  // RM-V14：.vue / .md 的编译由本插件拥有（默认开启），使 `ubeanPlugin()` 自足。
  // 自定义元素前缀 `ubean-` 必须在这里保留 —— 内置组件（`<ubean-island>` 等）不能被
  // Vue 编译器当作未知组件处理。
  if (options.vue !== false) {
    plugins.unshift(
      vue({
        include: VUE_PLUGIN_INCLUDE,
        template: {
          compilerOptions: {
            isCustomElement: (tag: string) => tag.startsWith('ubean-')
          }
        }
      }) as unknown as Plugin
    );
  }

  if (ubeanConfig.i18n?.enabled !== false) {
    plugins.push(
      VueI18nPlugin({
        include: [join(srcDir, 'locales/**')],
        ssr: true,
        compositionOnly: true,
        runtimeOnly: false
      }) as Plugin
    );
  }

  if (markdownEnabled) {
    const markdownOptions = {
      ...ubeanConfig.markdown?.markdownExit,
      html: true
    };

    plugins.push(
      Markdown({
        markdownOptions,
        wrapperClasses: ubeanConfig.markdown?.wrapperClass ?? 'markdown-body',
        headEnabled: true,
        headField: 'head'
      }) as Plugin
    );
  }

  // P9-20: MDX real compilation plugin
  if (mdxEnabled) {
    plugins.push(
      ubeanMdxPlugin({
        remarkPlugins: ubeanConfig.markdown?.remarkPlugins || [],
        rehypePlugins: ubeanConfig.markdown?.rehypePlugins || []
      }) as Plugin
    );
  }

  if (autoImports.enabled) {
    const userAutoImports = autoImports.options;
    plugins.push(
      AutoImport({
        // 框架默认 → 用户透传 → 框架合成字段（imports/dirs/dts 由分库开关与用户配置合成）
        vueTemplate: true,
        eslintrc: { enabled: false },
        ...userAutoImports,
        imports: [...getAutoImportPresets(autoImports), ...toArray(userAutoImports.imports)],
        dirs: composablesDirs,
        dts: userAutoImports.dts === undefined ? join(dtsDir, 'auto-imports.d.ts') : userAutoImports.dts
      }) as Plugin
    );
  }

  const UBEAN_BUILTIN_COMPONENTS = ['Link', 'Head', 'PageView', 'ClientOnly'];

  function ubeanComponentsResolver(componentName: string) {
    if (UBEAN_BUILTIN_COMPONENTS.includes(componentName)) {
      return { name: componentName, from: 'ubean/client' };
    }
  }

  // Merge built-in resolver with any registered by extension modules (e.g. UiResolver from @ubean/integrations/ui)
  // Use a dynamic resolver that reads from the registry at resolution time, so that
  // resolvers registered by built-in modules (loaded later via resolveModules) are picked up.
  // `components.ubean: false` 仅去掉内置组件解析，模块注册的 resolver 始终生效。
  const dynamicResolvers = [
    ...(componentsAutoImport.ubean ? [ubeanComponentsResolver] : []),
    (name: string) => {
      for (const resolver of getComponentResolvers()) {
        const result = typeof resolver === 'function' ? resolver(name) : resolver.resolve(name);
        if (result) return result;
      }
      return undefined;
    }
  ];

  if (componentsAutoImport.enabled) {
    const userComponents = componentsAutoImport.options;
    const extensions = ['vue'];
    const includePatterns = [/\.vue$/, /\.vue\?vue/];

    if (markdownEnabled && markdownComponentsAutoImport) {
      extensions.push(...mdExtensions);
      includePatterns.push(/\.md$/);
      if (mdxEnabled) includePatterns.push(/\.mdx$/);
    }

    plugins.push(
      Components({
        // 框架默认 → 用户透传 → 框架合成字段（dirs/dts/resolvers 由配置与内置 resolver 合成）
        deep: true,
        ...userComponents,
        dirs: componentsDirs,
        extensions,
        include: includePatterns,
        dts: userComponents.dts === undefined ? join(dtsDir, 'components.d.ts') : userComponents.dts,
        resolvers: [...dynamicResolvers, ...toArray(userComponents.resolvers)]
      }) as Plugin
    );
  } else {
    plugins.push(
      Components({
        dts: true,
        resolvers: dynamicResolvers
      }) as Plugin
    );
  }

  // P9-26: Pagefind post-build indexing plugin.
  // Runs the Pagefind CLI after the build completes to index generated HTML
  // files. The browser-side `useSearch()` composable loads the generated
  // `/pagefind/pagefind-modern.js` at runtime.
  const searchConfig = ubeanConfig.search;
  if (searchConfig !== false && searchConfig !== undefined) {
    plugins.push({
      name: 'ubean:pagefind',
      apply: 'build',
      closeBundle() {
        // Lazy-load node:child_process and node:path to avoid pulling them
        // into the dev server bundle unnecessarily.
        return runPagefindIndexing(ubeanConfig, searchConfig);
      }
    });
  }

  return plugins;
}

/**
 * P9-26: Run the Pagefind CLI to index built HTML files.
 *
 * Spawns `npx pagefind --site <dir>` after the build. If the `pagefind`
 * package is not installed, prints a helpful warning instead of failing.
 */
async function runPagefindIndexing(
  ubeanConfig: UbeanResolvedConfig,
  searchConfig: NonNullable<UbeanResolvedConfig['search']>
): Promise<void> {
  const { spawn } = await import('node:child_process');
  const { resolve: resolvePath } = await import('node:path');

  const isObjectConfig = typeof searchConfig === 'object';
  const enabled = isObjectConfig ? searchConfig.enabled !== false : true;

  if (!enabled) return;

  // Determine the site directory (where HTML files are output).
  const outDir = isObjectConfig && searchConfig.site ? searchConfig.site : 'dist';

  const indexPath = isObjectConfig && searchConfig.indexPath ? searchConfig.indexPath : 'pagefind';

  const verbose = isObjectConfig && searchConfig.verbose === true;

  const sitePath = resolvePath(ubeanConfig.rootDir, outDir);

  const args = ['pagefind', '--site', sitePath, '--output-subdir', indexPath];

  if (isObjectConfig && searchConfig.glob) {
    args.push('--glob', searchConfig.glob);
  }

  if (isObjectConfig && searchConfig.excludeSelectors) {
    for (const selector of searchConfig.excludeSelectors) {
      args.push('--exclude-selectors', selector);
    }
  }

  if (verbose) {
    args.push('--verbose');
  }

  return new Promise<void>(resolvePromise => {
    const child = spawn('npx', args, {
      stdio: 'inherit',
      cwd: ubeanConfig.rootDir,
      shell: true
    });

    child.on('error', (err: Error & { code?: string }) => {
      if (err.code === 'ENOENT' || /not found/i.test(err.message)) {
        console.warn(
          '[ubean:pagefind] Pagefind CLI not found. Install it with `pnpm add -D pagefind` to enable full-text search.'
        );
      } else {
        console.error('[ubean:pagefind] Failed to run Pagefind:', err.message);
      }
      resolvePromise();
    });

    child.on('exit', code => {
      if (code === 0) {
        console.log('[ubean:pagefind] Search index generated successfully.');
      } else {
        console.warn(`[ubean:pagefind] Pagefind exited with code ${code}. Search index may be incomplete.`);
      }
      resolvePromise();
    });
  });
}

export default ubeanVite;
