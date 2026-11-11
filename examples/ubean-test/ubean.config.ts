import { defineConfig, envField } from 'ubean';

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
  pinia: true,
  // ISR（P9-03）：`/isr-demo` 的响应缓存 1 秒 + stale-while-revalidate。
  // ttl 取 1s 是为了能在走查里观察到 MISS → HIT → STALE 三段（见 dev-topology 的用例）。
  routeRules: {
    '/isr-demo': { isr: { ttl: 1, swr: true } },
    // PPR（P9-04）：强制流式 SSR + 纳入预渲染发现（等价 `ssr: 'streaming'`，并隐含 prerender）
    '/ppr-demo': { ppr: true }
  },
  /**
   * `routing.onPages` 端到端夹具。
   *
   * `pages/docs/*.meta.ts` 只在 `meta.iframeUrl` 里写目标地址（`.meta.ts` 是纯元数据页，
   * 没有组件）；钩子把每条改写为 reuse 路由 —— 组件借 `IframeUrl`，URL 作为静态 props。
   * dev / build / prepare / SSG 四条扫描路径共用同一个钩子，`/docs/a`、`/docs/b` 因此是真实 URL。
   *
   * 覆盖：`examples/ubean-test/test/on-pages.test.ts`。
   */
  routing: {
    onPages(pages) {
      const iframe = pages.find(p => p.name === 'IframeUrl');
      if (!iframe) return;

      // 原地改写：同一 `fullPath` 的条目若出现在数组里两次，虚拟模块按 fullPath 去重，
      // 只有第一条能留下 —— 追加一条同源副本会被静默丢掉（这正是 props 丢失的原因）。
      return pages.map(p => {
        const url = p.pageMeta?.meta?.iframeUrl;
        if (typeof url !== 'string' || p === iframe) return p;
        return {
          ...p,
          // 纯元数据页默认 `routable: false` 且没有组件，改写成借用 IframeUrl 的 reuse 路由。
          pageKind: 'reuse' as const,
          routable: true,
          reuseTarget: iframe.name,
          props: { url, title: p.pageMeta?.meta?.title as string }
        };
      });
    }
  },
  /**
   * `iframe/[url].vue` 把外部地址嵌进页面，CSP 里 `default-src 'self'` 会拦住它们。
   * 只补 `frame-src`（嵌套对象浅合并，其余默认指令保持不变）。
   */
  security: {
    headers: {
      contentSecurityPolicy: { 'frame-src': ["'self'", 'https://example.com', 'https://vuejs.org'] }
    }
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
  // 默认 CSP 已在 connect-src 放行内置 Icon 的 Iconify API，且该来源不可被覆盖，无需手动配置
  devtools: true,
  /**
   * `env.schema` 回归夹具（contract: docs/contracts/env-v1.md）。
   *
   * 三个维度各取一个，让 `src/routes/api/env-typed.ts` 能真的在两模块上都读到值，
   * 也让 `.ubean/env.d.ts` 同时生成 `ubean:env/client` 与 `ubean:env/server` 两个声明块
   * —— 只声明一侧的话，另一侧的类型缺失不会被任何测试发现。
   */
  env: {
    mode: 'throw',
    schema: {
      EXAMPLE_APP_TITLE: envField.string({
        context: 'client',
        access: 'public',
        default: 'ubean-test',
        // 每个字段都带 `description`：它会被渲染进 `.ubean/env.d.ts` 的 JSDoc，
        // 也是这条端到端夹具的一部分（见 test/env.test.ts 的声明断言）。
        description: '应用标题，构建期内联进客户端产物'
      }),
      EXAMPLE_API_PREFIX: envField.string({
        context: 'client',
        access: 'public',
        default: '/api',
        description: '客户端请求的 API 前缀'
      }),
      EXAMPLE_PORT: envField.number({
        context: 'server',
        access: 'public',
        default: 9527,
        description: 'HTTP 监听端口'
      }),
      EXAMPLE_SECRET: envField.string({
        context: 'server',
        access: 'secret',
        default: 'example-secret',
        description: '服务端密钥，永不进客户端产物'
      }),
      EXAMPLE_REDIS_URL: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
        description: '可选。连接串形如 redis://host:port'
      })
    }
  },
  prerender: {
    include: prerender
  }
});
