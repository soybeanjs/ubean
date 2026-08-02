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
      'src/cache-directive.ts',
      // ADR-0003 OPT-06: 语义聚合子路径入口
      'src/cache-entry.ts',
      'src/realtime.ts',
      'src/security.ts',
      'src/middleware.ts',
      'src/cron-entry.ts',
      'src/analytics-entry.ts',
      // ADR-0003 OPT-06: 1:1 子路径入口（语义重命名，指向现有文件）
      'src/database.ts',
      'src/queue.ts',
      'src/storage.ts',
      'src/observability.ts',
      'src/email.ts',
      'src/static.ts'
    ],
    deps: {
      neverBundle: ['hono', 'vite', /^node:/, /^@ubean\//]
    }
  }
});
