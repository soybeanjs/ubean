/**
 * 客户端资产清单的**构建期注入**（RM-V18）。
 *
 * 整改前：生成的 SSR entry 在**运行时**读 `join(__dirname, '..', 'public', '.vite', 'manifest.json')`
 * —— 于是（a）服务端产物必须与 `dist/public` 的相对位置保持不变才能工作，（b）构建顺序被绑成
 * 「必须先 client 后 server」，且这个约束只体现在一句 `try/catch` 里（清单读不到就静默降级为
 * 无 asset tags 的 HTML）。
 *
 * 现在由本插件提供 `virtual:ubean-asset-manifest`：值在**服务端构建期间**由调用方（`buildApp`
 * 或 `buildProduction`）从内存里的 manifest 对象算出后内联进 bundle。效果：
 * - 服务端产物自包含，不再依赖 client 产物的磁盘路径（`dist/server` 可单独部署/打包）；
 * - 顺序依赖只剩「构建期要先拿到 manifest 对象」，不再有运行时的路径耦合；
 * - 清单缺失时给出**构建期告警**，而不是运行时静默产出无样式 HTML。
 */
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

/**
 * 提供 `virtual:ubean-asset-manifest` 的插件。
 *
 * `getManifest` 在**服务端环境加载该模块时**调用 —— 因此调用方可以先建 builder、按顺序构建
 * client，再把 manifest 填进闭包变量，服务端构建时自然读到最新值（无需重建插件实例）。
 */
export function ubeanAssetManifestPlugin(getManifest: () => Record<string, ClientManifestEntry> | null): VitePlugin {
  return {
    name: 'ubean:asset-manifest',
    enforce: 'pre',
    resolveId(id) {
      if (id === ASSET_MANIFEST_VIRTUAL_ID) return RESOLVED_ID;
      return undefined;
    },
    load(id, options) {
      if (id !== RESOLVED_ID) return undefined;
      const manifest = getManifest();
      if (!manifest) {
        // 构建期告警：以前是运行时静默降级（页面无样式且无提示），现在至少能在构建日志里看到
        logger.warn(
          `${ASSET_MANIFEST_VIRTUAL_ID} 注入时没有可用的 client manifest（环境：${options?.ssr ? 'server' : 'client'}）—— 产出的 HTML 将不含 asset tags。`
        );
      }
      const tags = computeAssetTags(manifest);
      // favicon 由调用方的模板单独注入（这里只负责 manifest 派生的部分）
      return `export const assetTags = ${JSON.stringify({ ...tags, favicon: null })};\n`;
    }
  };
}
