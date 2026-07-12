import { describe, it, expect } from 'vitest';
import { resolveModules, defineModule } from '../src/core/modules';
import type { ResolvedConfig } from '../src/core/config/types';

function createTestConfig(modules: any[] = [], options: { icon?: any; pwa?: any; auth?: any; image?: any; fonts?: any } = {}): ResolvedConfig {
  return {
    rootDir: '/tmp/test',
    srcDir: '/tmp/test',
    modules,
    icon: options.icon ?? false,
    pwa: options.pwa ?? false,
    auth: options.auth ?? false,
    image: options.image ?? false,
    fonts: options.fonts ?? false,
    dir: {
      pages: 'pages',
      routes: 'routes',
      layouts: 'layouts',
      middleware: 'middleware',
      plugins: 'plugins',
      composables: 'src/composables',
      components: 'src/components',
      public: 'public',
      crons: 'crons',
      queues: 'queues',
      locales: 'locales'
    },
    dev: { port: 3000, host: 'localhost', open: false },
    build: { preset: 'node', outputDir: '.ubean/dist', minify: true, sourcemap: false },
    markdown: {
      enabled: true,
      mdx: false,
      theme: 'vitesse-dark',
      markdownExit: { html: true, linkify: true, breaks: false },
      headings: { anchorLinks: true },
      components: { autoImport: true }
    },
    imports: { autoImport: true, dirs: ['composables', 'src/composables'], global: false },
    components: { autoImport: true, dirs: ['src/components', 'components'], directoryAsNamespace: false },
    i18n: {
      defaultLocale: 'en',
      locales: ['en'],
      strategy: 'prefix_except_default',
      detectBrowserLocale: true,
      cookieName: 'ubean_locale',
      fallbackLocale: 'en'
    },
    routeRules: {},
    prerender: {
      enabled: false,
      routes: [],
      ignore: ['/api/**', '/_health'],
      crawlLinks: true,
      concurrency: 4,
      failOnError: false,
      staticDir: '.output/public'
    },
    scanOptions: { ignore: ['**/*.test.*', '**/*.spec.*', '**/_*', '**/*.d.ts'] }
  };
}

