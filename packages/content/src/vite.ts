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
        server.watcher.on('change', () => {
          scanContent();
          server.ws.send({ type: 'full-reload' });
        });
        server.watcher.on('add', () => {
          scanContent();
          server.ws.send({ type: 'full-reload' });
        });
        server.watcher.on('unlink', () => {
          scanContent();
          server.ws.send({ type: 'full-reload' });
        });
      }
    }
  };
}

export default ubeanContentPlugin;
