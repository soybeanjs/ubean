import { defineConfig } from 'vite-plus';
import { playwright } from '@vitest/browser-playwright';
import { lint, fmt } from '@soybeanjs/oxc-config';
import { resolveRetries } from './scripts/flaky.mjs';
import { e2eCommands } from './test/browser/commands';

export default defineConfig({
  staged: {
    '*': 'vp check --fix'
  },
  fmt: {
    ...fmt,
    ignorePatterns: ['docs']
  },
  lint,
  resolve: {
    tsconfigPaths: true
  },
  test: {
    globals: true,
    include: ['test/browser/**/*.e2e.spec.ts'],
    setupFiles: ['./test/browser/setup.ts'],
    globalSetup: ['./test/browser/global-setup.ts'],
    testTimeout: 30000,
    hookTimeout: 120000,
    // TS-25：L3 记录重试与 flaky。CI 下给 1 次重试 —— 不重试就永远观测不到 flaky
    // （第一次失败即失败），重试才是「看得见」的前提；「不靠 retry 转绿」由
    // `scripts/flaky.mjs` 的报告 + 门禁保证：观测到 flaky 却没写进 `docs/test-flaky.md`
    // 的待修清单会退出非零。本地默认 0 次（偶发失败应当当场暴露），`UBEAN_TEST_RETRIES` 可覆盖。
    retry: resolveRetries(),
    // 显式写 `default` 是必要的：vitest 的 `reporters` 是替换而非追加，省掉它就没有任何
    // 可读输出。`github-actions` 不在列表里 —— CI 下它由 vitest 的默认值自动追加
    // （`GITHUB_ACTIONS=true` 时），这里再写一次反而会在 step summary 里出现两份 flaky 段。
    reporters: ['default', ['./scripts/flaky.mjs', { layer: 'L3' }]],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' as const }],
      // TS-32 ③：CI 的 `Upload Playwright traces` 步骤此前是装饰性的 —— 不配置
      // trace 时 Vitest 只在默认的 `__traces__` 目录留档，而失败时并不会落到
      // `test-results/`，于是 upload-artifact 永远空跑（实测 0 个 .trace.zip）。
      // 这里显式把 trace 落到 CI 上传的那个目录，且只在失败时保留，避免每次跑
      // 全量 201 条用例都产出数百 MB 的 zip。
      trace: { mode: 'retain-on-failure', tracesDir: 'test-results' },
      commands: { ...e2eCommands }
    }
  }
});
