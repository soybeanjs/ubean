import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 120000,
    globalSetup: './test/global-setup.ts',
    pool: 'forks',
    fileParallelism: false
  },
  resolve: {
    alias: {
      'virtual:ubean-islands-registry': new URL('./test/stubs/islands-registry.ts', import.meta.url).pathname
    }
  }
});
