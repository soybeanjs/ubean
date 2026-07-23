import type { Plugin } from 'vite';
import { join, relative, resolve } from 'pathe';
import type { ResolvedConfig as UbeanResolvedConfig } from '../../config/types';
import { loadUbeanConfig, tryGetConfig } from '../../config';
import { createUbeanRouter } from '../../routing/router';
import {
  createRoutingVirtualModule,
  createPagesVirtualModule,
  createMetaVirtualModule,
  createAppVirtualModule,
  createLocalesVirtualModule
} from '../virtual/modules';
import { scanProject } from '../../routing/scan';
import { useVirtualRegistry } from '../virtual/registry';
import { transformMacros } from './macros';

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
 * ubean 核心 Vite 插件。
 *
 * 提供虚拟模块(`ubean:routes`、`ubean:pages` 等)、宏转换和文件监听。
 *
 * @example 在 vite.config.ts 中使用(自动加载 ubean.config)
 * ```typescript
 * import { defineConfig } from 'vite';
 * import { ubeanPlugin } from 'ubean/vite';
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
  }
}
