import type { Plugin } from 'vite';
import { loadUbeanConfig, tryGetConfig } from '@ubean/config';
import type { ResolvedConfig as UbeanResolvedConfig } from '@ubean/config';
import { createUbeanRouter, scanProject } from '@ubean/routing';
import type { ScanResult, ScannedPageRoute } from '@ubean/routing';
import { join, relative, resolve } from 'pathe';
import { transformMacros } from './macros';
import {
  createRoutingVirtualModule,
  createPagesVirtualModule,
  createMetaVirtualModule,
  createAppVirtualModule,
  createLocalesVirtualModule
} from './virtual-modules';
import { useVirtualRegistry } from './virtual-registry';

const VIRTUAL_MODULES = ['ubean:routes', 'ubean:pages', 'ubean:meta', 'ubean:app-config', 'ubean:locales'];
const VIRTUAL_PREFIX = '\0ubean:';

export interface UbeanPluginOptions {
  /**
   * 已解析的 ubean 配置。如果未提供,插件会按以下顺序获取:
   * 1. 尝试从全局缓存读取(`loadUbeanConfig` 已被 CLI 调用时会有缓存)
   * 2. 在 `buildStart` 中异步调用 `loadUbeanConfig()` 加载
   */
  config?: UbeanResolvedConfig;
}

/**
 * ubean 核心 Vite 插件(框架无关部分)。
 *
 * 提供:
 * - 虚拟模块(`ubean:routes`、`ubean:pages`、`ubean:meta`、`ubean:app-config`、`ubean:locales`)
 * - 宏转换(`definePage` / `defineMeta` 在 `.ts` / `.vue` 中被剥离)
 * - 文件监听(dev 模式下扫描 `routes` / `middleware` / `pages` / `layouts` / `plugins` / `locales`)
 * - 实体路由文件生成(当 `routing.mode` 为 `'file'` 或 `'both'` 时触发 `@ubean/routing/generator`)
 *
 * Vue 专属的虚拟模块(`virtual:ubean-pages`、`virtual:ubean-app` 等)由 `@ubean/vite` 的
 * `ubeanVuePlugin` 提供,二者共用 `useVirtualRegistry()` 注册表。
 *
 * @example 在 vite.config.ts 中使用(自动加载 ubean.config)
 * ```typescript
 * import { defineConfig } from 'vite';
 * import { ubeanPlugin } from '@ubean/build/vite';
 *
 * export default defineConfig({
 *   plugins: [ubeanPlugin()]
 * });
 * ```
 *
 * @example 显式传入配置(ubean dev/build 内部使用)
 * ```typescript
 * ubeanPlugin({ config: resolvedConfig })
 * ```
 */
export function ubeanPlugin(options?: UbeanPluginOptions): Plugin {
  const virtualRegistry = useVirtualRegistry();

  // Config 解析:优先使用传入的,其次从缓存获取
  // 如果都没有,在 buildStart 中异步加载
  let ubeanConfig: UbeanResolvedConfig | undefined = options?.config ?? tryGetConfig() ?? undefined;

  // 派生值 — 在 config 就绪后计算
  let srcDirAbs = '';
  let viteSrcDir = '';
  let viteSrcPrefix = '';

  function ensureDerived() {
    if (!ubeanConfig) return;
    srcDirAbs = resolve(ubeanConfig.rootDir, ubeanConfig.srcDir);
    viteSrcDir = relative(ubeanConfig.rootDir, srcDirAbs).replace(/\\/g, '/');
    viteSrcPrefix = viteSrcDir ? `/${viteSrcDir}` : '';
  }

  if (ubeanConfig) {
    ensureDerived();
  }

  return {
    name: 'ubean:core',
    enforce: 'pre',

    async buildStart() {
      if (!ubeanConfig) {
        ubeanConfig = await loadUbeanConfig();
        ensureDerived();
      }
      await scanAndRegister();
    },

    resolveId(id) {
      if (VIRTUAL_MODULES.includes(id)) {
        return VIRTUAL_PREFIX + id;
      }
      return undefined;
    },

    async load(id) {
      if (id.startsWith(VIRTUAL_PREFIX)) {
        const moduleId = id.slice(VIRTUAL_PREFIX.length);
        const mod = virtualRegistry.getModules().find(m => m.id === moduleId);
        if (mod) {
          return await mod.load();
        }
      }
      return undefined;
    },

    transform(code, id) {
      const result = transformMacros(code, id);
      if (result !== null && result !== code) {
        return { code: result, map: null };
      }
      return null;
    },

    configureServer(server) {
      const watchDirs = ['routes', 'middleware', 'pages', 'layouts', 'plugins', 'locales'];

      // config 在 buildStart 中已加载,此处一定可用
      const config = ubeanConfig!;
      const srcDir = join(config.rootDir, config.srcDir);

      for (const dir of watchDirs) {
        server.watcher.add(join(srcDir, dir));
      }

      server.watcher.on('add', handleFileChange);
      server.watcher.on('unlink', handleFileChange);
      server.watcher.on('change', handleFileChange);

      async function handleFileChange(file: string) {
        const relativePath = file.replace(`${srcDir}/`, '');
        if (watchDirs.some(d => relativePath.startsWith(`${d}/`))) {
          await scanAndRegister();
          for (const mod of VIRTUAL_MODULES) {
            const module = server.moduleGraph.getModuleById(VIRTUAL_PREFIX + mod);
            if (module) {
              server.moduleGraph.invalidateModule(module);
            }
          }
          if (relativePath.startsWith('locales/')) {
            server.ws.send({ type: 'custom', event: 'ubean:locale-update', data: { file } });
          } else {
            server.ws.send({ type: 'full-reload' });
          }
        }
      }
    }
  };

  async function scanAndRegister() {
    if (!ubeanConfig) return;

    const result = await scanProject({
      cwd: ubeanConfig.rootDir,
      srcDir: ubeanConfig.srcDir,
      dirs: ubeanConfig.dir,
      ignore: ubeanConfig.scanOptions?.ignore
    });

    const router = createUbeanRouter();

    for (const mw of result.middlewares) {
      router.addMiddleware(mw);
    }

    for (const route of result.apiRoutes) {
      router.addApiRoute(route);
    }

    for (const page of result.pages) {
      router.addPage(page);
    }

    for (const layout of result.layouts) {
      router.addLayout(layout);
    }

    virtualRegistry.register(
      createRoutingVirtualModule(
        result.apiRoutes.map(r => ({
          method: r.method?.toUpperCase() || 'ALL',
          path: r.route,
          id: `${r.method}:${r.route}`,
          filePath: r.fullPath
        })),
        result.middlewares.map(m => ({
          path: '/**',
          filePath: m.fullPath,
          order: m.order,
          global: m.global
        }))
      )
    );

    virtualRegistry.register(
      createPagesVirtualModule(
        result.pages.map(p => ({
          name: p.name,
          path: p.route,
          filePath: p.fullPath,
          layout: p.layout,
          reuseTarget: p.reuseTarget
        })),
        result.layouts.map(l => ({
          name: l.name,
          filePath: l.fullPath,
          isDefault: l.isDefault
        }))
      )
    );

    virtualRegistry.register(createMetaVirtualModule());

    virtualRegistry.register(
      createAppVirtualModule(result.apiRoutes, result.middlewares, result.pages, viteSrcPrefix || '/')
    );

    virtualRegistry.register(createLocalesVirtualModule(result.locales, result.defaultLocale, viteSrcPrefix || '/'));

    // 实体文件模式:在 dev 启动 / 文件变更时重新生成 `src/router/_generated/`
    // 当 `routing.mode` 为 `'file'` 或 `'both'` 时触发,委托给 `@ubean/routing/generator`
    // (动态 import 以保持该依赖为可选 — 前端-only 项目不需要安装 generator 相关代码)
    await maybeGenerateRouteFiles(ubeanConfig, result).catch(err => {
      // 生成失败不阻塞 dev server,虚拟模块仍可用
      // eslint-disable-next-line no-console
      console.warn('[ubean:core] Route file generation failed:', err?.message || err);
    });
  }
}

