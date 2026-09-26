import type { Plugin } from 'vite';
import { defu } from 'defu';
import { join } from 'pathe';
import { configureContentRuntime, registerContent } from './runtime';
import { scanContentSources } from './scan';
import { generateSearchSectionsSnapshot } from './search';
import type { ContentDocument, ContentSearchOptions } from './types';

export interface UbeanContentOptions {
  sources?: Record<string, { dir: string; prefix?: string; type?: string }>;
  defaultDir?: string;
  ignores?: string[];
  markdown?: {
    toc?: { depth?: number; searchDepth?: number };
    anchorLinks?: boolean;
  };
  navigation?: boolean;
  experimental?: {
    watch?: boolean;
  };
  /**
   * 全文检索配置（SSG 默认开启）：
   * - `provider: 'pagefind'`（默认）构建后扫描静态 HTML 生成分片索引
   * - `sections: true`（默认）输出 `__search.json` 供 `useContentSearch` 使用
   * - dev server 自动提供 `/__search.json`（与 SSG 产物同构）
   */
  search?: ContentSearchOptions | false;
}

const defaultOptions: UbeanContentOptions = {
  sources: {
    content: { dir: 'content' }
  },
  defaultDir: 'content',
  ignores: ['draft', 'partial', '.'],
  navigation: true,
  experimental: {
    watch: true
  }
};

const VIRTUAL_CONTENT = 'virtual:ubean-content';
const RESOLVED_VIRTUAL_CONTENT = `\0${VIRTUAL_CONTENT}`;

export function ubeanContentPlugin(userOptions: UbeanContentOptions = {}): Plugin {
  const options = defu(userOptions, defaultOptions) as Required<UbeanContentOptions>;
  let rootDir: string;
  let loadedDocuments: Record<string, ContentDocument[]> = {};

  function scanContent() {
    configureContentRuntime();
    loadedDocuments = scanContentSources(rootDir, {
      sources: options.sources,
      defaultDir: options.defaultDir
    });
    for (const [name, documents] of Object.entries(loadedDocuments)) {
      registerContent(name, documents);
    }
  }

  return {
    name: 'ubean:content',
    enforce: 'pre',

    configResolved(resolvedConfig) {
      rootDir = resolvedConfig.root;
      scanContent();
    },

    resolveId(id) {
      if (id === VIRTUAL_CONTENT || id.startsWith(`${VIRTUAL_CONTENT}/`)) {
        return `\0${id}`;
      }
      return null;
    },

    load(id) {
      if (id === RESOLVED_VIRTUAL_CONTENT) {
        const serialized = Object.entries(loadedDocuments)
          .map(([name, docs]) => `export const ${name} = ${JSON.stringify(docs)};`)
          .join('\n');
        return `${serialized}

export const collections = {
${Object.keys(loadedDocuments)
  .map(n => `  ${n}: ${n}`)
  .join(',\n')}
};

export function getCollection(name) {
  return collections[name] || [];
}

export default collections;
`;
      }

      if (id.startsWith(`${RESOLVED_VIRTUAL_CONTENT}/`)) {
        const collectionName = id.slice(RESOLVED_VIRTUAL_CONTENT.length + 1);
        const docs = loadedDocuments[collectionName] || [];
        return `export default ${JSON.stringify(docs)};`;
      }

      return null;
    },

    configureServer(server) {
      // Dev 下提供与 SSG 构建产物同构的 sections payload，
      // 使 useContentSearch 的 fetch 路径在 dev / SSG 行为一致。
      if (options.search !== false) {
        server.middlewares.use('/__search.json', (_req, res) => {
          const payload = generateSearchSectionsSnapshot(loadedDocuments);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(payload));
        });
      }

      if (options.experimental?.watch) {
        const watchPatterns = Object.values(options.sources || {}).map(s => {
          return join(s.dir || options.defaultDir, '**/*.{md,mdx,json,yaml,yml}');
        });

        server.watcher.add(watchPatterns);
        // 判据必须与 `scanContentSources` 的目录解析一致，且必须**逐事件过滤**：
        // `server.watcher` 监听的是整个项目（不是 `add()` 进来的那几个 glob），不过滤的话改任何
        // 文件 —— 页面组件、样式、`app.ts` —— 都会整页重载，把 Vue/Vite 已经送到的 HMR 顶掉。
        // 实测（`examples/ubean-test`）：改 `src/pages/index.vue` 正文时浏览器收到一条
        // `{"type":"full-reload"}`，来源就是这里；`apps/docs`（未启用 content）不受影响。
        const isContentFile = createContentChangeFilter({
          rootDir,
          sources: options.sources,
          defaultDir: options.defaultDir
        });
        const onWatch = (file: string): void => {
          if (!isContentFile(file)) return;
          scanContent();
          server.ws.send({ type: 'full-reload' });
        };

        server.watcher.on('change', onWatch);
        server.watcher.on('add', onWatch);
        server.watcher.on('unlink', onWatch);
      }
    }
  };
}

/** 内容源目录里的内容文件扩展名（与上面的 watch glob 同一套）。 */
const CONTENT_WATCH_EXTENSIONS = /\.(md|mdx|json|yaml|yml)$/;

/**
 * 判断一次 watcher 事件是否落在内容源目录里（dev watch 用）。
 *
 * 目录解析刻意与 `scanContentSources` 对齐（`join(rootDir, source.dir || defaultDir)`）：
 * 两边不一致会出现「扫到了却不算内容」或「不是内容却重载」两种偏差。
 */
export function createContentChangeFilter(options: {
  rootDir: string;
  sources?: Record<string, { dir: string }>;
  defaultDir: string;
}): (file: string) => boolean {
  const dirs = Object.values(options.sources ?? { content: { dir: options.defaultDir } }).map(source =>
    join(options.rootDir, source.dir || options.defaultDir)
  );
  return file => {
    if (!CONTENT_WATCH_EXTENSIONS.test(file)) return false;
    return dirs.some(dir => file === dir || file.startsWith(`${dir}/`));
  };
}

export default ubeanContentPlugin;
