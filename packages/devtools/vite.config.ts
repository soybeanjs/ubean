import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite-plus';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Rolldown plugin that keeps `@devframes/*`, `devframe`, `vite` (vite-plus-core)
 * and `esbuild` external to the DTS bundle.
 *
 * These packages' types chain through vite-plus-core's internal
 * `esbuildOptions.d.ts`, which does `import type esbuild from 'esbuild'` with
 * a `@ts-ignore`. The DTS bundler doesn't honour `@ts-ignore` and fails with
 * MISSING_EXPORT because esbuild's types have no default export. Keeping them
 * external leaves the import specifiers untouched in emitted declarations —
 * the correct behaviour for third-party peer/dev deps anyway.
 */
const RE_DTS = /\.d\.[cm]?ts$/;
const EXTERNAL_DTS_RE = /^(?:vite|@devframes\/|devframe|esbuild|@voidzero-dev\/vite-plus-core)(?:\/|$)/;
function externalDtsDevtoolsPlugin() {
  return {
    name: 'ubean:external-dts-devtools',
    resolveId: {
      order: 'pre' as const,
      handler(id: string, importer?: string) {
        const normalizedImporter = importer?.replaceAll('\\', '/');
        if (normalizedImporter && RE_DTS.test(normalizedImporter) && EXTERNAL_DTS_RE.test(id)) {
          return { id, external: true };
        }
        return null;
      }
    }
  };
}

export default defineConfig({
  resolve: {
    tsconfigPaths: true
  },
  pack: {
    dts: true,
    clean: true,
    format: ['esm'],
    fixedExtension: false,
    outDir: 'dist',
    entry: ['src/index.ts'],
    deps: {
      // hub / hub-ui / vite 是可选依赖（只有启用 DevTools 时才装）：绝不能被内联进产物，
      // 否则未装它们的用户会直接 import 失败。
      neverBundle: ['vue', 'hono', 'hookable', 'pathe', /^node:/]
    },
    plugins: [externalDtsDevtoolsPlugin()]
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    alias: {
      '@ubean/devtools': resolve(__dirname, 'src/index.ts')
    }
  }
});
