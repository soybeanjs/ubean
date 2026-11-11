import { definePage } from 'ubean/client';

// 同 a.meta.ts：验证钩子对多条 `meta.iframeUrl` 都生效，不是硬编一条。
definePage({
  reuse: 'IframeUrl',
  meta: { title: 'Doc B', iframeUrl: 'https://vuejs.org/' }
});
