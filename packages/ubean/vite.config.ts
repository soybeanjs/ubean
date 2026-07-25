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
    entry: [
      'src/index.ts',
      'src/vite.ts',
      'src/vue-ssr.ts',
      'src/runtime/vue.ts',
      'src/runtime/app.ts',
      'src/runtime/i18n.ts'
    ],
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
