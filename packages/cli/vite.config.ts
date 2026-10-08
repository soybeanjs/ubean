import { defineConfig } from 'vite-plus';

export default defineConfig({
  resolve: {
    tsconfigPaths: true
  },
  /**
   * 集成测试串行跑文件。
   *
   * TS-29 实测过恢复并行（2026-09-28），结论是**当前形态下不可行**，原因是共享可变目录，
   * 不是「改写示例源码」：
   *
   * 1. **冲突面是 `examples/ubean-test` 的 `dist/` 与 `.ubean/`**（示例的默认 `build.outputDir`）。
   *    `preview-cli` 会构建 `dist`，`preview-vite` 的 `ensureDist()` 只做 `existsSync` 短路后
   *    起 preview —— 一方重建时另一方正在预览同一目录。最小复现：
   *    `vp test run test/preview-cli.test.ts test/preview-vite.test.ts` → preview-vite 5 条**全红**；
   *    而两者各自单跑分别 10 passed / 5 passed。`dev-dx` / `dev-reload` / `dev-topology` / `vite-build`
   *    也都把 `.ubean/` 与 `dist/` 指向同一个示例目录。
   * 2. **全量并行 = 3 failed | 26 passed，6 failed | 394 passed | 2 skipped**（串行约 120s，并行 37s）。
   *    且并行**反而拖慢**重构建类用例：`build-contracts` 27.9s → 36.4s（10 核争抢 CPU）。
   *
   * **按目录隔离是可修的**（TS-29 已实测，只是超出本项范围）：把示例复制到仓库 `.temp/` 下
   * （`cp -R` 7.6M / 0.069s）并把 `node_modules` 整体做一次**绝对路径**软链后，`ubean build`
   * （1.95s，42 个客户端资源）与 `ubean dev`（ready 245ms，`[::1]` 返回 200 的真实 SSR HTML）
   * 都正常 —— 早前「示例的 `node_modules` 是相对软链、复制必然断」的推断是错的。
   * 真要落地需要改 10 个测试文件（`preview-cli` / `preview-vite` / `vite-build` / `dev-dx` /
   * `dev-reload` / `dev-topology` / `build-contracts` / `example-smoke` / `preset-runtime/harness` /
   * `config-combos`），并注意 `dev` 只监听 IPv6 `::1`（探针必须用 `[::1]` 或 `localhost`，
   * 用 `127.0.0.1` 会拿到 `000`）。
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
