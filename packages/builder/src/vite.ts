import { existsSync } from 'node:fs';
import type { Plugin } from 'vite';
import { loadUbeanConfig, tryGetConfig } from '@ubean/config';
import type { ResolvedConfig as UbeanResolvedConfig } from '@ubean/config';
import {
  registerBuiltinPresets as registerPresetsSync,
  resolvePresetByName as resolvePresetNameSync
} from '@ubean/preset';
import { createServerRouter } from '@ubean/routes';
import { scanProject } from '@ubean/scan';
import type { ScanResult, ScannedPageRoute } from '@ubean/scan';
import { getLogger } from '@ubean/shared/logger';
import { join, relative, resolve } from 'pathe';
import { generateTypes } from './codegen';
import { ensureDevApp } from './dev/dev-request-router';
import { getDevScanCoordinator } from './dev/dev-scan';
import { localeVueParamFromI18n, serializeI18nConfig } from './i18n-config';
import { transformMacros } from './macros';
// 别名：`buildEnvironmentsForConfig()` 内部有同名解构局部变量（eslint no-shadow）
import { getPresetBuildConfig as getPresetBuildConfigSync } from './production';
import {
  createRoutingVirtualModule,
  createPagesVirtualModule,
  createMetaVirtualModule,
  createAppVirtualModule,
  createLocalesVirtualModule
} from './virtual-modules';
import { createVirtualRegistry } from './virtual-registry';
import type { VirtualModuleRegistry } from './virtual-registry';
import { ASSET_MANIFEST_VIRTUAL_ID, resolveInjectedAssetTags } from './vite/asset-manifest';
import type { ClientManifestEntry } from './vite/asset-manifest';
import { generateOpenApiTypesFromApp } from './vite/openapi-step';
import { attachPreviewMiddleware } from './vite/preview';
import { loadWorkerNodeStub, resolveWorkerNodeStub } from './vite/shims';

const logger = getLogger('build');

export { createVirtualRegistry } from './virtual-registry';

// RM-V08：dev 环境（自定义 DevEnvironment + env-runner IPC bridge）
export {
  DEV_WORKER_FILE,
  getDevWorkerEntrySource,
  writeDevWorkerEntry,
  invalidateDevWorkerModules,
  type DevWorkerEntryOptions
} from './dev/dev-worker';

export {
  UbeanDevEnvironment,
  UBEAN_DEV_ENV_NAME,
  createEnvRunnerTransport,
  bridgeEnvRunnerInvokes,
  createUbeanDevEnvironmentFactory,
  type EnvRunnerLike
} from './dev/dev-environment';

// RM-V10：dev 请求路由（pre 判据 + post 兜底）与 Node↔Web 适配
export {
  ubeanDevRequestPlugin,
  createUbeanRequestHandlers,
  DEVTOOLS_PASS_THROUGH_PREFIXES,
  getDevApp,
  ensureDevApp,
  isFrameworkHtmlPage,
  isViteResourceRequest,
  collectDevCssLinks,
  injectStylesheetLinks,
  type DevRequestRouterOptions,
  type DevRequestHandlers
} from './dev/dev-request-router';
export { toWebRequest, sendWebResponse } from './dev/node-web';

// RM-V24：`vite preview` 接管（生产 handler / 静态两种形态），静态解析规则与 CLI 的
// `startStaticServer` 共用一份
export {
  ubeanPreviewPlugin,
  attachPreviewMiddleware,
  createPreviewMiddleware,
  resolvePreviewFile,
  sendPreviewFile,
  sendPreviewStatus,
  previewMimeType,
  type UbeanPreviewPluginOptions,
  type UbeanPreviewMiddlewareOptions,
  type PreviewMiddleware,
  type PreviewMiddlewareHost,
  type PreviewFileResolution
} from './vite/preview';

// RM-V26：cloudflare 产物的本地预览 runner（可选依赖 `miniflare`，缺失时给出可执行提示）
export {
  createCloudflarePreviewRunner,
  defaultLoadMiniflare,
  readCompatibilityDate,
  MINIFLARE_INSTALL_HINT,
  type CloudflarePreviewOptions,
  type CloudflarePreviewResult,
  type CloudflarePreviewRunner,
  type MiniflareConstructorLike,
  type MiniflareInstanceLike
} from './vite/cloudflare-preview';

