import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite-plus';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
    }
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    alias: {
      '@ubean/devtools': resolve(__dirname, 'src/index.ts')
    }
  }
});
