/**
 * 构建步骤的**可复用切片**（Phase 2 地基）。
 *
 * 收敛前的旧编排是一条约 300 行的直线流程：清理输出 → 落盘虚拟模块与 index.html →
 * 两次 `viteBuild`（client / server）→ preset 包装 → 写 manifest。RM-V16 起要把它交给
 * `createBuilder` 的 `buildApp` 编排（`prepare → client env → ubean env → prerender →
 * preset 包装 → manifest`），但目标是**产物逐字节可比**，所以先把与「用 viteBuild 还是
 * builder.build(env)」无关的几步切出来单独可测，再在 `build-app.ts` 里用环境驱动的方式
 * 重新编排。
 *
 * 这里只搬移、不改语义：所有行为与旧编排原先逐段一致。
 */
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import type { Preset } from '@ubean/preset';
import { getLogger } from '@ubean/shared/logger';
import { join, relative, resolve } from 'pathe';
import { findUnsupportedNodeImports } from './cloudflare-preview';

const logger = getLogger('build');

export interface BuildOutDirs {
  root: string;
  public: string;
  server: string;
  assets: string;
  virtual: string;
}

/** 产物目录布局（`dist/` 根、`dist/public`、`dist/server`，虚拟模块落 `.ubean/virtual`）。 */
export function getBuildOutDirs(cwd: string, outputDir: string): BuildOutDirs {
  const outputRoot = resolve(cwd, outputDir);
  return {
    root: outputRoot,
    public: join(outputRoot, 'public'),
    server: join(outputRoot, 'server'),
    assets: join(outputRoot, 'public', 'assets'),
    virtual: join(cwd, '.ubean', 'virtual')
  };
}

export interface CleanOutputOptions {
  outDirs: BuildOutDirs;
  hasPages: boolean;
  hasServer: boolean;
  mode: string;
  ssrEnabled: boolean;
}

/** 清空并重建产物目录（页面/服务端目录按 mode 决定是否创建）。 */
export async function cleanBuildOutput(options: CleanOutputOptions): Promise<void> {
  const { outDirs, hasPages, hasServer, mode, ssrEnabled } = options;
  logger.info(`Cleaning output directory... (mode=${mode}${mode === 'fullstack' ? `, ssr=${ssrEnabled}` : ''})`);
  if (existsSync(outDirs.root)) {
    await rm(outDirs.root, { recursive: true, force: true });
  }
  if (hasPages) {
    await mkdir(outDirs.public, { recursive: true });
  }
  if (hasServer) {
    await mkdir(outDirs.server, { recursive: true });
  }
}

/** 客户端构建的 HTML 入口模板（`index.html` 写进 `.ubean/virtual`，作为 client env 的 input）。 */
export function renderClientIndexHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <title>Ubean App</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="virtual:ubean-client-entry"></script>
</body>
</html>`;
}

/** 把客户端 HTML 入口写到虚拟模块目录，返回其路径（client env 的 `build.rollupOptions.input`）。 */
export async function writeClientIndexHtml(virtualDir: string): Promise<string> {
  const target = join(virtualDir, 'index.html');
  await writeFile(target, renderClientIndexHtml(), 'utf-8');
  return target;
}

/**
 * spa 模式的静态站点入口（`public/index.html`）。
 *
 * fullstack / ssg 的 HTML 由 SSR 渲染（或预渲染）产出，里面的资产标签来自 client manifest；
 * **spa 没有服务端**，客户端构建的 input 是虚拟 entry 而不是 HTML，因此 Vite 不会产出任何 HTML ——
 * 曾经的 spa 产物只有 `assets/`，部署出去没有入口文件（文档承诺的是「static `index.html` + assets」，
 * 实现与文档不符，直到 RM-V36 的矩阵按 mode 断言产物才发现）。
 *
 * 这里在客户端构建之后补出这个入口，资产标签复用与 SSR 相同的 `computeAssetTags()`：同一个
 * manifest、同一套标签规则，避免出现第二种「入口长什么样」的定义。
 */
export async function writeSpaIndexHtml(options: {
  outDirs: BuildOutDirs;
  tags: { css: string; body: string; favicon: string | null };
}): Promise<string> {
  const { outDirs, tags } = options;
  const target = join(outDirs.public, 'index.html');
  const favicon = tags.favicon ?? '/favicon.svg';
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="icon" href="${favicon}" type="image/svg+xml" />
  <title>Ubean App</title>
${tags.css ? `  ${tags.css.split('\n').join('\n  ')}\n` : ''}</head>
<body>
  <div id="app"></div>
  ${tags.body}
</body>
</html>`;
  await writeFile(target, html, 'utf-8');
  return target;
}

export interface PresetWrapperOptions {
  mode: string;
  /** `fetch` 是 preset 里对「标准 fetch handler」的称呼，映射到 `entries.standard`。 */
  presetBuildConfig: { entryType: 'node' | 'worker' | 'standard' | 'fetch' };
  outDirs: BuildOutDirs;
  /** 由调用方提供的包装文件源码（避免把三份模板也搬进本模块）。 */
  entries: { node: () => string; worker: () => string; standard: () => string };
}