// RM-V11：dev/SSR 路由表（与客户端 `virtual:ubean-pages` 保持同形的唯一入口）
export {
  buildDevSsrRoutes,
  toVueRouterPagePath,
  type DevSsrRoute,
  type DevSsrRoutesOptions
} from './dev/dev-ssr-routes';

// RM-V11：宿主 dev app 装配（把 Vite SSR 图的加载器与渲染器接到 Hono app 上）
export {
  enhanceDevApp,
  type DevHostAppLike,
  type DevRendererOptions,
  type EnhanceDevAppOptions
} from './dev/dev-host-app';

// RM-V13：dev 扫描协调器（一套监听、一次扫描、一个重载顺序）
export {
  createDevScanCoordinator,
  getDevScanCoordinator,
  peekDevScanCoordinator,
  onDevScan,
  DEV_SCAN_DIRS,
  type DevScanCoordinator,
  type DevScanCoordinatorOptions,
  type DevScanSource,
  type DevScanSubscriber
} from './dev/dev-scan';

// RM-V11：宿主 dev app 的创建与自举（扫描 → createUbeanApp → enhance → ready）
export {
  bootstrapDevApp,
  createDevApp,
  createDevAppReady,
  resolveDevSecurityHeaders,
  resolveLocaleVueParam,
  type BootstrapDevAppOptions,
  type BootstrapLogger,
  type CreateDevAppOptions,
  type DevApp,
  type DevAppBootstrap,
  type DevAppReady,
  type DevAppReadyOptions
} from './dev/dev-app';
export type { VirtualModuleRegistry, VirtualModuleResolver } from './virtual-registry';

const VIRTUAL_MODULES = ['ubean:routes', 'ubean:pages', 'ubean:meta', 'ubean:app-config', 'ubean:locales'];
const VIRTUAL_PREFIX = '\0ubean:';
const RESOLVED_ASSET_MANIFEST_ID = `\0${ASSET_MANIFEST_VIRTUAL_ID}`;

export interface UbeanPluginOptions {
  /**
   * 已解析的 ubean 配置。如果未提供,插件会按以下顺序获取:
   * 1. 尝试从全局缓存读取(`loadUbeanConfig` 已被 CLI 调用时会有缓存)
   * 2. 在 `buildStart` 中异步调用 `loadUbeanConfig()` 加载
   */
  config?: UbeanResolvedConfig;
  /**
   * 虚拟模块注册表（RM-V02）。框架路径（build / dev / 主包 vite 入口）**显式注入**一个
   * 由 scan 结果构建的实例；未注入时本插件自建一个实例级注册表，不再使用模块级单例 ——
   * 插件因此不持有跨构建的可变状态。
   */
  registry?: VirtualModuleRegistry;
}

/**
 * ubean 核心 Vite 插件(框架无关部分)。
 *
 * 提供:
 * - 虚拟模块(`ubean:routes`、`ubean:pages`、`ubean:meta`、`ubean:app-config`、`ubean:locales`)
 * - 宏转换(`definePage` / `defineMeta` 在 `.ts` / `.vue` 中被剥离)
 * - 文件监听(dev 模式下扫描 `routes` / `middleware` / `pages` / `layouts` / `plugins` / `locales`)
 * - 实体路由文件生成(当 `routing.mode` 为 `'file'` 或 `'both'` 时触发 `@ubean/vue/generator`)
 *
 * Vue 专属的虚拟模块(`virtual:ubean-pages`、`virtual:ubean-app` 等)由 `@ubean/build/vue` 的
 * `ubeanVite` 提供,二者共用 `useVirtualRegistry()` 注册表。
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

/**
 * 开关打开时插件侧的 environment 构建配置（RM-V21）。
 *
 * 与 CLI 自建 builder 共用 `createBuildEnvironments()` —— 只写 `outDir` 的极简版本会让客户端
 * 环境退回默认入口 `index.html`（实测报 `Cannot resolve entry module index.html`）。
 */
