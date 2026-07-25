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
    entry: ['src/index.ts', 'src/app.ts', 'src/define-app.ts'],
    deps: {
      neverBundle: ['vue', 'vue-router', '@unhead/vue', /^@ubean\//, /^node:/]
    }
  }
});