/**
 * 写 preset 包装文件，返回服务端入口文件名。
 *
 * ssg 模式**不生成**包装：产物是纯静态站点，而包装文件 import 的 `createFetchHandler`
 * 在静态 entry 里不存在。
 */
export async function writePresetWrapper(options: PresetWrapperOptions): Promise<string> {
  const { mode, presetBuildConfig, outDirs, entries } = options;
  if (mode === 'ssg') {
    logger.info('SSG mode: skipping preset server wrapper (static output only)');
    return 'entry.mjs';
  }

  if (presetBuildConfig.entryType === 'node') {
    await writeFile(join(outDirs.server, 'server.mjs'), entries.node(), 'utf-8');
    const pkgJson = {
      type: 'module',
      private: true,
      main: './server.mjs',
      dependencies: { hono: '^4.0.0' }
    };
    await writeFile(join(outDirs.server, 'package.json'), JSON.stringify(pkgJson, null, 2), 'utf-8');
    return 'server.mjs';
  }

  if (presetBuildConfig.entryType === 'worker') {
    await writeFile(join(outDirs.server, 'worker.mjs'), entries.worker(), 'utf-8');
    // `nodejs_compat` 是必需的：产物里的 `node:crypto`（CSRF / draft-mode 的 HMAC）、
    // `node:async_hooks`（i18n / 请求作用域的 ALS）与 `node:path` 都靠它；缺了标志 workerd 以
    // `No such module` 起不来。`node:fs` 则靠构建期的桩（见 vite/shims）—— 它不在 nodejs_compat
    // 支持范围内。
    //
    // 日期取 **2024-09-23** 而不是更早：`nodejs_compat` 从这一天起按 **v2** 生效，才会提供
    // `process` 这类全局 —— 旧日期下 vue-i18n 顶层的 `process.env.NODE_ENV` 会让 worker 在实例化
    // 时直接 `ReferenceError: process is not defined`（实测）。
    const wranglerToml = `
name = "ubean-app"
main = "./server/worker.mjs"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]
assets = { directory = "./public" }
`.trim();
    await writeFile(join(outDirs.root, 'wrangler.toml'), wranglerToml, 'utf-8');
    // worker 目标的产物审计（RM-V26）：Node 内建导入在 workerd 里是硬失败
    // （实测 `No such module "node:fs/promises"` → worker 起不来），而这类问题既不在文件清单里、
    // 也不在体积门禁里。这里只报告不阻断，把失败提前到构建期看得见的地方。
    const unsupported = findUnsupportedNodeImports(outDirs.server);
    if (unsupported.length > 0) {
      logger.warn(
        `worker 产物包含 workerd 不支持的 Node 内建导入（${unsupported.join('、')}）—— ` +
          'Worker 运行时会在启动时直接失败。来源通常是仅 Node 可用的静态服务/文件系统路径。'
      );
    }
    return 'worker.mjs';
  }

  await writeFile(join(outDirs.server, 'handler.mjs'), entries.standard(), 'utf-8');
  return 'handler.mjs';
}

export interface BuildManifest {
  assets: Array<{ file: string; src: string; isEntry?: boolean; css?: string[] }>;
  entry: string;
  clientDir: string;
  serverDir: string;
  preset: string;
}

export interface WriteBuildManifestOptions {
  cwd: string;
  outDirs: BuildOutDirs;
  clientManifest: Record<string, { file: string; isEntry?: boolean; css?: string[] }>;
  serverEntry: string;
  preset: Preset;
  hasPages: boolean;
  hasServer: boolean;
}

/** 汇总 client manifest 与 preset 信息，写 `dist/manifest.json`（构建产物契约的一部分）。 */
export async function writeBuildManifest(options: WriteBuildManifestOptions): Promise<BuildManifest> {
  const { cwd, outDirs, clientManifest, serverEntry, preset, hasPages, hasServer } = options;

  const assets: BuildManifest['assets'] = [];
  for (const [key, entry] of Object.entries(clientManifest)) {
    assets.push({ file: entry.file, src: key, isEntry: entry.isEntry, css: entry.css });
  }

  const manifest: BuildManifest = {
    assets,
    entry: serverEntry,
    clientDir: hasPages ? relative(cwd, outDirs.public) : '',
    serverDir: hasServer ? relative(cwd, outDirs.server) : '',
    preset: preset.name || 'standard'
  };

  await writeFile(join(outDirs.root, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

  logger.info(`Build complete! Output: ${outDirs.root}`);
  if (hasPages) logger.info(`  Client assets: ${outDirs.public}`);
  if (hasServer) {
    logger.info(`  Server bundle: ${outDirs.server}`);
    logger.info(`  Entry: ${serverEntry}`);
  }

  return manifest;
}
