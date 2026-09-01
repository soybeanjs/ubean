import { defineConfig } from 'ubean';

// SSG 模式示例:仿照 UbeanUI docs 的 catch-all 路由结构
// (根 `[...slug]` + 分区 `ui/[...slug]`、`aria/[...slug]`)。
// 用于验证 SSG 构建产物中 `_...slug_` 命名 chunk 能被 preview 静态服务器正常访问。
export default defineConfig({
  mode: 'ssg',
  srcDir: 'src',
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
