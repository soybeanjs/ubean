import { definePage } from 'ubean/client';

// iframe 文档页：组件借 `IframeUrl`，地址栏里只有 `/docs/a`，目标 URL 写在 meta 里。
// `ubean.config.ts` 的 `routing.onPages` 读 `meta.iframeUrl`，把它变成路由的静态 `props`。
definePage({
  reuse: 'IframeUrl',
  meta: { title: 'Doc A', iframeUrl: 'https://example.com/' }
});
