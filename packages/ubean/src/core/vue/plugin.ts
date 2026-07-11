import type { Plugin } from 'vite';
import { join } from 'pathe';
import type { ResolvedConfig as UbeanResolvedConfig } from '../config/types';
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

const VUE_VIRTUAL_IDS = ['#ubean-pages', '#ubean-app', '#ubean-client-entry'];
const VUE_VIRTUAL_PREFIX = '\0ubean-vue:';

export function ubeanVuePlugin(_options: UbeanVuePluginOptions): Plugin {
  const { config: ubeanConfig } = _options;
  const virtualRegistry = useVirtualRegistry();

  function resolveVirtualId(id: string): string | undefined {
    if (VUE_VIRTUAL_IDS.includes(id)) {
      return VUE_VIRTUAL_PREFIX + id;
    }
    return undefined;
  }

  async function loadVirtualId(id: string): Promise<string | undefined> {
    if (!id.startsWith(VUE_VIRTUAL_PREFIX)) return undefined;
    const moduleId = id.slice(VUE_VIRTUAL_PREFIX.length);
    const mod = virtualRegistry.getModules().find(m => m.id === moduleId);
    if (mod) {
      return mod.load();
    }
    return undefined;
  }

  async function scanAndRegister() {
    const result = await scanProject({
      cwd: ubeanConfig.rootDir,
      srcDir: ubeanConfig.srcDir,
      dirs: ubeanConfig.dir,
      ignore: ubeanConfig.scanOptions?.ignore
    });

    virtualRegistry.register(createVuePagesVirtualModule(result.pages, result.layouts));
    virtualRegistry.register(createVueAppEntryVirtualModule(result.appEntry, ubeanConfig.srcDir));
    virtualRegistry.register(createClientEntryVirtualModule());
  }

  return {
    name: 'ubean:vue',
    enforce: 'pre',

    async buildStart() {
      await scanAndRegister();
    },

    resolveId(id) {
      const virtual = resolveVirtualId(id);
      if (virtual) return virtual;

      if (id === '#ubean-pages' || id === '#ubean-app' || id === '#ubean-client-entry') {
        return VUE_VIRTUAL_PREFIX + id;
      }

      return undefined;
    },

    async load(id) {
      if (id.startsWith(VUE_VIRTUAL_PREFIX)) {
        return loadVirtualId(id);
      }
      return undefined;
    },

    config() {
      return {
        appType: 'custom',
        optimizeDeps: {
          exclude: ['ubean', '#ubean-pages', '#ubean-app', '#ubean-client-entry']
        },
        ssr: {
          noExternal: ['ubean']
        }
      };
    },

    transformIndexHtml(html) {
      if (html.includes('#ubean-client-entry')) return html;
      return html.replace('</body>', '  <script type="module" src="#ubean-client-entry"></script>\n</body>');
    },

    configureServer(server) {
      const srcDir = join(ubeanConfig.rootDir, ubeanConfig.srcDir);
      const watchDirs = ['pages', 'layouts', 'app'];

      for (const dir of watchDirs) {
        server.watcher.add(join(srcDir, dir));
      }

      async function handleFileChange(file: string) {
        const rel = file.replace(`${srcDir}/`, '');
        const isAppFile = /^app(\.(server|client))?\.(ts|js|mjs|mts)$/.test(rel);
        if (isAppFile || watchDirs.some(d => rel.startsWith(`${d}/`))) {
          await scanAndRegister();
          for (const vid of VUE_VIRTUAL_IDS) {
            const mod = server.moduleGraph.getModuleById(VUE_VIRTUAL_PREFIX + vid);
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
}
