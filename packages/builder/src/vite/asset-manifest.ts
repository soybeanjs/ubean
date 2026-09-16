/**
 * 客户端资产清单的**构建期注入**（RM-V18）。
 *
 * 整改前：生成的 SSR entry 在**运行时**读 `join(__dirname, '..', 'public', '.vite', 'manifest.json')`
 * —— 于是（a）服务端产物必须与 `dist/public` 的相对位置保持不变才能工作，（b）构建顺序被绑成
 * 「必须先 client 后 server」，且这个约束只体现在一句 `try/catch` 里（清单读不到就静默降级为
 * 无 asset tags 的 HTML）。
 *
 * 现在由核心插件提供 `virtual:ubean-asset-manifest`：值在**服务端构建期间**算出后内联进
 * bundle。效果：
 * - 服务端产物自包含，不再依赖 client 产物的磁盘路径（`dist/server` 可单独部署/打包）；
 * - 顺序依赖只剩「构建期要先拿到 manifest 对象」，不再有运行时的路径耦合；
 * - 清单缺失时给出**构建期告警**，而不是运行时静默产出无样式 HTML。
 *
 * **唯一提供者**（2026-09-16 修复）：RM-V21 把本虚拟模块从独立插件挪进核心插件时，两个提供者
 * 并存过一段时间 —— 核心插件那份的 ref 只在它自己的 `buildApp` 里被填，而它在 CLI 驱动的两条
 * 路径上都会**抢先解析**，于是标签被内联成空串，生产 HTML 既没有客户端入口 `<script>` 也没有
 * 样式表 `<link>`（页面不水合、无样式）。文件清单比对看不见内容差异，体积门禁也不比对 HTML，
 * 缺陷因此长期潜伏；由 RM-V24 的 `vite preview` 验收断言暴露。现在改为：
 * 核心插件是唯一提供者，取值顺序为「调用方传入的内存 manifest（RM-V18 的传递）→ 服务端
 * outDir 旁的磁盘 manifest（`<outputDir>/public/.vite/manifest.json`）→ 空 + 构建期告警」。
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Plugin as VitePlugin } from 'vite';
import { getLogger } from '@ubean/shared/logger';

const logger = getLogger('build');

/** 本插件提供的虚拟模块 id。 */
export const ASSET_MANIFEST_VIRTUAL_ID = 'virtual:ubean-asset-manifest';
const RESOLVED_ID = `\0${ASSET_MANIFEST_VIRTUAL_ID}`;

/** 页面渲染用的资产标签（与 `@ubean/pages` 的 `PageAssetTags` 同形）。 */
export interface InjectedAssetTags {
  css: string;
  preloads: string;
  body: string;
  favicon: string | null;
}

/** Vite client manifest 的最小结构（只用到 entry 的 file/css）。 */
export interface ClientManifestEntry {
  file: string;
  isEntry?: boolean;
  css?: string[];
}

/**
 * 从 client manifest 算出资产标签。
 *
 * 与旧运行时逻辑逐字等价（`<script type="module" src="/…">` + 每个 css 一个 `<link>`），
 * 只是执行时机从「服务端启动时」提前到「服务端构建时」。
 */
export function computeAssetTags(
  manifest: Record<string, ClientManifestEntry> | null | undefined,
  favicon?: string | null
): InjectedAssetTags {
  const tags: InjectedAssetTags = { css: '', preloads: '', body: '', favicon: favicon ?? null };
  const entry = manifest ? Object.values(manifest).find(item => item.isEntry) : undefined;
  if (!entry) return tags;

  tags.body = `<script type="module" src="/${entry.file}"></script>`;
  if (Array.isArray(entry.css)) {
    tags.css = entry.css.map(css => `<link rel="stylesheet" href="/${css}">`).join('\n');
  }
  return tags;
}

