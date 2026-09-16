/**
 * environment 驱动的生产构建（RM-V16，ADR-0012 §4）。
 *
 * 旧路径（`production.ts` 的 `buildProduction`）是**两次独立的 `viteBuild`**：client 一次、
 * server 一次，各自带一份内联配置。新路径用一次 `createBuilder` 建两个环境（`client` /
 * `ubean`）并由 `buildApp` 编排：
 *
 * ```text
 * prepare（清理 + 虚拟模块落盘 + HTML 模板）
 *   → client env 构建
 *   → ubean env 构建
 *   → 公共目录拷贝 → preset 包装 → manifest
 * ```
 *
 * 收益（ADR-0012 §3）：单次 builder 持有两个环境的模块图与插件实例，避免两次构建各自解析
 * 一遍插件与依赖；RM-V18（清单时序解耦）、RM-V19（虚拟模块落盘降级）都建立在这个结构上。
 *
 * **判据是产物可比**，不是写法漂亮：与 `viteBuild` 无关的步骤已抽到 `build-steps.ts` 两侧共用，
 * env 配置逐条对应旧路径的 `viteBuild` 入参 —— 旧路径写 `ssr.noExternal`/`external` 的地方，
 * 新路径是 server env 的 `resolve.noExternal`/`external`（Vite 6+ 的等价位置）；旧路径的
 * `optimizeDeps.exclude` 属于 client env；islands SSR 空壳插件只挂 ubean env。
 */
import { existsSync } from 'node:fs';
import { cp, readFile } from 'node:fs/promises';
import { createBuilder, perEnvironmentPlugin } from 'vite';
import type { Plugin as VitePlugin } from 'vite';
import { resolveModules } from '@ubean/config';
import { getLogger } from '@ubean/shared/logger';
import { findUserViteConfig } from '@ubean/shared/node';
import { join, resolve } from 'pathe';
import {
  createIslandsSsrStubPlugin,
  generateCloudflareWorkerEntry,
  getPresetBuildConfig,
  generateNodeServerEntry,
  generateStandardHandlerEntry,
  generateVirtualModulesToDisk
} from '../production';
import type { BuildManifest, BuildOptions } from '../production';
import { ssrSingletonProdOptimizeExclude, ssrSingletonProdSsr } from '../ssr-singleton';
import { createVirtualRegistry } from '../virtual-registry';
import { ubeanPlugin } from '../vite';
import { ubeanVite } from '../vue';
import {
  cleanBuildOutput,
  getBuildOutDirs,
  writeBuildManifest,
  writeClientIndexHtml,
  writePresetWrapper
} from './build-steps';

const logger = getLogger('build');

/** 与旧路径一致的虚拟模块别名（RM-V19 会评估是否还需要它们）。 */
function virtualAliases(virtualDir: string): Record<string, string> {
  return {
    'virtual:ubean-pages': join(virtualDir, 'vue-pages.ts'),
    'virtual:ubean-app': join(virtualDir, 'vue-app.ts'),
    'virtual:ubean-server': join(virtualDir, 'server-entry.ts'),
    'virtual:ubean-client-entry': join(virtualDir, 'client-entry.mjs'),
    '#ubean-pages': join(virtualDir, 'vue-pages.ts'),
    '#ubean-app': join(virtualDir, 'vue-app.ts'),
    '#ubean-server': join(virtualDir, 'server-entry.ts'),
    '#ubean-client-entry': join(virtualDir, 'client-entry.mjs'),
    'ubean:pages': join(virtualDir, 'pages.ts'),
    'ubean:routes': join(virtualDir, 'routes.mjs'),
    'ubean:app-config': join(virtualDir, 'app-config.mjs'),
    'ubean:locales': join(virtualDir, 'locales.mjs'),
    'ubean:meta': join(virtualDir, 'meta.mjs')
  };
}

const VIRTUAL_EXCLUDE = [
  'virtual:ubean-pages',
  'virtual:ubean-app',
  'virtual:ubean-server',
  'virtual:ubean-client-entry',
  '#ubean-pages',
  '#ubean-app',
  '#ubean-server',
  '#ubean-client-entry'
];

/**
 * 一次 `createBuilder` 完成整套生产构建。返回值与 `buildProduction` 同形（`BuildManifest`），
 * 便于 RM-V22/V23 逐项对照。
 */
