// `definePage` 在 `ubean/client` 与主入口都导出；客户端图统一用前者（主入口是聚合 barrel，
// 从它导入会把整条链带进产物 —— 见 AGENTS §8 与 cli/test/example-imports.test.ts）
import { definePage } from 'ubean/client';

// Reuse route: register /about-alias that reuses the About page component.
// The component loader is shared with the target page — no separate .vue file needed.
definePage({
  reuse: 'About',
  path: '/about-alias'
});
