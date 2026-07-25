import { defineConfig } from 'vite-plus';

export default defineConfig({
  resolve: {
    tsconfigPaths: true
  },
  pack: {
    dts: true,
    clean: true,
    sourcemap: true,
    format: ['esm'],
    fixedExtension: false,
    outDir: 'dist',
    entry: ['src/index.ts'],
    deps: {
      neverBundle: ['hono', 'hookable', /^node:/, /^@ubean\//]
    }
  }
});