/**
 * 根据 `routing.mode` 决定是否触发实体文件生成。
 *
 * - `'virtual'`(默认):不生成,仅靠虚拟模块
 * - `'file'`:生成实体文件,虚拟模块仍注册(便于在虚拟/实体混合场景调试)
 * - `'both'`:生成实体文件,虚拟模块也注册
 *
 * 由于 `@ubean/routing/generator` 通过动态 import 加载,前端-only 项目
 * (不依赖实体路由文件)即使没有安装 generator 相关依赖也能运行。
 *
 * 注意:`@ubean/config` 与 `@ubean/routing/generator` 的 `getRouteMeta` /
 * `onGenerated` 签名略有差异(配置层面向用户,生成器层面向内部)。本函数
 * 负责适配:把 `(filePath, frontmatter) => meta` 包装为 `(page) => meta`,
 * 把 `GeneratorResult` 转换为 `string[]` 文件路径列表。
 */
async function maybeGenerateRouteFiles(config: UbeanResolvedConfig, scanResult: ScanResult): Promise<void> {
  const mode = config.routing?.mode;
  if (mode !== 'file' && mode !== 'both') return;

  const routing = config.routing;
  const outDir = resolve(config.rootDir, routing.outputDir);
  const dtsPath = resolve(config.rootDir, routing.dtsDir, 'typed-router.d.ts');

  // 适配 config.getRouteMeta(file, frontmatter) → generator.getRouteMeta(page)
  // 把页面对象的 `relativePath` 和扫描出的 `frontmatter` 传给配置层钩子。
  const configGetRouteMeta = routing.getRouteMeta;
  const generatorGetRouteMeta: ((page: ScannedPageRoute) => Record<string, unknown> | null) | undefined =
    configGetRouteMeta
      ? (page: ScannedPageRoute) => configGetRouteMeta(page.relativePath, page.frontmatter ?? {})
      : undefined;

  // 动态 import:保持 `@ubean/routing/generator` 为可选依赖
  const { generateRouteFiles } = await import('@ubean/routing/generator');

  const result = await generateRouteFiles(scanResult, {
    cwd: config.rootDir,
    outDir,
    dtsPath,
    routeLazy: routing.routeLazy,
    layoutLazy: routing.layoutLazy,
    getRouteMeta: generatorGetRouteMeta,
    headerComment: undefined
  });

  // 适配 GeneratorResult → string[]:配置层 `onGenerated` 期望"已生成的文件路径数组"
  if (routing.onGenerated) {
    const files: string[] = [result.routesPath, result.importsPath, result.dtsPath].filter((p): p is string =>
      Boolean(p)
    );
    await routing.onGenerated(files);
  }
}
