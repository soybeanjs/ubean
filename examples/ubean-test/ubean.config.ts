import { defineConfig } from 'ubean';

export default defineConfig({
  i18n: {
    defaultLocale: 'en',
    locales: [
      { code: 'en', language: 'en', name: 'English' },
      { code: 'zh', language: 'zh-CN', name: '中文', dir: 'ltr' }
    ],
    strategy: 'prefix_except_default'
  },
  content: {
    sources: {
      blog: { dir: 'content/blog', prefix: '/blog' }
    }
  },
  // 深合并 override:仅覆盖 connect-src 单条指令,其余 CSP 指令保持框架默认
  // (否则 @iconify/vue 在线加载图标 https://api.iconify.design 会被 default CSP 拦截)
  security: {
    headers: {
      contentSecurityPolicy: {
        'connect-src': ["'self'", 'ws:', 'wss:', 'https://api.iconify.design']
      }
    }
  },
  devtools: true,
  prerender: {
    include: ['/about']
  }
});
