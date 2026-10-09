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
      'src/static.ts',
      'src/drivers.ts'
    ],
    deps: {
      // `nodemailer` 必须外置：它只是 devDependency，产物里保留 `import('nodemailer')` 交给目标
      // 运行时解析。10.x 起它是 ESM 包，入口图里 `fetch/index.js` **顶层静态** `import 'node:http'`
      // —— 一旦被打包，该 chunk 顶部就是硬编码的 `node:http`，worker 运行时（workerd）在模块
      // 实例化阶段直接失败 `No such module "node:http"`（`nodejs_compat` 不覆盖 http/net/tls，
      // 只有 fs 系列有构建期桩）。9.x 是 CJS 单包，恰好没有这类静态导入，所以问题只在 10.x 暴露。
      neverBundle: ['hono', 'vite', 'nodemailer', /^node:/, /^@ubean\//]
    }
  }
});
