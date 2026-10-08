import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { resolveRetries } from '../../scripts/flaky.mjs';

// 用 `fileURLToPath` 而不是 `URL.pathname`：CI 矩阵包含 Windows，`pathname` 在那里会给出
// `/C:/...` 这样的路径。
const flakyReporter = fileURLToPath(new URL('../../scripts/flaky.mjs', import.meta.url));

/**
 * TS-33 双轨开关：**在配置文件里决定**，不从 shell 前缀来。
 *
 * 原先靠 `UBEAN_TEST_MODE=build vitest run`（package.json 的 `test:build`）。那是 POSIX
 * 语法，Windows 的 cmd.exe / PowerShell 会把整个赋值当成可执行文件名：
 *
 * ```
 * 'UBEAN_TEST_MODE' is not recognized as an internal or external command,
 * operable program or batch file.
 * ```
 *
 * 于是 build 轨在 Windows CI 上从未真正跑过。改成配置内决定后，`pnpm test:build` 只是
 * `vitest run --mode build` —— 纯 argv，跨平台。
 *
 * 两处写入缺一不可（实测）：
 * - `process.env`：`test/mode.ts` 也被 `global-setup.ts` 在普通 node 路径下执行，那里没有
 *   `import.meta.env`（rolldown 把它换成 `{}`）—— 只写 `test.env` 的话 global-setup 会静默
 *   跑成 dev 轨，测试全绿但测的是错的东西。
 * - `test.env`：worker 里 `process.env` 因平台而异（Windows 的 env 大小写不敏感、需要扁平化），
 *   `test.env` 是 vitest 保证送达每个 worker 的那条路径。
 *
 * 注意 `import.meta.env` 在**配置文件里**恒为 undefined（rolldown 不给你预置），所以钩子只能
 * 用 `({ mode })` 回调参数 —— 这是 vitest 对 `defineConfig` 的既有支持。
 */
export default defineConfig(({ mode }) => {
  const track = process.env.UBEAN_TEST_MODE ?? (mode === 'build' ? 'build' : 'dev');
  // 写进本进程：global-setup.ts（同一进程、同一次 `vitest run`）读的就是它
  process.env.UBEAN_TEST_MODE = track;

  return {
    test: {
      include: ['test/**/*.test.ts'],
      environment: 'node',
      // 送达每个 worker（见上方「两处写入缺一不可」）
      env: { UBEAN_TEST_MODE: track },
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
  };
});
