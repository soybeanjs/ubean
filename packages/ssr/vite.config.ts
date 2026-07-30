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
    entry: ['src/index.ts'],
    deps: {
      neverBundle: ['vue', 'vue-router', '@vue/server-renderer', '@unhead/vue', /^@ubean\//, /^node:/]
    }
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node'
  }
});