/** 从磁盘读 client manifest（`<publicDir>/.vite/manifest.json`）。 */
export function readClientManifestFromDisk(publicDir: string): Record<string, ClientManifestEntry> | null {
  const manifestPath = join(publicDir, '.vite', 'manifest.json');
  if (!existsSync(manifestPath)) return null;
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf-8')) as Record<string, ClientManifestEntry>;
  } catch {
    return null;
  }
}

/**
 * 服务端环境构建的 outDir → 客户端产物目录（`<outputDir>/server` → `<outputDir>/public`）。
 *
 * 用**本次构建的 outDir** 而不是配置里的 `build.outputDir`：`--outDir` 会覆盖后者，而插件实例
 * 可能来自用户 `vite.config.ts`（另一份模块实例、另一份配置对象），读配置会拿到过期的值。
 */
export function clientPublicDirFor(serverOutDir: string): string {
  return join(dirname(serverOutDir), 'public');
}

export interface ResolveAssetTagsResult {
  tags: InjectedAssetTags;
  /** 清单来源：内存传递 / 磁盘读取 / 都没有（tags 为空）。 */
  source: 'memory' | 'disk' | 'none';
}

/**
 * 解析要注入的资产标签：内存 manifest 优先，其次读服务端 outDir 旁的磁盘清单。
 *
 * 磁盘兜底存在的原因：CLI 驱动的构建（默认路径与开关路径都算）拿不到核心插件实例的 ref ——
 * 那是用户 `vite.config.ts` 里 `ubeanPlugin()` 的内部状态。此时按 outDir 推断位置读盘，仍满足
 * 「服务端产物自包含」（值在构建期内联，运行时不读盘）。
 */
export function resolveInjectedAssetTags(
  inMemory: Record<string, ClientManifestEntry> | null | undefined,
  serverOutDir: string | undefined
): ResolveAssetTagsResult {
  if (inMemory) return { tags: computeAssetTags(inMemory), source: 'memory' };
  if (serverOutDir) {
    const fromDisk = readClientManifestFromDisk(clientPublicDirFor(serverOutDir));
    if (fromDisk) return { tags: computeAssetTags(fromDisk), source: 'disk' };
  }
  return { tags: computeAssetTags(null), source: 'none' };
}

/**
 * 提供 `virtual:ubean-asset-manifest` 的独立插件。
 *
 * **仅在没有核心插件时使用**（`!userViteConfig` 且未注册 `ubeanPlugin()` 的极端情形）。有核心
 * 插件时不要注册本插件 —— 两个提供者会各自持有 ref，谁先解析谁说了算，实测就是这条导致了
 * 「标签内联为空」的生产缺陷。
 *
 * `getManifest` 在**服务端环境加载该模块时**调用 —— 因此调用方可以先建 builder、按顺序构建
 * client，再把 manifest 填进闭包变量，服务端构建时自然读到最新值（无需重建插件实例）。
 */
export function ubeanAssetManifestPlugin(
  getManifest: () => Record<string, ClientManifestEntry> | null,
  getServerOutDir?: () => string | undefined
): VitePlugin {
  return {
    name: 'ubean:asset-manifest',
    enforce: 'pre',
    resolveId(id) {
      if (id === ASSET_MANIFEST_VIRTUAL_ID) return RESOLVED_ID;
      return undefined;
    },
    load(id, options) {
      if (id !== RESOLVED_ID) return undefined;
      const { tags, source } = resolveInjectedAssetTags(getManifest(), getServerOutDir?.());
      if (source === 'none') {
        // 构建期告警：以前是运行时静默降级（页面无样式且无提示），现在至少能在构建日志里看到
        logger.warn(
          `${ASSET_MANIFEST_VIRTUAL_ID} 注入时没有可用的 client manifest（环境：${options?.ssr ? 'server' : 'client'}）—— 产出的 HTML 将不含 asset tags。`
        );
      }
      // favicon 由调用方的模板单独注入（这里只负责 manifest 派生的部分）
      return `export const assetTags = ${JSON.stringify({ ...tags, favicon: null })};\n`;
    }
  };
}
