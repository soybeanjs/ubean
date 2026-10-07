import { defineConfig } from 'vite-plus';
import { playwright } from '@vitest/browser-playwright';
import { lint, fmt } from '@soybeanjs/oxc-config';
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
