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
    entry: ['src/index.ts', 'src/vite.ts', 'src/generator/index.ts'],
    deps: {
      // Main entry stays external on vue/vue-router only (plus the optional
      // peer @unhead/vue, lazily imported by head.ts). The /vite entry
      // (build-time plugin) additionally stays external on vite and the
      // optional peer @ubean/markdown (lazily imported when markdown is on).
      neverBundle: ['vue', 'vue-router', 'vite', '@unhead/vue', '@ubean/markdown', /^node:/]
    }
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node'
    // reload-dom.test.ts 通过文件头 @vitest-environment docblock 切换 happy-dom
  }
});
