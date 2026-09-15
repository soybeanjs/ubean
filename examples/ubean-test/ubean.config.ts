import { defineConfig } from 'ubean';

export default defineConfig({
  // RM-V14：灰度开关 —— 打开后由 Vite 插件接管 dev（请求路由 + 自举宿主 app），
  // `vp dev` 单独即可服务整个应用。默认关闭，保持 `ubean dev` 的旧路径。
  // 集成测试用 `UBEAN_VITE_BUILDER=1 vp dev` 覆盖这条路径。
  experimental: {
    viteBuilder: process.env.UBEAN_VITE_BUILDER === '1'
  },
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
