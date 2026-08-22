import { defineConfig } from 'vite-plus';

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
    entry: ['src/index.ts', 'src/app.ts', 'src/define-app.ts', 'src/server.ts', 'src/ssr.ts'],
    deps: {
      neverBundle: ['vue', 'vue-router', 'vue-i18n', '@unhead/vue', '@vue/server-renderer', /^@ubean\//, /^node:/]
    }
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node'
  }
});
