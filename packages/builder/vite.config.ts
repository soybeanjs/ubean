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
    entry: [
      'src/index.ts',
      'src/vite.ts',
      'src/vue.ts',
      'src/production.ts',
      'src/prerender.ts',
      'src/static-render.ts',
      'src/codegen/index.ts',
      'src/actions-plugin.ts'
    ],
    deps: {
      neverBundle: [/^@ubean\//, /^node:/, 'openapi-typescript', 'pathe', 'unimport', 'tinyglobby']
    }
  },
  test: {
    /**
     * 构建类测试串行跑文件。
     *
     * `production-build` 与 `build-parity` 会在**同一个 fixture** 上落 `.ubean/virtual` 与产物目录，
     * 并行时互相清理对方正在用的中间产物（实测：单独跑都绿，一起跑就有一条失败）。与 cli 包同理。
     */
    fileParallelism: false,
    include: ['test/**/*.test.ts'],
    environment: 'node'
  }
});
