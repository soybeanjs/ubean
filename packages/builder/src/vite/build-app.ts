/**
 * environment 驱动的生产构建（RM-V16 / RM-V21，ADR-0012 §4）。
 *
 * 旧路径（`production.ts` 的 `buildProduction`）是**两次独立的 `viteBuild`**：client 一次、
 * server 一次，各自带一份内联配置。新路径用一次 `createBuilder` 建两个环境（`client` /
 * `ubean`）并由 `buildApp` 编排：
 *
 * ```text
 * prepare（清理 + 虚拟模块落盘 + HTML 模板 + 插件组装）
 *   → client env 构建
 *   → ubean env 构建
 *   → 公共目录拷贝 → preset 包装 → manifest
 * ```
 *
 * 三个阶段刻意拆成三个出口（RM-V21），因为**谁来建 builder** 有两种情况：
 * - `buildWithEnvironments()`：调用方（CLI 的旧路径或未来的薄别名）自己建 builder，
 *   env 定义在这里；
 * - 插件（`ubeanPlugin` 的 `config` 钩子）在 `experimental.viteBuilder` 打开时提供
 *   `builder.buildApp`：此时 builder 由 Vite 自己创建、env 由同一钩子注册，插件只需
 *   `prepareBuild` + `runEnvBuilds` —— **不能**再调 `buildWithEnvironments`（那会递归建 builder）。
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
  generateNodeServerEntry,
  generateStandardHandlerEntry,
  generateVirtualModulesToDisk,
  getPresetBuildConfig
} from '../production';
import type { BuildManifest, BuildOptions, PresetBuildConfig } from '../production';
import { ssrSingletonProdSsr } from '../ssr-singleton';
import { createVirtualRegistry } from '../virtual-registry';
import { ubeanPlugin } from '../vite';
import { ubeanVite } from '../vue';
import { ubeanAssetManifestPlugin } from './asset-manifest';
import type { ClientManifestEntry } from './asset-manifest';
import { createBuildEnvironments } from './build-configs';
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

/** 构建期上下文：三个阶段之间传递的派生值。 */
export interface BuildContext {
  cwd: string;
  config: BuildOptions['config'];
  preset: BuildOptions['preset'];
  scanResult: BuildOptions['scanResult'];
  minify: boolean;
  sourcemap: boolean;
  contentSnapshot?: BuildOptions['contentSnapshot'];
  mode: string;
  ssrEnabled: boolean;
  hasPages: boolean;
  hasServer: boolean;
  outDirs: ReturnType<typeof getBuildOutDirs>;
}

/** `prepareBuild` 的产物：插件列表、客户端入口与 preset 派生配置。 */
export interface PreparedBuild extends BuildContext {
  plugins: VitePlugin[];
  presetBuildConfig: PresetBuildConfig;
  /** client manifest 的内存载体：client 构建后填，服务端构建期被注入插件读取（RM-V18）。 */
  manifestRef: { current: Record<string, ClientManifestEntry> | null };
}

/** 由 options 派生上下文（不做任何 IO）。 */
export function createBuildContext(options: BuildOptions): BuildContext {
  const { cwd, config, preset, scanResult, minify = true, sourcemap = false, contentSnapshot } = options;
  const mode = config.mode;
  const hasPages = mode !== 'backend';
  const hasServer = mode !== 'spa';
  return {
    cwd,
    config,
    preset,
    scanResult,
    minify,
    sourcemap,
    contentSnapshot,
    mode,
    hasPages,
    hasServer,
    ssrEnabled: (mode === 'fullstack' && config.ssr.enabled) || mode === 'ssg',
    outDirs: getBuildOutDirs(cwd, config.build.outputDir)
  };
}

/**
 * 第一阶段：清理产物目录、虚拟模块落盘、HTML 模板、插件组装。
 *
 * 插件必须在这里（`createBuilder` 之前）备好；`manifestRef` 的**内容**稍后在 client 构建
 * 完成后填 —— 服务端构建期注入插件读的就是这个载体。
 */