describe('Module system (P6-37)', () => {
  describe('resolveModules', () => {
    it('returns builtin plugins when no user modules', async () => {
      const config = createTestConfig();
      const builtinPlugins = [{ name: 'builtin-1' }, { name: 'builtin-2' }];

      const result = await resolveModules({
        cwd: '/tmp/test',
        config,
        builtinPlugins
      });

      expect(result.plugins).toHaveLength(2);
      expect(result.plugins[0].name).toBe('builtin-1');
      expect(result.plugins[1].name).toBe('builtin-2');
      expect(result.modules).toHaveLength(1);
      expect(result.modules[0].name).toBe('ubean-core');
    });

    it('accepts Vite plugin instances directly', async () => {
      const testPlugin = { name: 'test-plugin', apply: 'serve' as const };
      const config = createTestConfig([testPlugin]);
      const builtinPlugins = [{ name: 'builtin' }];

      const result = await resolveModules({
        cwd: '/tmp/test',
        config,
        builtinPlugins
      });

      expect(result.plugins).toHaveLength(2);
      expect(result.plugins[0].name).toBe('builtin');
      expect(result.plugins[1].name).toBe('test-plugin');
    });

    it('accepts factory tuple [factory, options]', async () => {
      const factory = (options: { greeting: string }) => {
        return {
          name: 'factory-plugin',
          options
        };
      };
      const config = createTestConfig([[factory, { greeting: 'hello' }]]);
      const builtinPlugins = [{ name: 'builtin' }];

      const result = await resolveModules({
        cwd: '/tmp/test',
        config,
        builtinPlugins
      });

      expect(result.plugins).toHaveLength(2);
      expect(result.plugins[1].name).toBe('factory-plugin');
    });

    it('accepts ModuleDefinition with vitePlugin', async () => {
      const def = defineModule({
        name: 'defined-module',
        vitePlugin: { name: 'module-plugin' }
      });
      const config = createTestConfig([def]);
      const builtinPlugins = [{ name: 'builtin' }];

      const result = await resolveModules({
        cwd: '/tmp/test',
        config,
        builtinPlugins
      });

      expect(result.plugins).toHaveLength(2);
      expect(result.plugins[1].name).toBe('module-plugin');
    });

    it('accepts ModuleDefinition with multiple vitePlugins', async () => {
      const def = defineModule({
        name: 'multi-plugin-module',
        vitePlugin: [{ name: 'plugin-a' }, { name: 'plugin-b' }]
      });
      const config = createTestConfig([def]);
      const builtinPlugins = [{ name: 'builtin' }];

      const result = await resolveModules({
        cwd: '/tmp/test',
        config,
        builtinPlugins
      });

      expect(result.plugins).toHaveLength(3);
      expect(result.plugins[1].name).toBe('plugin-a');
      expect(result.plugins[2].name).toBe('plugin-b');
    });

    it('extracts setup function from ModuleDefinition', async () => {
      let setupCalled = false;
      const def = defineModule({
        name: 'setup-module',
        vitePlugin: { name: 'setup-plugin' },
        setup: () => {
          setupCalled = true;
        }
      });
      const config = createTestConfig([def]);
      const builtinPlugins: any[] = [];

      const result = await resolveModules({
        cwd: '/tmp/test',
        config,
        builtinPlugins
      });

      expect(result.setupFns).toHaveLength(1);
      await result.setupFns[0](null);
      expect(setupCalled).toBe(true);
    });

    it('deduplicates modules by key', async () => {
      const plugin1 = { name: 'duplicate-plugin' };
      const plugin2 = { name: 'duplicate-plugin' };
      const config = createTestConfig([plugin1, plugin2]);
      const builtinPlugins = [{ name: 'builtin' }];

      const result = await resolveModules({
        cwd: '/tmp/test',
        config,
        builtinPlugins
      });

      expect(result.plugins.filter(p => p.name === 'duplicate-plugin')).toHaveLength(1);
    });

    it('preserves plugin order: builtins first, then user modules in order', async () => {
      const config = createTestConfig([
        { name: 'user-1' },
        { name: 'user-2' },
        { name: 'user-3' }
      ]);
      const builtinPlugins = [{ name: 'builtin-1' }, { name: 'builtin-2' }];

      const result = await resolveModules({
        cwd: '/tmp/test',
        config,
        builtinPlugins
      });

      expect(result.plugins.map(p => p.name)).toEqual([
        'builtin-1',
        'builtin-2',
        'user-1',
        'user-2',
        'user-3'
      ]);
    });

    it('extracts dependsOn from ModuleDefinition', async () => {
      const def = defineModule({
        name: 'dependent-module',
        dependsOn: ['other-module'],
        vitePlugin: { name: 'dep-plugin' }
      });
      const config = createTestConfig([def]);
      const builtinPlugins: any[] = [];

      const result = await resolveModules({
        cwd: '/tmp/test',
        config,
        builtinPlugins
      });

      expect(result.modules).toHaveLength(2);
      const userMod = result.modules.find(m => m.name === 'dependent-module');
      expect(userMod).toBeDefined();
      expect(userMod!.dependsOn).toContain('other-module');
    });

    it('extracts hooks from ModuleDefinition', async () => {
      const hookFn = () => {};
      const def = defineModule({
        name: 'hooked-module',
        vitePlugin: { name: 'hook-plugin' },
        hooks: {
          'app:ready': hookFn
        }
      });
      const config = createTestConfig([def]);
      const builtinPlugins: any[] = [];

      const result = await resolveModules({
        cwd: '/tmp/test',
        config,
        builtinPlugins
      });

      const userMod = result.modules.find(m => m.name === 'hooked-module');
      expect(userMod).toBeDefined();
      expect(userMod!.hooks).toBeDefined();
      expect(userMod!.hooks!['app:ready']).toBe(hookFn);
    });

    it('handles async factory functions', async () => {
      const asyncFactory = async () => {
        return { name: 'async-plugin' };
      };
      const config = createTestConfig([[asyncFactory, {}]]);
      const builtinPlugins = [{ name: 'builtin' }];

      const result = await resolveModules({
        cwd: '/tmp/test',
        config,
        builtinPlugins
      });

      expect(result.plugins).toHaveLength(2);
      expect(result.plugins[1].name).toBe('async-plugin');
    });

    it('gracefully handles factory that returns nothing', async () => {
      const emptyFactory = () => null;
      const config = createTestConfig([[emptyFactory, {}]]);
      const builtinPlugins = [{ name: 'builtin' }];

      const result = await resolveModules({
        cwd: '/tmp/test',
        config,
        builtinPlugins
      });

      expect(result.plugins).toHaveLength(1);
      expect(result.plugins[0].name).toBe('builtin');
    });

    it('gracefully handles invalid module entries', async () => {
      const config = createTestConfig([null, undefined, 123, 'string-that-wont-resolve'] as any[]);
      const builtinPlugins = [{ name: 'builtin' }];

      const result = await resolveModules({
        cwd: '/tmp/test',
        config,
        builtinPlugins
      });

      expect(result.plugins.length).toBeGreaterThanOrEqual(1);
      expect(result.plugins[0].name).toBe('builtin');
    });

    it('supports factory returning Vite plugin directly', async () => {
      const factory = () => ({ name: 'direct-plugin' });
      const config = createTestConfig([[factory, {}]]);
      const builtinPlugins: any[] = [];

      const result = await resolveModules({
        cwd: '/tmp/test',
        config,
        builtinPlugins
      });

      expect(result.plugins).toHaveLength(1);
      expect(result.plugins[0].name).toBe('direct-plugin');
    });

    it('supports factory returning array of Vite plugins', async () => {
      const factory = () => [{ name: 'p1' }, { name: 'p2' }];
      const config = createTestConfig([[factory, {}]]);
      const builtinPlugins: any[] = [];

      const result = await resolveModules({
        cwd: '/tmp/test',
        config,
        builtinPlugins
      });

      expect(result.plugins).toHaveLength(2);
      expect(result.plugins[0].name).toBe('p1');
      expect(result.plugins[1].name).toBe('p2');
    });
  });

  describe('defineModule', () => {
    it('returns the module definition as-is', () => {
      const def = {
        name: 'test',
        setup: () => {},
        vitePlugin: { name: 'p' }
      };
      const result = defineModule(def);
      expect(result).toBe(def);
    });
  });
});

