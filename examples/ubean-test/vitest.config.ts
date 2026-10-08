import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { resolveRetries } from '../../scripts/flaky.mjs';

// 用 `fileURLToPath` 而不是 `URL.pathname`：CI 矩阵包含 Windows，`pathname` 在那里会给出
// `/C:/...` 这样的路径。
const flakyReporter = fileURLToPath(new URL('../../scripts/flaky.mjs', import.meta.url));

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 120000,
    globalSetup: './test/global-setup.ts',
    pool: 'forks',
    /**
     * TS-29：**并行**跑文件（此前是 `false`）。
     *
     * 当初串行的理由是「共享 fixture」—— 但那是 `packages/*` 的情况。本示例的 37 个
     * 测试文件全部只读：共享的是一个由 `global-setup` 启动的 dev server（HTTP 只读请求）
     * 与 `.ubean/*` 生成物，没有任何文件写入（唯一的写盘在 global-setup 的 build 轨产物）。
     * 实测并行后 788 例全绿、墙钟 19.7s → 4.3–5.0s（↓ 约 78%，连跑三次 4.97 / 4.52 / 4.30s）。
     *
     * 注意：`packages/builder` 与 `packages/cli` 都保留 `false`。前者共享 fixture，
     * 已改由 `test/fixtures/materialize.ts` 做 per-suite 副本并恢复并行；后者共享的是
     * `examples/ubean-test` 的 `dist/` 与 `.ubean/`，按目录隔离可修但超出本项范围
     * （详见 `packages/cli/vite.config.ts` 的实测记录）。
     */
    fileParallelism: true,
    // TS-25：L2 记录重试与 flaky（与根配置同一套机制，见 `scripts/flaky.mjs`）。
    // 报告落在本示例的 `coverage/`（已被 .gitignore 忽略），门禁在 CI 里对照
    // `docs/test-flaky.md` 判定 —— 观测到 flaky 而未记录即失败。
    retry: resolveRetries(),
    reporters: ['default', [flakyReporter, { layer: 'L2' }]]
  },
  resolve: {
    alias: {
      'virtual:ubean-islands-registry': new URL('./test/stubs/islands-registry.ts', import.meta.url).pathname
    }
  }
});