async function buildEnvironmentsForConfig(config: UbeanResolvedConfig) {
  const [
    { createBuildEnvironments, getBuildOutDirsForConfig },
    { getPresetBuildConfig },
    { resolvePresetByName, registerBuiltinPresets },
    { ssrSingletonProdSsr }
  ] = await Promise.all([
    import('./vite/build-configs'),
    import('./production'),
    import('@ubean/preset'),
    import('./ssr-singleton')
  ]);
  registerBuiltinPresets();
  const outDirs = getBuildOutDirsForConfig(config);
  const clientEntryPath = join(resolve(config.rootDir, config.srcDir), 'entry.client.ts');
  return createBuildEnvironments({
    outDirs,
    clientInput: existsSync(clientEntryPath) ? clientEntryPath : join(outDirs.virtual, 'client-entry.mjs'),
    minify: true,
    sourcemap: false,
    presetBuildConfig: getPresetBuildConfig(resolvePresetByName(config.build.preset)),
    ssrNoExternal: (ssrSingletonProdSsr() as { noExternal?: (string | RegExp)[] }).noExternal
  });
}

export function ubeanPlugin(options?: UbeanPluginOptions): Plugin {
  const virtualRegistry = options?.registry ?? createVirtualRegistry();

  // Config 解析:优先使用传入的,其次从缓存获取
  // 如果都没有,在 buildStart 中异步加载
  let ubeanConfig: UbeanResolvedConfig | undefined = options?.config ?? tryGetConfig() ?? undefined;
  /** 已跑过 codegen 的扫描结果（`buildStart` 会在两个环境各跑一次）。 */
  let lastCodegenScan: ScanResult | null = null;
  /** client manifest 的内存载体（RM-V18）：`buildApp` 填、本插件的 load 读。 */
  const assetManifestRef: { current: Record<string, ClientManifestEntry> | null } = { current: null };

  // 派生值 — 在 config 就绪后计算
  let srcDirAbs = '';
  let viteSrcDir = '';
  let viteSrcPrefix = '';

  /** 当前构建是否为 worker 目标（缓存：preset 在一次构建内不变）。 */
  let workerTarget: boolean | undefined;
  function isWorkerTarget(): boolean {
    if (workerTarget !== undefined) return workerTarget;
    workerTarget = false;
    // `UBEAN_BUILD_PRESET` 优先：`ubean build --preset X` 改的是 CLI 侧配置对象，插件实例持有的是
    // 自己那份副本（另一模块实例），看不到 `--preset` —— 不认这个环境变量就会按默认 preset 走，
    // 于是 worker 产物里残留 `node:fs`（实测）。没有该变量时（`vite build` / 插件自举路径）
    // 以配置文件为准。
    const presetName = process.env.UBEAN_BUILD_PRESET || ubeanConfig?.build.preset;
    if (presetName) {
      try {
        registerPresetsSync();
        workerTarget = getPresetBuildConfigSync(resolvePresetNameSync(presetName)).entryType === 'worker';
      } catch {
        workerTarget = false;
      }
    }
    return workerTarget;
  }

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

    /**
     * ADR-0012（RM-V36 收敛后为唯一路径）：以插件身份注册 `client` / `ubean` 两个环境，生命周期
     * 交给 `vite dev|build|preview`。此前由 `experimental.viteBuilder` 开关隔离的旧编排已下线。
     *
     * 唯一例外是**构建已由调用方驱动**（`ubean build` 自建 builder 并传入同一套 env 配置）——
     * 那时插件不能再注册自己的 `buildApp`/`environments`，否则同一份构建会被编排两次
     * （插件返回值会覆盖内联的 `builder` 字段，表现为静默产出不完整）。
     */
    async config() {
      if (!ubeanConfig) {
        ubeanConfig = await loadUbeanConfig();
        ensureDerived();
      }
      if (process.env.UBEAN_BUILD_DRIVEN_BY_CLI === '1') return undefined;

      return {
        /**
         * RM-V21：开关打开时构建编排也交给插件 —— `vite build`（无 CLI）因此能产出
         * `dist/{public,server,manifest.json}`。builder 与 environments 由 Vite 按本钩子创建，
         * 插件只跑拆分好的阶段（`prepareBuild` → `runEnvBuilds`），**不**自建 builder（会递归）。
         *
         * 预渲染也在本路径内（`runEnvBuilds` → `runPrerenderStep`，同一份实现 CLI 路径也在用）。
         * 实测（2026-09，examples/ubean-test，`vp build` vs `ubean build`）：产物树逐项一致，
         * 189 个文件全部对应，仅资源哈希不同 —— 别再照抄「`vite build` 缺静态 HTML」的旧结论。
         */
        builder: {
          async buildApp(builder) {
            // `scanProject` 已在文件顶部静态导入，这里不再从动态 import 里取（避免遮蔽）
            const [
              { createBuildContext, prepareBuild, runEnvBuilds },
              { resolvePresetByName, registerBuiltinPresets },
              { loadContentForBuild }
            ] = await Promise.all([
              import('./vite/build-app'),
              import('@ubean/preset'),
              import('./vite/prerender-step')
            ]);
            registerBuiltinPresets();
            const scanResult = await scanProject({
              cwd: ubeanConfig!.rootDir,
              srcDir: ubeanConfig!.srcDir,
              dirs: ubeanConfig!.dir,
              ignore: ubeanConfig!.scanOptions?.ignore
            });
            // 内容快照决定内容集合页面是否进入预渲染队列（与 CLI 路径一致）
            const { snapshot: contentSnapshot } = await loadContentForBuild(ubeanConfig!.rootDir, ubeanConfig!.content);
            const ctx = createBuildContext({
              cwd: ubeanConfig!.rootDir,
              config: ubeanConfig!,
              preset: resolvePresetByName(ubeanConfig!.build.preset),
              scanResult,
              contentSnapshot
            });
            // 复用本插件的 manifest 载体：注入由核心插件的 load 提供，读的必须是同一个对象
            const prepared = await prepareBuild(ctx, assetManifestRef);
            await runEnvBuilds(builder as never, prepared);
          }
        },
        environments: await buildEnvironmentsForConfig(ubeanConfig)
      };
    },

    async buildStart() {
      if (!ubeanConfig) {
        ubeanConfig = await loadUbeanConfig();
        ensureDerived();
      }
      await scanAndRegister();
    },

    resolveId(id) {
      // worker 目标：`node:fs` / `node:fs/promises` 换成会抛错的桩（见 shims/index.ts 的说明）。
      // 只在 **ubean 环境 + worker 目标** 生效 —— 客户端环境与 Node 目标必须保持真实实现。
      if (this.environment?.name === 'ubean' && isWorkerTarget()) {
        const stub = resolveWorkerNodeStub(id);
        if (stub) return stub;
      }
      // RM-V18：资产标签虚拟模块由核心插件提供 —— 它是两条路径都必然注册的那一个
      if (id === ASSET_MANIFEST_VIRTUAL_ID) return RESOLVED_ASSET_MANIFEST_ID;
      if (VIRTUAL_MODULES.includes(id)) {
        return VIRTUAL_PREFIX + id;
      }
      return undefined;
    },

    /**
     * worker 目标：把产物里的 `import.meta.url` 换成合法的 `file://` 值。
     *
     * workerd 的 ESM 里它**是 undefined**（实测），而打包器为 CJS 依赖生成的互操作垫片正是
     * `createRequire(import.meta.url)`，且**在模块实例化时执行** —— 于是 worker 报
     * `The argument 'path' … Received 'undefined'` 起不来。`createRequire('file:///worker.mjs')`
     * 在 workerd 上实测可用，垫片因此能构造（动态 `require()` 仍解析不到用户依赖，但那类调用只可能
     * 出现在 Node-only 分支里）。
     *
     * 用 `renderChunk` 而不是 `define`：define 只作用于源码，**够不到打包器自己生成的垫片**
     * （实测替换后第 46 行的 `__require` 仍是 `import.meta.url`）。
     */
    renderChunk(code) {
      if (this.environment?.name !== 'ubean' || !isWorkerTarget() || !code.includes('import.meta.url')) {
        return null;
      }
      return { code: code.split('import.meta.url').join('"file:///worker.mjs"'), map: null };
    },

    async load(id) {
      // worker 目标的 node 内建桩（`resolveId` 已把 id 换成虚拟模块）
      const stubSource = loadWorkerNodeStub(id);
      if (stubSource !== undefined) return stubSource;
      if (id === RESOLVED_ASSET_MANIFEST_ID) {
        // 优先用调用方传进来的内存 manifest（RM-V18 的传递），否则按本次服务端构建的 outDir
        // 读旁边的 `<outputDir>/public/.vite/manifest.json`。**必须**有磁盘兜底：CLI 驱动的
        // 两条路径都拿不到本插件实例的 ref（它在用户 `vite.config.ts` 的 `ubeanPlugin()` 里），
        // 而本插件又是唯一提供者 —— 没有兜底就会内联空标签，产出不水合、无样式的 HTML。
        const serverOutDir = this.environment?.config?.build?.outDir;
        const { tags, source } = resolveInjectedAssetTags(assetManifestRef.current, serverOutDir);
        if (source === 'none') {
          logger.warn(
            `${ASSET_MANIFEST_VIRTUAL_ID} 注入时没有可用的 client manifest（服务端 outDir=${serverOutDir ?? 'unknown'}）—— 产出的 HTML 将不含 asset tags。`
          );
        }
        return `export const assetTags = ${JSON.stringify({ ...tags, favicon: null })};\n`;
      }
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
      // RM-V13：监听、去抖、扫描与重载顺序统一交给 dev-scan 协调器。
      //
      // 原先这里自己 `server.watcher.add()` + 自己扫盘，判据与 vue 插件、CLI 的三套各不相同；
      // 尤其 `full-reload` 的发送时机靠注释约束（「这里不要发，等 CLI 重扫完再发」），
      // 而 vue 插件那边正是在立刻发 —— 于是浏览器会带着旧的 `definePage` 元数据刷新。
      // 现在重载由协调器在所有订阅者完成之后统一发出。
      const coordinator = getDevScanCoordinator(server, source => ({
        rootDir: ubeanConfig!.rootDir,
        srcDir: ubeanConfig!.srcDir,
        dirs: ubeanConfig!.dir,
        ignore: ubeanConfig!.scanOptions?.ignore,
        source,
        scan: () => scanProjectOnce(),
        // 仅当没有其他订阅者（无 CLI 的 `vite dev`）时也保证重载 —— 协调器只认第一个 init，
        // 因此这里定义的 reload 就是全局唯一的那一个。
        reload: () => server.ws.send({ type: 'full-reload' })
      }));

      coordinator.subscribe(async (result, changed) => {
        await applyScan(result);
        await runProjectCodegen(result);
        for (const mod of VIRTUAL_MODULES) {
          const module = server.moduleGraph.getModuleById(VIRTUAL_PREFIX + mod);
          if (module) {
            server.moduleGraph.invalidateModule(module);
          }
        }
        if (changed.some(file => file.includes('/locales/'))) {
          for (const file of changed.filter(f => f.includes('/locales/'))) {
            server.ws.send({ type: 'custom', event: 'ubean:locale-update', data: { file } });
          }
        }
      });

      // OpenAPI 类型（`.ubean/openapi.d.ts`）：裸 `vite dev` 下没有 CLI 去做，插件自己做。
      // 该类型只能从 app 的 `/_openapi.json` 现算，所以等 dev server 真正开始服务后再触发一次
      // 「自举 + 进程内请求」（与 CLI 在 `listening` 里拉自己那份同构，只是不发 HTTP）。
      // CLI 驱动时让位（`UBEAN_CODEGEN_BY_CLI`，CLI 自己会生成），避免同一份产物写两次。
      if (process.env.UBEAN_CODEGEN_BY_CLI !== '1') {
        const runOpenApiTypes = async () => {
          if (!ubeanConfig) return;
          try {
            const app = await ensureDevApp(server);
            if (!app) return;
            const result = await generateOpenApiTypesFromApp(app, {
              cwd: ubeanConfig.rootDir,
              buildDir: '.ubean'
            });
            if (result.filePath) logger.info(`OpenAPI types generated: ${result.filePath}`);
          } catch (err) {
            // 类型声明是 DX 产物，不该影响 dev server
            logger.warn(`Failed to generate OpenAPI types: ${err instanceof Error ? err.message : String(err)}`);
          }
        };
        if (server.httpServer) server.httpServer.once('listening', () => void runOpenApiTypes());
        else void runOpenApiTypes();
      }
    },

    /**
     * RM-V24：`vite preview` 接管。
     *
     * fullstack / backend 把产物里的 fetch handler（`dist/server/entry.mjs`）在进程内接上，
     * spa / ssg 走静态服务 —— 两种形态的判据都在 `vite/preview.ts`，与 CLI 的 preview 共用
     * 同一份解析规则（RM-V25 起 CLI 退化为参数与 banner）。
     */
    configurePreviewServer(server) {
      if (!ubeanConfig) return;
      attachPreviewMiddleware(server, ubeanConfig);
    }
  };

  function scanProjectOnce() {
    return scanProject({
      cwd: ubeanConfig!.rootDir,
      srcDir: ubeanConfig!.srcDir,
      dirs: ubeanConfig!.dir,
      ignore: ubeanConfig!.scanOptions?.ignore
    });
  }

  async function scanAndRegister() {
    if (!ubeanConfig) return;
    const result = await scanProjectOnce();
    await applyScan(result);
    await runProjectCodegen(result);
  }

  /**
   * 生成项目类型声明（`.ubean/routes.d.ts`、`pages.d.ts`、`i18n.d.ts`、`auto-imports.d.ts`、
   * `components.d.ts`、`virtual-components.d.ts` …）。
   *
   * **为什么由插件负责**：此前只有 CLI（`ubean dev` / `build` / `prepare`）会跑这套 codegen，
   * 于是裸 Vite 路径（`vite dev` / `vite build`）下这些文件根本不生成 —— 用户的 type-check
   * 与编辑器补全直接不成立。实测：`vp build` 之后示例的 `pnpm type-check` 报
   * `Cannot find module '../components/sc/ThemeBadge.vue'`（虚拟组件声明缺失），以及
   * `routes.d.ts`/`pages.d.ts` 缺失导致的一连串类型错误。ADR-0012 说两条路径等价，
   * 那这一步也得在两条路径上都成立。
   *
   * 与 CLI 的分工：CLI 已经生成过时插件让位（`UBEAN_CODEGEN_BY_CLI` / 构建期的
   * `UBEAN_BUILD_DRIVEN_BY_CLI`），避免同一份产物被两个执行者反复重写。
   */
  async function runProjectCodegen(result: ScanResult): Promise<void> {
    if (!ubeanConfig) return;
    if (process.env.UBEAN_CODEGEN_BY_CLI === '1' || process.env.UBEAN_BUILD_DRIVEN_BY_CLI === '1') return;
    // 同一份扫描结果只跑一次：`buildStart` 会在 client / ubean 两个环境各触发一次
    if (lastCodegenScan === result) return;
    lastCodegenScan = result;

    try {
      await generateTypes(result, {
        cwd: ubeanConfig.rootDir,
        srcDir: ubeanConfig.srcDir,
        buildDir: '.ubean',
        dirs: ubeanConfig.dir,
        autoImports: ubeanConfig.autoImports,
        components: ubeanConfig.components
      });
    } catch (err) {
      // 类型声明是 DX 产物，不该让 dev / build 失败
      logger.warn(`Failed to generate type definitions: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * 依据扫描结果重建路由/中间件注册与虚拟模块。与扫描分离（RM-V13）：dev 下由
   * `dev-scan.ts` 的协调器统一扫一次，三个订阅者各取所需。
   */
  async function applyScan(result: ScanResult): Promise<void> {
    if (!ubeanConfig) return;
    const router = createServerRouter();

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
        })),
        ubeanConfig.rootDir
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
        })),
        ubeanConfig.rootDir
      )
    );

    virtualRegistry.register(createMetaVirtualModule());

    virtualRegistry.register(
      createAppVirtualModule(result.apiRoutes, result.middlewares, result.pages, viteSrcPrefix || '/')
    );

    virtualRegistry.register(
      createLocalesVirtualModule(
        result.locales,
        result.defaultLocale,
        viteSrcPrefix || '/',
        serializeI18nConfig(ubeanConfig.i18n)
      )
    );

    // 实体文件模式:在 dev 启动 / 文件变更时重新生成 `src/router/_generated/`
    // 当 `routing.mode` 为 `'file'` 或 `'both'` 时触发,委托给 `@ubean/vue/generator`
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
 * - `'virtual'`(默认):仅生成 `.ubean/typed-router.d.ts`(类型声明,所有模式都生成)
 * - `'file'`:额外生成 `routes.ts`/`imports.ts` 到 `outputDir`(实体文件,可编辑 `meta`)
 * - `'both'`:同 `'file'`,且虚拟模块也加载实体文件
 *
 * `typed-router.d.ts` 包含 `@ubean/scan` 和 `vue-router`/`vue-router/auto-routes`
 * 的模块增强(让 `useRoute<Name>(name)` 能推断 `route.params` 类型),所有模式
 * 都会生成到 `.ubean/typed-router.d.ts`,与 `auto-imports.d.ts`/`components.d.ts`
 * 等其他纯类型声明产物同目录,由 `.gitignore` 忽略。
 *
 * 由于 `@ubean/vue/generator` 通过动态 import 加载,前端-only 项目
 * (不依赖实体路由文件)即使没有安装 generator 相关依赖也能运行。
 *
 * 注意:`@ubean/config` 与 `@ubean/vue/generator` 的 `getRouteMeta` /
 * `onGenerated` 签名略有差异(配置层面向用户,生成器层面向内部)。本函数
 * 负责适配:把 `(filePath, frontmatter) => meta` 包装为 `(page) => meta`,
 * 把 `GeneratorResult` 转换为 `string[]` 文件路径列表。
 */
async function maybeGenerateRouteFiles(config: UbeanResolvedConfig, scanResult: ScanResult): Promise<void> {
  const mode = config.routing?.mode;
  // 实体文件(routes.ts/imports.ts)仅在 file/both 模式下生成
  const generateEntityFiles = mode === 'file' || mode === 'both';

  const routing = config.routing;
  const outDir = resolve(config.rootDir, routing.outputDir);
  // `typed-router.d.ts` 固定生成到 `.ubean/typed-router.d.ts`,所有模式都生成,
  // 让 virtual 模式也能享受 useRoute<Name>(name) 的类型推断。
  const dtsPath = resolve(config.rootDir, '.ubean', 'typed-router.d.ts');

  // 适配 config.getRouteMeta(file, frontmatter) → generator.getRouteMeta(page)
  // 把页面对象的 `relativePath` 和扫描出的 `frontmatter` 传给配置层钩子。
  const configGetRouteMeta = routing.getRouteMeta;
  const generatorGetRouteMeta: ((page: ScannedPageRoute) => Record<string, unknown> | null) | undefined =
    configGetRouteMeta
      ? (page: ScannedPageRoute) => configGetRouteMeta(page.relativePath, page.frontmatter ?? {})
      : undefined;

  // 动态 import:保持 `@ubean/vue/generator` 为可选依赖
  const { generateRouteFiles } = await import('@ubean/vue/generator');

  const result = await generateRouteFiles(scanResult, {
    cwd: config.rootDir,
    srcDir: config.srcDir,
    outDir,
    dtsPath,
    // virtual 模式只生成 dts,跳过 routes.ts/imports.ts
    generateRoutes: generateEntityFiles,
    generateImports: generateEntityFiles,
    generateDts: true,
    routeLazy: routing.routeLazy,
    layoutLazy: routing.layoutLazy,
    getRouteMeta: generatorGetRouteMeta,
    headerComment: undefined,
    localeVueParam: localeVueParamFromI18n(config.i18n)
  });

  // 适配 GeneratorResult → string[]:配置层 `onGenerated` 期望"已生成的文件路径数组"
  // 注意:virtual 模式下也触发 onGenerated(仅含 dtsPath),让用户感知类型文件已更新
  if (routing.onGenerated) {
    const files: string[] = [result.routesPath, result.importsPath, result.dtsPath].filter((p): p is string =>
      Boolean(p)
    );
    routing.onGenerated(files);
  }
}
