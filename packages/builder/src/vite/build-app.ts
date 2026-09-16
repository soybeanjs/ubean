/**
 * environment 驱动的生产构建（RM-V16 / RM-V21，ADR-0012 §4）。
 *
 * 收敛前的旧编排是**两次独立的 `viteBuild`**（client 一次、
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
import { ubeanIslandsPlugin } from '@ubean/islands/vite';
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
import { ubeanAssetManifestPlugin, computeAssetTags } from './asset-manifest';
import type { ClientManifestEntry } from './asset-manifest';
import { createBuildEnvironments } from './build-configs';
import {
  cleanBuildOutput,
  getBuildOutDirs,
  writeBuildManifest,
  writeClientIndexHtml,
  writePresetWrapper,
  writeSpaIndexHtml
} from './build-steps';
import { runPrerenderStep } from './prerender-step';

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
  // 资产标签虚拟模块**只留一个提供者**：有用户 `vite.config` 时由其中的核心插件提供（它会走
  // 「内存 ref → 服务端 outDir 旁磁盘清单」的解析）；只有缺失核心插件的这一支才用独立插件补位。
  // 两个提供者各自持 ref，谁先解析谁说了算 —— 实测就是这样内联出空标签，产出不水合、无样式的 HTML。
  const builtinPlugins: VitePlugin[] = [];
  if (!userViteConfig) {
    // 无用户 vite.config 时由本路径提供全部 builtin 插件（RM-V36 前与旧编排逐项对齐过）：
    // **islands 插件不能漏**，否则 `v-client.*` 指令不被转换、注册表为空、岛屿组件整类不进产物
    // （实测：无配置那一格 builder 路径比默认路径少 10 个文件 —— 5 个岛屿 JS + 5 个 CSS）。
    builtinPlugins.push(
      ubeanAssetManifestPlugin(
        () => manifestRef.current,
        () => outDirs.server
      )
    );
    builtinPlugins.push(ubeanPlugin({ config, registry: virtualRegistry }));
    if (hasPages) {
      builtinPlugins.push(...ubeanVite({ config, registry: virtualRegistry }), ubeanIslandsPlugin());
    } else if (hasServer) {
      // backend（无页面）也要注册 vue 插件：服务端入口模板**无条件** import `virtual:ubean-app`，
      // 而该虚拟模块由 `ubeanVite` 提供 —— 只按 `hasPages` 注册会让「backend + 无用户 vite.config」
      // 构建失败（实测 Rolldown 报 `Failed to resolve import "virtual:ubean-app"`）。与旧路径
      // （与收敛前的旧编排）保持同一判据。
      builtinPlugins.push(...ubeanVite({ config, registry: virtualRegistry }));
    }
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

  // spa：没有服务端，也就没人产出 HTML —— 客户端构建的 input 是虚拟 entry，Vite 不会生成
  // `index.html`。这里补出静态入口（资产标签复用与 SSR 相同的规则）。
  if (mode === 'spa') {
    const tags = computeAssetTags(clientManifest);
    await writeSpaIndexHtml({
      outDirs,
      tags: { css: tags.css, body: tags.body, favicon: prepared.config.favicon }
    });
  }

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

  const builtManifest = await writeBuildManifest({
    cwd,
    outDirs,
    clientManifest,
    serverEntry,
    preset,
    hasPages,
    hasServer
  });

  await runPrerenderStep({
    cwd,
    config: prepared.config,
    scanResult: prepared.scanResult,
    manifest: builtManifest,
    contentSnapshot: prepared.contentSnapshot
  });

  return builtManifest;
}

/**
 * 一次 `createBuilder` 完成整套生产构建（`ubean build` 与 `vite build` 共用的唯一编排）。
 *
 * **驱动权声明**：本函数自己就是编排者，因此先在环境里声明「构建由调用方驱动」，让插件侧的
 * `config` 钩子**不要**再注册它自己的 `builder.buildApp` —— 否则同一个 config 的 `builder` 字段
 * 会被插件返回值合并掉，本函数的内联编排不再执行、`manifest` 保持 undefined，表现为**静默返回
 * undefined**（RM-V36 把开关默认打开后由 `build-parity.test.ts` 实测撞到）。与 CLI 用的是同一个
 * 环境变量，结束后还原，避免影响同进程内的其它调用。
 */
export async function buildWithEnvironments(options: BuildOptions): Promise<BuildManifest> {
  const previous = process.env.UBEAN_BUILD_DRIVEN_BY_CLI;
  process.env.UBEAN_BUILD_DRIVEN_BY_CLI = '1';
  try {
    return await runEnvOrchestration(options);
  } finally {
    if (previous === undefined) delete process.env.UBEAN_BUILD_DRIVEN_BY_CLI;
    else process.env.UBEAN_BUILD_DRIVEN_BY_CLI = previous;
  }
}

async function runEnvOrchestration(options: BuildOptions): Promise<BuildManifest> {
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
