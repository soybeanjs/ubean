import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite-plus';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Rolldown plugin that keeps `@vitejs/devtools-kit`, `vite` (vite-plus-core),
 * `@devframes/hub`, `devframe`, and `esbuild` external to the DTS bundle.
 *
 * These packages' types chain through vite-plus-core's internal
 * `esbuildOptions.d.ts`, which does `import type esbuild from 'esbuild'` with
 * a `@ts-ignore`. The DTS bundler doesn't honour `@ts-ignore` and fails with
 * MISSING_EXPORT because esbuild's types have no default export. Keeping them
 * external leaves the import specifiers untouched in emitted declarations —
 * the correct behaviour for third-party peer/dev deps anyway.
 */
const RE_DTS = /\.d\.[cm]?ts$/;
const EXTERNAL_DTS_RE = /^(?:@vitejs\/devtools-kit|@vitejs\/devtools|vite|@devframes\/hub|devframe|esbuild|@voidzero-dev\/vite-plus-core)(?:\/|$)/;
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
    outDir: 'dist',
    entry: ['src/index.ts'],
    deps: {
      neverBundle: ['vue', 'hono', 'ubean', 'hookable', 'pathe', /^node:/]
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
