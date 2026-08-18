# client-only-spa · 独立使用 ubean 客户端内核

演示**不依赖 ubean 全栈框架**、只用 `@ubean/client` 内核构建纯 SPA:

- 依赖仅 `@ubean/client` + `vue`/`vue-router`(peer) —— 不安装 `ubean` 聚合包
- 无 SSR / server entry / API 路由 / CLI(`ubean dev|build` 一概不用,纯 `vite`)
- 构建侧唯一来自内核的是 `@ubean/client/vite` 的 `ubeanClientPlugin`(仅注册 auto-import 预设)

## 与全栈 ubean 的差异

| 能力         | 全栈 ubean                           | 本示例(独立 SPA)                       |
| ------------ | ------------------------------------ | -------------------------------------- |
| 路由来源     | 文件系统扫描(`src/pages/`)+ 虚拟模块 | 手写 `src/routes.ts`                   |
| 页面缓存声明 | `definePage({ cache: true })` 宏     | 路由 `meta: { pageName, cache: true }` |
| 布局解析     | `layouts/` 目录自动扫描              | `resolveLayoutComponent` 回调          |
| i18n 注册    | `locales/` 扫描 + SSR 注入           | `main.ts` 手动 `defineLocale()`        |
| 应用工厂     | 框架虚拟模块调用                     | `createUbeanClientApp()` 直接调用      |
| SFC 编译     | `ubeanVite` 内置                     | 应用自带 `@vitejs/plugin-vue`          |

运行时行为完全一致:`PageView` 的 keep-alive/过渡/reload 协议、`Link` 组件、
页面缓存 API、i18n 响应式、色彩模式均来自同一份 `@ubean/client` 实现。

## 运行

```bash
pnpm dev       # 开发
pnpm build     # 产物构建(dist/,纯静态)
pnpm preview   # 预览构建产物
pnpm test      # 功能正确性单测(19 用例)
pnpm type-check
```

## 页面导览

- `/` 首页 —— 色彩模式(toggle/light/dark)+ 内核能力清单
- `/cache-demo` —— keep-alive 页面缓存:count 状态在导航往返中保留;
  `disablePageCache` 后重建、`resetRouteCache` 原地强制重挂载
- `/about` —— `reload.reload(name)` 重载信号 + 全局过渡名切换 + 外部链接 `Link`

## 验证记录(2026-08-17)

- `vp build` ✅ 主包 140KB / gzip 53KB;`dist` 零 `node:` 导入
- `vitest` ✅ 19 用例(工厂/渲染协议/缓存控制/过渡重载/i18n 响应式/路由纯函数/依赖纯净度)
- 真实浏览器回归 ✅ 首页渲染 / SPA 无刷新导航 / reload 计数 / keep-alive
  保留与失效 / i18n 双向即时切换 / 控制台零新增错误
- 过程中修复内核缺陷:`t()`/`localizePath()` 缺响应式依赖导致 locale 切换后文案不更新
  (现经 `trackLocale()` 建立 `localeRef` 依赖,含单测回归)