describe('Builtin module top-level config (P6-39)', () => {
  describe('isBuiltinDisabled', () => {
    it('returns true when config is false', async () => {
      const { isBuiltinDisabled } = await import('../src/core/modules/builtins');
      expect(isBuiltinDisabled(false)).toBe(true);
    });

    it('returns false when config is true', async () => {
      const { isBuiltinDisabled } = await import('../src/core/modules/builtins');
      expect(isBuiltinDisabled(true)).toBe(false);
    });

    it('returns true when config has disabled: true', async () => {
      const { isBuiltinDisabled } = await import('../src/core/modules/builtins');
      expect(isBuiltinDisabled({ disabled: true })).toBe(true);
    });

    it('returns false when config is object without disabled', async () => {
      const { isBuiltinDisabled } = await import('../src/core/modules/builtins');
      expect(isBuiltinDisabled({ someOption: true })).toBe(false);
    });

    it('returns false when config has disabled: false', async () => {
      const { isBuiltinDisabled } = await import('../src/core/modules/builtins');
      expect(isBuiltinDisabled({ disabled: false, otherOpt: 'val' })).toBe(false);
    });
  });

  describe('extractBuiltinOptions', () => {
    it('returns empty object when config is true', async () => {
      const { extractBuiltinOptions } = await import('../src/core/modules/builtins');
      expect(extractBuiltinOptions(true)).toEqual({});
    });

    it('strips disabled property from options object', async () => {
      const { extractBuiltinOptions } = await import('../src/core/modules/builtins');
      const opts = extractBuiltinOptions({ disabled: true, collections: ['mdi'], fallbackToApi: false });
      expect(opts).not.toHaveProperty('disabled');
      expect(opts).toHaveProperty('collections', ['mdi']);
      expect(opts).toHaveProperty('fallbackToApi', false);
    });
  });

  describe('builtin module auto-registration', () => {
    it('does not register builtin modules when all top-level configs are false', async () => {
      const config = createTestConfig([], { icon: false, pwa: false, auth: false, image: false, fonts: false });
      const builtinPlugins = [{ name: 'builtin' }];

      const result = await resolveModules({
        cwd: '/tmp/test',
        config,
        builtinPlugins
      });

      const builtinModulePlugins = result.plugins.filter(
        p => p.name === 'ubean:icon' || p.name === 'ubean:pwa' || p.name === 'ubean:auth' || p.name === 'ubean:image' || p.name === 'ubean:fonts'
      );
      expect(builtinModulePlugins).toHaveLength(0);
    });

    it('does not register when config is disabled: true', async () => {
      const config = createTestConfig([], { icon: { disabled: true } });
      const builtinPlugins = [{ name: 'builtin' }];

      const result = await resolveModules({
        cwd: '/tmp/test',
        config,
        builtinPlugins
      });

      const iconPlugin = result.plugins.find(p => p.name === 'ubean:icon');
      expect(iconPlugin).toBeUndefined();
    });

    it('auto-registers module when top-level config is true (if package installed)', async () => {
      const config = createTestConfig([], { icon: true });
      const builtinPlugins = [{ name: 'builtin' }];

      const result = await resolveModules({
        cwd: '/tmp/test',
        config,
        builtinPlugins
      });

      const iconModule = result.modules.find(m => m.name === 'ubean:icon');
      const iconPlugin = result.plugins.find(p => p.name === 'ubean:icon');
      if (iconModule || iconPlugin) {
        expect(iconModule).toBeDefined();
        expect(iconPlugin).toBeDefined();
      }
    });

    it('does not duplicate register when user explicitly declares module', async () => {
      const explicitIconPlugin = { name: 'ubean:icon', customInstance: true };
      const config = createTestConfig([explicitIconPlugin], { icon: true });
      const builtinPlugins = [{ name: 'builtin' }];

      const result = await resolveModules({
        cwd: '/tmp/test',
        config,
        builtinPlugins
      });

      const iconPlugins = result.plugins.filter(p => p.name === 'ubean:icon');
      expect(iconPlugins.length).toBeLessThanOrEqual(1);
    });

    it('passes options to factory function when config is an object', async () => {
      let receivedOptions: any = null;
      const mockFactory = (opts: any) => {
        receivedOptions = opts;
        return { name: 'ubean:test-mock' };
      };
      const config = createTestConfig([[mockFactory, { presetOption: 'from-tuple' }]]);
      const builtinPlugins: any[] = [];

      const result = await resolveModules({
        cwd: '/tmp/test',
        config,
        builtinPlugins
      });

      expect(result.plugins).toHaveLength(1);
      expect(result.plugins[0].name).toBe('ubean:test-mock');
      expect(receivedOptions).toEqual({ presetOption: 'from-tuple' });
    });
  });
});
