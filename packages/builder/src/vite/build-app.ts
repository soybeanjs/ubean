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
import { existsSync, readFileSync } from 'node:fs';
import { cp } from 'node:fs/promises';
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
import { ssrSingletonProdSsr } from '../ssr-singleton';
import { createVirtualRegistry } from '../virtual-registry';
import { ubeanPlugin } from '../vite';
import { ubeanVite } from '../vue';
import { ubeanAssetManifestPlugin } from './asset-manifest';
import type { ClientManifestEntry } from './asset-manifest';
import { clientOptimizeDepsExclude, clientOutputNames, serverExternal, serverOutputNames } from './build-configs';
import {
  cleanBuildOutput,
  getBuildOutDirs,
  writeBuildManifest,
  writeClientIndexHtml,
  writePresetWrapper
} from './build-steps';

const logger = getLogger('build');

/** 读客户端 manifest（供注入与 manifest 汇总共用）。 */
function readClientManifest(publicDir: string): Record<string, ClientManifestEntry> | null {
  const manifestPath = join(publicDir, '.vite', 'manifest.json');
  if (!existsSync(manifestPath)) return null;
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf-8')) as Record<string, ClientManifestEntry>;
  } catch {
    return null;
  }
}

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

  // RM-V18：服务端构建从这里取 client manifest（内存传递，不再运行时读盘）
  let clientManifestForInjection: Record<string, ClientManifestEntry> | null = null;

  const userViteConfig = findUserViteConfig(cwd);
  const builtinPlugins: VitePlugin[] = [ubeanAssetManifestPlugin(() => clientManifestForInjection)];
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
    environments: {
      client: {
        consumer: 'client',
        optimizeDeps: { exclude: clientOptimizeDepsExclude() },
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
            output: clientOutputNames()
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
            // `^ubean` external 过滤与命名规则见 build-configs.ts（两条路径共用一份）
            external: serverExternal(presetBuildConfig),
            output: serverOutputNames(presetBuildConfig)
          }
        }
      }
    },
    builder: {
      async buildApp(b) {
        if (hasPages) {
          logger.info('Building client bundle...');
          await b.build(b.environments.client);
          // 客户端构建完成后立刻把 manifest 交给服务端环境（同一闭包变量）
          clientManifestForInjection = readClientManifest(outDirs.public);
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
        clientManifest = readClientManifest(outDirs.public) ?? {};
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
