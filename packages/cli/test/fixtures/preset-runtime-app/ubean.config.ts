// TS-12 preset behavior-matrix fixture.
//
// Deliberately a plain object (not `defineConfig`) so the fixture does not need
// its own `node_modules` to resolve the `ubean` package: the build reads this
// through the config loader, which only consumes the default export.
//
// Surfaces are chosen to match the `testPreset()` assertion family:
//   GET  /api/hello        -> JSON route (framework API layer alive)
//   GET  /cached           -> routeRule `cache.ttl` -> observable `X-Cache: HIT`
//   POST /api/echo         -> CSRF-protected unsafe method
//   GET  /nope-...         -> 404 (HTML for navigations, JSON for API paths)
//   GET  /zh/              -> i18n prefixed locale route
//   GET  /_health          -> framework middleware-order endpoint
export default {
  routeRules: {
    '/cached': { cache: { ttl: 60 } },
    // route rules 的另两条能力（缓存之外）：响应头注入、重定向。
    '/api/hello': { headers: { 'x-ubean-route-rule': 'applied' } },
    '/redirect-me': { redirect: '/api/hello' }
  },
  // `dir` 显式给出但不写 `store`：让 `resolveProductionCacheStore()` 按 preset 决定是
  // `fs`（node/bun/deno/standard）还是 `memory`（serverless/edge）——这正是 TS-12 验收③
  // 要观测的接线。目录名带前缀，便于测试在每格之间清空，避免 fs 存储跨 preset 串味。
  cache: { dir: '.ubean/preset-runtime-cache' },
  i18n: {
    defaultLocale: 'en',
    locales: [
      { code: 'en', language: 'en', name: 'English' },
      { code: 'zh', language: 'zh-CN', name: '中文' }
    ],
    strategy: 'prefix_except_default'
  },
  security: {
    // Token mode (double-submit cookie) instead of the `origin` default: it is
    // observable without a browser-supplied `Origin` header, which the
    // in-process / miniflare harness cannot produce faithfully.
    csrf: { mode: 'token' },
    headers: true
  },
  // TS-14「autoImports × components × i18n 三关同开」的集成验证需要三关是**显式**打开的，
  // 否则这条断言只是在验证默认值。两者本就是默认 true，显式写出不改变行为。
  autoImports: true,
  components: true
};
