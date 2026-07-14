import { defineConfig } from 'vite-plus';

export default defineConfig({
  resolve: {
    tsconfigPaths: true
  },
  pack: {
    dts: true,
    clean: true,
    format: ['esm'],
    outDir: 'dist',
    entry: [
      'src/index.ts',
      'src/runtime/handler.ts',
      'src/runtime/error.ts',
      'src/runtime/app.ts',
      'src/runtime/router.ts',
      'src/runtime/env.ts',
      'src/runtime/client.ts',
      'src/runtime/pages/index.ts',
      'src/runtime/vue/index.ts',
      'src/runtime/vue/app.ts',
      'src/core/config/index.ts',
      'src/core/cli/index.ts',
      'src/core/log.ts',
      'src/core/dev/server.ts',
      'src/core/build/vite/plugin.ts',
      'src/core/vue/plugin.ts',
      'src/core/vue/renderer.ts',
      'src/core/vue/virtual-modules.ts',
      'src/core/routing/index.ts',
      'src/core/codegen/index.ts',
      'src/core/preset/index.ts'
    ],
    // onSuccess: 'tsc --emitDeclarationOnly',
    deps: {
      neverBundle: [
        'hono',
        'c12',
        'citty',
        'consola',
        'defu',
        'pathe',
        'ufo',
        'zod',
        '@standard-schema/spec',
        'hookable',
        'mlly',
        'rou3',
        'scule',
        'tinyglobby',
        'vue',
        '@vue/server-renderer',
        'vite',
        '@vitejs/plugin-vue',
        'unocss',
        /^@unocss\//,
        'chokidar',
        'jiti',
        'esbuild',
        'lightningcss',
        'rollup',
        /^@rolldown\//,
        '@ubean/devtools',
        /^node:/
      ]
    }
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node'
  }
});