export async function prepareBuild(
  ctx: BuildContext,
  /**
   * 外部提供的 manifest 载体（插件路径传入：注入插件由 `config` 钩子注册，必须读同一个对象）。
   * 省略时自建（CLI 路径）。
   */
  manifestRef: PreparedBuild['manifestRef'] = { current: null }
): Promise<PreparedBuild> {
  const { cwd, config, preset, scanResult, contentSnapshot, outDirs, hasPages, hasServer } = ctx;

  await cleanBuildOutput({
    outDirs,
    hasPages,
    hasServer,
    mode: ctx.mode,
    ssrEnabled: ctx.ssrEnabled
  });

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
  const builtinPlugins: VitePlugin[] = [ubeanAssetManifestPlugin(() => manifestRef.current)];
  if (!userViteConfig) {
    builtinPlugins.push(ubeanPlugin({ config, registry: virtualRegistry }));
    if (hasPages) builtinPlugins.push(...ubeanVite({ config, registry: virtualRegistry }));
  }
  const { plugins } = await resolveModules({ cwd, config, builtinPlugins });
  // islands SSR 空壳只作用于 ubean 环境（env 级 plugins 不在配置面里，用 perEnvironmentPlugin 限定）
  if (hasServer) plugins.push(perEnvironmentPlugin('ubean', () => createIslandsSsrStubPlugin()));

  return { ...ctx, plugins, presetBuildConfig: getPresetBuildConfig(preset), manifestRef };
}

/**
 * 第二、三阶段：按顺序构建两个环境，再做公共目录拷贝 / preset 包装 / manifest。
 *
 * `builder` 由调用方提供：CLI 路径是自建的，插件路径是 Vite 建好后传进 `buildApp` 的。
 */
export async function runEnvBuilds(
  builder: { build: (env: unknown) => Promise<unknown>; environments: Record<string, unknown> },
  prepared: PreparedBuild
): Promise<BuildManifest> {
  const { cwd, preset, hasPages, hasServer, outDirs, mode, ssrEnabled, presetBuildConfig, manifestRef } = prepared;

  if (hasPages) {
    logger.info('Building client bundle...');
    await builder.build(builder.environments.client);
    // 客户端构建完成后立刻把 manifest 交给服务端环境（同一内存载体，RM-V18）
    manifestRef.current = readClientManifest(outDirs.public);
  }
  if (hasServer) {
    logger.info(ssrEnabled ? 'Building SSR bundle...' : 'Building server bundle (SSR disabled)...');
    await builder.build(builder.environments.ubean);
  }

  // 公共目录在客户端产物之后拷贝（避免被 emptyOutDir 清掉，与旧路径顺序一致）
  if (hasPages) {
    const publicDir = join(cwd, 'public');
    if (existsSync(publicDir)) {
      logger.info('Copying public assets...');
      await cp(publicDir, outDirs.public, { recursive: true });
    }
  }

  const clientManifest: Record<string, { file: string; isEntry?: boolean; css?: string[] }> = hasPages
    ? (readClientManifest(outDirs.public) ?? {})
    : {};

  const serverEntry = hasServer
    ? await writePresetWrapper({
        mode,
        presetBuildConfig: { entryType: presetBuildConfig.entryType },
        outDirs,
        entries: {
          node: generateNodeServerEntry,
          worker: generateCloudflareWorkerEntry,
          standard: generateStandardHandlerEntry
        }
      })
    : '';

  return writeBuildManifest({ cwd, outDirs, clientManifest, serverEntry, preset, hasPages, hasServer });
}

/**
 * 一次 `createBuilder` 完成整套生产构建（CLI 路径）。返回值与 `buildProduction` 同形
 * （`BuildManifest`），便于 RM-V22/V23 逐项对照。
 */
export async function buildWithEnvironments(options: BuildOptions): Promise<BuildManifest> {
  const ctx = createBuildContext(options);
  const prepared = await prepareBuild(ctx);
  const { cwd, sourcemap, minify, outDirs, presetBuildConfig } = prepared;
  const userViteConfig = findUserViteConfig(cwd);
  const clientEntryPath = join(resolve(cwd, options.config.srcDir), 'entry.client.ts');
  const clientInput = existsSync(clientEntryPath) ? clientEntryPath : join(outDirs.virtual, 'client-entry.mjs');
  const ssrOptions = ssrSingletonProdSsr() as { noExternal?: (string | RegExp)[] };

  let manifest: BuildManifest | undefined;
  const builder = await createBuilder({
    root: cwd,
    configFile: userViteConfig ?? false,
    mode: 'production',
    plugins: prepared.plugins,
    environments: createBuildEnvironments({
      outDirs,
      clientInput,
      minify,
      sourcemap,
      presetBuildConfig,
      ssrNoExternal: ssrOptions.noExternal
    }),
    builder: {
      async buildApp(b) {
        manifest = await runEnvBuilds(b as never, prepared);
      }
    }
  });

  await builder.buildApp();
  return manifest as BuildManifest;
}
