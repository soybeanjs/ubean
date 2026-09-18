import { defineConfig } from 'ubean';

// 顶层 await 是**刻意保留的回归夹具**，不要「顺手清理」成同步写法：它守着
// 「配置在裸 Vite 路径也能解析」这条不变量（`ubeanPlugin()` 异步加载；此前的同步
// 加载器会把整份配置静默换成默认值 / 直接崩在 vite.config.ts 求值阶段）。
// 覆盖它的是 `packages/cli/test` 的 dev-reload / vite-build / preview-vite —— 三者都用
// 真实子进程跑裸 `vp` 命令，且不加载任何预热。
async function getPrerender() {
  return ['/about'];
}

const prerender = await getPrerender();

export default defineConfig({
  // ISR（P9-03）：`/isr-demo` 的响应缓存 1 秒 + stale-while-revalidate。
  // ttl 取 1s 是为了能在走查里观察到 MISS → HIT → STALE 三段（见 dev-topology 的用例）。
  routeRules: {
    '/isr-demo': { isr: { ttl: 1, swr: true } },
    // PPR（P9-04）：强制流式 SSR + 纳入预渲染发现（等价 `ssr: 'streaming'`，并隐含 prerender）
    '/ppr-demo': { ppr: true }
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
    include: prerender
  }
});
