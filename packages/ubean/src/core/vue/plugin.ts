import type { Plugin } from 'vite';
import Components from 'unplugin-vue-components/vite';
import AutoImport from 'unplugin-auto-import/vite';
import { join } from 'pathe';
import type { InlinePreset } from 'unimport';
import type { ResolvedConfig as UbeanResolvedConfig } from '../config/types';
import { UBEAN_PRESET } from '../auto-imports';
import { useVirtualRegistry } from '../build/virtual/registry';
import { scanProject } from '../routing/scan';
import {
  createVuePagesVirtualModule,
  createVueAppEntryVirtualModule,
  createClientEntryVirtualModule
} from './virtual-modules';

export interface UbeanVuePluginOptions {
  config: UbeanResolvedConfig;
  ssr?: boolean;
}

const VIRTUAL_CLIENT = '#ubean-client-entry';
const RESOLVED_VIRTUAL_PREFIX = '\0virtual:ubean:';
const CLIENT_ENTRY_URL = `/@id/${encodeURIComponent(VIRTUAL_CLIENT)}`;

const RESOLVED_IDS: Record<string, string> = {
  '#ubean-pages': `${RESOLVED_VIRTUAL_PREFIX}pages`,
  '#ubean-app': `${RESOLVED_VIRTUAL_PREFIX}app`,
  '#ubean-client-entry': `${RESOLVED_VIRTUAL_PREFIX}client-entry`
};

const RESOLVED_TO_HASH: Record<string, string> = Object.fromEntries(
  Object.entries(RESOLVED_IDS).map(([k, v]) => [v, k])
);

export function ubeanVuePlugin(_options: UbeanVuePluginOptions): Plugin[] {
  const { config: ubeanConfig } = _options;
  const virtualRegistry = useVirtualRegistry();
  const srcDir = join(ubeanConfig.rootDir, ubeanConfig.srcDir);
  const dtsDir = join(ubeanConfig.rootDir, '.ubean');

  const autoImportEnabled = ubeanConfig.imports.autoImport !== false;
  const componentAutoImportEnabled = ubeanConfig.components.autoImport !== false;
  const directoryAsNamespace = ubeanConfig.components.directoryAsNamespace ?? false;

  const composablesDirName = ubeanConfig.dir.composables || 'composables';
  const componentsDirName = ubeanConfig.dir.components || 'components';
  const composablesDirs = [join(srcDir, composablesDirName), ...(ubeanConfig.imports.dirs || [])];
  const componentsDirs = [join(srcDir, componentsDirName), ...(ubeanConfig.components.dirs || [])];

  function getVirtualModule(hashId: string) {
    return virtualRegistry.getModules().find(m => m.id === hashId);
  }

  async function loadVirtualModule(hashId: string): Promise<string | undefined> {
    const mod = getVirtualModule(hashId);
    if (!mod) return undefined;
    return mod.load();
  }

  async function scanAndRegister() {
    const result = await scanProject({
      cwd: ubeanConfig.rootDir,
      srcDir: ubeanConfig.srcDir,
      dirs: ubeanConfig.dir,
      ignore: ubeanConfig.scanOptions?.ignore
    });

    virtualRegistry.register(createVuePagesVirtualModule(result.pages, result.layouts));
    virtualRegistry.register(createVueAppEntryVirtualModule(result.appEntry));
    virtualRegistry.register(createClientEntryVirtualModule());
  }

  const HASH_IDS = Object.keys(RESOLVED_IDS);

  const corePlugin: Plugin = {
    name: 'ubean:vue',
    enforce: 'pre',

    async buildStart() {
      await scanAndRegister();
    },

    resolveId(id) {
      if (RESOLVED_IDS[id]) {
        return RESOLVED_IDS[id];
      }
      if (RESOLVED_TO_HASH[id]) {
        return id;
      }
      return undefined;
    },

    async load(id) {
      const hashId = RESOLVED_TO_HASH[id];
      if (hashId) {
        return loadVirtualModule(hashId);
      }
      return undefined;
    },

    config() {
      return {
        appType: 'custom',
        optimizeDeps: {
          exclude: ['ubean', ...HASH_IDS]
        },
        ssr: {
          noExternal: ['ubean']
        }
      };
    },

    transformIndexHtml(html) {
      if (html.includes(CLIENT_ENTRY_URL) || html.includes(VIRTUAL_CLIENT)) return html;
      return html.replace('</body>', `  <script type="module" src="${CLIENT_ENTRY_URL}"></script>\n</body>`);
    },

    configureServer(server) {
      const watchDirs = ['pages', 'layouts', 'app'];

      for (const dir of watchDirs) {
        server.watcher.add(join(srcDir, dir));
      }

      async function handleFileChange(file: string) {
        const rel = file.replace(`${srcDir}/`, '');
        const isAppFile = /^app(\.(server|client))?\.(ts|js|mjs|mts)$/.test(rel);
        if (isAppFile || watchDirs.some(d => rel.startsWith(`${d}/`))) {
          await scanAndRegister();
          const resolvedIds = Object.values(RESOLVED_IDS);
          for (const vid of resolvedIds) {
            const mod = server.moduleGraph.getModuleById(vid);
            if (mod) {
              server.moduleGraph.invalidateModule(mod);
            }
          }
          server.ws.send({ type: 'full-reload' });
        }
      }

      server.watcher.on('add', handleFileChange);
      server.watcher.on('unlink', handleFileChange);
      server.watcher.on('change', handleFileChange);
    }
  };

  const plugins: Plugin[] = [corePlugin];

  if (autoImportEnabled) {
    plugins.push(
      AutoImport({
        imports: [UBEAN_PRESET as InlinePreset],
        dirs: composablesDirs,
        dts: join(dtsDir, 'auto-imports.d.ts'),
        vueTemplate: true,
        eslintrc: { enabled: false }
      }) as Plugin
    );
  }

  if (componentAutoImportEnabled) {
    plugins.push(
      Components({
        dirs: componentsDirs,
        extensions: ['vue'],
        directoryAsNamespace,
        dts: join(dtsDir, 'components.d.ts'),
        deep: true
      }) as Plugin
    );
  }

  return plugins;
}
