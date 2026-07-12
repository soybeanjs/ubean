import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import type { Plugin } from 'vite';
import { defu } from 'defu';
import { resolve, relative, join } from 'pathe';
import { configureContentRuntime, registerContent, parseContentFile } from './runtime';

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
  let loadedDocuments: Record<string, any[]> = {};

  function walkDir(dir: string, baseDir: string, files: string[] = []): string[] {
    if (!existsSync(dir)) return files;
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue;
        walkDir(fullPath, baseDir, files);
      } else if (/\.(md|mdx|json|ya?ml)$/.test(entry)) {
        files.push(relative(baseDir, fullPath));
      }
    }
    return files;
  }

  function scanContent() {
    loadedDocuments = {};
    configureContentRuntime();

    for (const [name, sourceConfig] of Object.entries(options.sources || {})) {
      const contentDir = resolve(rootDir, sourceConfig.dir || options.defaultDir);
      if (!existsSync(contentDir)) continue;

      const files = walkDir(contentDir, contentDir);

      const documents: any[] = [];
      for (const file of files) {
        const fullPath = join(contentDir, file);
        try {
          const raw = readFileSync(fullPath, 'utf-8');
          const parsed = parseContentFile(raw, file, { type: sourceConfig.type });
          if (sourceConfig.prefix) {
            parsed._path = sourceConfig.prefix + parsed._path;
          }
          documents.push(parsed);
        } catch (err) {
          console.warn(`[ubean-content] Failed to parse ${file}:`, err);
        }
      }

      loadedDocuments[name] = documents;
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
