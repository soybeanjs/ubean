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
      commands: { ...e2eCommands }
    }
  }
});
