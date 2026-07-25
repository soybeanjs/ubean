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
    outDir: 'dist',
    entry: ['src/index.ts', 'src/vite.ts'],
    deps: {
      neverBundle: [
        /^@ubean\//,
        /^node:/,
        'hono',
        'hono-openapi',
        'consola',
        'vite',
        /^@vitejs\//,
        /^@voidzero-dev\//,
        'devframe'
      ]
    }
  }
});
