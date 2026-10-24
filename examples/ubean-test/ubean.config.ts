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