export async function buildWithEnvironments(options: BuildOptions): Promise<BuildManifest> {
  const { cwd, config, preset, scanResult, minify = true, sourcemap = false, contentSnapshot } = options;
  const outDirs = getBuildOutDirs(cwd, config.build.outputDir);
  const srcDir = resolve(cwd, config.srcDir);

  const mode = config.mode;
  const ssrEnabled = (mode === 'fullstack' && config.ssr.enabled) || mode === 'ssg';
  const hasPages = mode !== 'backend';
  const hasServer = mode !== 'spa';

  await cleanBuildOutput({ outDirs, hasPages, hasServer, mode, ssrEnabled });

  logger.info('Generating virtual modules...');
  const virtualRegistry = createVirtualRegistry();
  await generateVirtualModulesToDisk(
    cwd,
    config,
    scanResult,
    outDirs.virtual,
    preset,
    virtualRegistry,
    contentSnapshot
  );
  if (hasPages) await writeClientIndexHtml(outDirs.virtual);

  const userViteConfig = findUserViteConfig(cwd);
  const builtinPlugins: VitePlugin[] = [];
  if (!userViteConfig) {
    builtinPlugins.push(ubeanPlugin({ config, registry: virtualRegistry }));
    if (hasPages) builtinPlugins.push(...ubeanVite({ config, registry: virtualRegistry }));
  }
  const { plugins } = await resolveModules({ cwd, config, builtinPlugins });
  // islands SSR 空壳只作用于 ubean 环境（env 级 plugins 不在配置面里，用 perEnvironmentPlugin 限定）
  if (hasServer) plugins.push(perEnvironmentPlugin('ubean', () => createIslandsSsrStubPlugin()));

  const presetBuildConfig = getPresetBuildConfig(preset);
  const clientEntryPath = join(srcDir, 'entry.client.ts');
  const clientInput = existsSync(clientEntryPath) ? clientEntryPath : join(outDirs.virtual, 'client-entry.mjs');
  const ssrOptions = ssrSingletonProdSsr() as { noExternal?: (string | RegExp)[] };

  const builder = await createBuilder({
    root: cwd,
    configFile: userViteConfig ?? false,
    mode: 'production',
    plugins,
    resolve: { alias: virtualAliases(outDirs.virtual) },
    environments: {
      client: {
        consumer: 'client',
        optimizeDeps: { exclude: ssrSingletonProdOptimizeExclude(VIRTUAL_EXCLUDE) },
        build: {
          outDir: outDirs.public,
          assetsDir: 'assets',
          minify: minify ? 'oxc' : false,
          sourcemap,
          manifest: true,
          ssrManifest: true,
          emptyOutDir: false,
          rollupOptions: {
            input: { app: clientInput },
            output: {
              entryFileNames: 'assets/[name]-[hash].js',
              chunkFileNames: 'assets/chunks/[name]-[hash].js',
              assetFileNames: 'assets/[name]-[hash].[ext]'
            }
          }
        }
      },
      ubean: {
        consumer: 'server',
        resolve: {
          // 旧路径的 `ssr.noExternal`：把 `@ubean/*` 内联进 SSR 图，否则各包从自身
          // node_modules 解析，虚拟模块 import 会以裸 specifier 泄漏给 Node。
          noExternal: ssrOptions.noExternal,
          external: ['@ubean/i18n']
        },
        build: {
          outDir: outDirs.server,
          ssr: true,
          minify: false,
          sourcemap,
          emptyOutDir: false,
          rollupOptions: {
            input: join(outDirs.virtual, 'server-entry.mjs'),
            // 去掉 preset external 里的 `^ubean` 模式：它与上面的 `resolve.noExternal` 冲突，
            // 保留会把 ubean 外置，Node 从 node_modules 加载时解析不到虚拟模块（旧路径同款处理）
            external: presetBuildConfig.external.filter(
              entry => !(entry instanceof RegExp && entry.source.startsWith('^ubean'))
            ),
            output: {
              format: presetBuildConfig.format,
              entryFileNames: 'entry.mjs',
              chunkFileNames: 'chunks/[name]-[hash].mjs',
              inlineDynamicImports: presetBuildConfig.entryType === 'worker'
            }
          }
        }
      }
    },
    builder: {
      async buildApp(b) {
        if (hasPages) {
          logger.info('Building client bundle...');
          await b.build(b.environments.client);
        }
        if (hasServer) {
          logger.info(ssrEnabled ? 'Building SSR bundle...' : 'Building server bundle (SSR disabled)...');
          await b.build(b.environments.ubean);
        }
      }
    }
  });

  await builder.buildApp();

  // 公共目录在客户端产物之后拷贝（避免被 emptyOutDir 清掉，与旧路径顺序一致）
  if (hasPages) {
    const publicDir = join(cwd, 'public');
    if (existsSync(publicDir)) {
      logger.info('Copying public assets...');
      await cp(publicDir, outDirs.public, { recursive: true });
    }
  }

  let clientManifest: Record<string, { file: string; isEntry?: boolean; css?: string[] }> = {};
  if (hasPages) {
    const manifestPath = join(outDirs.public, '.vite', 'manifest.json');
    if (existsSync(manifestPath)) {
      try {
        clientManifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
      } catch {
        /* 清单缺失不阻塞构建：产物在，manifest 的 assets 为空 */
      }
    }
  }

  let serverEntry = '';
  if (hasServer) {
    serverEntry = await writePresetWrapper({
      mode,
      presetBuildConfig: { entryType: presetBuildConfig.entryType },
      outDirs,
      entries: {
        node: generateNodeServerEntry,
        worker: generateCloudflareWorkerEntry,
        standard: generateStandardHandlerEntry
      }
    });
  }

  return writeBuildManifest({ cwd, outDirs, clientManifest, serverEntry, preset, hasPages, hasServer });
}
