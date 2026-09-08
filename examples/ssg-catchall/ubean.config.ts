import { defineConfig } from 'ubean';

// SSG 模式示例:仿照 UbeanUI docs 的 catch-all 路由结构
// (根 `[...slug]` + 分区 `ui/[...slug]`、`aria/[...slug]`)。
// 用于验证 SSG 构建产物中 `_...slug_` 命名 chunk 能被 preview 静态服务器正常访问。
export default defineConfig({
  mode: 'ssg',
  srcDir: 'src',
  // i18n 多语言展开冒烟（docs/adr/0011-lightweight-ssg-direct-render.md）：
  // prefix_except_default → en 无前缀 + /zh 前缀，expandRoutes 自动展开全语言 URL
  i18n: {
    defaultLocale: 'en',
    locales: [
      { code: 'en', language: 'en', name: 'English' },
      { code: 'zh', language: 'zh-CN', name: '中文', dir: 'ltr' }
    ],
    strategy: 'prefix_except_default'
  },
  prerender: {
    all: false,
    include: [
      '/',
      '/ui',
      '/ui/components/button',
      '/ui/components/tooltip',
      '/aria',
      '/aria/components/popper',
      '/playground'
    ],
    crawlLinks: true
  }
});
