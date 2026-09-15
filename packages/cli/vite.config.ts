import { defineConfig } from 'vite-plus';

export default defineConfig({
  resolve: {
    tsconfigPaths: true
  },
  /**
   * 集成测试串行跑文件。
   *
   * 本包的测试会**起真 dev server 并改写示例项目源码**（`dev-reload` 改 perf 探针、
   * `dev-dx` 改 app.ts、`dev-topology` 只读但同样起服务器）。并行跑文件时它们互相踩：
   * 一个文件改源码会触发另一个文件所连服务器的 rescan 与整页重载，断言随机失败
   * （实测：DX 走查单独跑 3/3 通过，全量并行时 1 条挂掉）。串行是这组测试的正确运行方式。
   */
  test: {
    fileParallelism: false
  },
  pack: {
    dts: true,
    clean: true,
    format: ['esm'],
    fixedExtension: false,
    outDir: 'dist',
    entry: ['src/index.ts', 'src/cli.ts'],
    deps: {
      neverBundle: [/^@ubean\//, /^node:/, /^@vitejs\//, 'citty', 'pathe', 'kolorist', 'vite', '@vitejs/plugin-vue']
    }
  }
});
