import type { Plugin } from 'vite';
import { join } from 'pathe';
import type { ResolvedConfig as UbeanResolvedConfig } from '../../config/types';
import { createUbeanRouter } from '../../routing/router';
import {
  createRoutingVirtualModule,
  createPagesVirtualModule,
  createMetaVirtualModule,
  createAppVirtualModule
} from '../virtual/modules';
import { scanProject } from '../../routing/scan';
import { useVirtualRegistry } from '../virtual/registry';

const VIRTUAL_MODULES = ['ubean:routes', 'ubean:pages', 'ubean:meta', 'ubean:app-config'];
const VIRTUAL_PREFIX = '\0ubean:';

export interface UbeanPluginOptions {
  config: UbeanResolvedConfig;
}

export function ubeanPlugin(options: UbeanPluginOptions): Plugin {
  const { config: ubeanConfig } = options;
  const virtualRegistry = useVirtualRegistry();

  return {
    name: 'ubean:core',
    enforce: 'pre',

    async buildStart() {
      await scanAndRegister();
    },

    resolveId(id) {
      if (VIRTUAL_MODULES.includes(id)) {
        return VIRTUAL_PREFIX + id;
      }
      return undefined;
    },

    async load(id) {
      if (id.startsWith(VIRTUAL_PREFIX)) {
        const moduleId = id.slice(VIRTUAL_PREFIX.length);
        const mod = virtualRegistry.getModules().find(m => m.id === moduleId);
        if (mod) {
          return await mod.load();
        }
      }
      return undefined;
    },

    configureServer(server) {
      const watchDirs = ['routes', 'middleware', 'pages', 'layouts', 'plugins'];
      const srcDir = join(ubeanConfig.rootDir, ubeanConfig.srcDir);

      for (const dir of watchDirs) {
        server.watcher.add(join(srcDir, dir));
      }

      server.watcher.on('add', handleFileChange);
      server.watcher.on('unlink', handleFileChange);
      server.watcher.on('change', handleFileChange);

      async function handleFileChange(file: string) {
        const relativePath = file.replace(`${srcDir}/`, '');
        if (watchDirs.some(d => relativePath.startsWith(`${d}/`))) {
          await scanAndRegister();
          for (const mod of VIRTUAL_MODULES) {
            const module = server.moduleGraph.getModuleById(VIRTUAL_PREFIX + mod);
            if (module) {
              server.moduleGraph.invalidateModule(module);
            }
          }
          server.ws.send({ type: 'full-reload' });
        }
      }
    }
  };

  async function scanAndRegister() {
    const result = await scanProject({
      cwd: ubeanConfig.rootDir,
      srcDir: ubeanConfig.srcDir,
      dirs: ubeanConfig.dir,
      ignore: ubeanConfig.scanOptions?.ignore
    });

    const router = createUbeanRouter();

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
        }))
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
        }))
      )
    );

    virtualRegistry.register(createMetaVirtualModule());

    virtualRegistry.register(
      createAppVirtualModule(result.apiRoutes, result.middlewares, result.pages, ubeanConfig.srcDir)
    );
  }
}
