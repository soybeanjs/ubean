import { defineConfig } from 'ubean';

export default defineConfig({
  // frontend-only: 无后端业务逻辑,仅页面路由 + islands + SEO
  // SSR 仍保留用于 SEO,但无 src/routes/、src/crons/、src/server.ts、src/middleware/
});
