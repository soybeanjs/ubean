/**
 * `createApp()` 的 hydrate 判据。
 *
 * `ssr: false` 时服务端仍下发 `__UBEAN_PAGE_DATA__`，但 `#app` 是空的。
 * 只按 `initialPage` 判断会水合空容器，Vue 报
 * "Attempting to hydrate existing markup but container is empty"。
 */
import { describe, it, expect } from 'vitest';
import { createVueAppEntryVirtualModule } from '../src/vue-virtual-modules';

describe('createVueAppEntryVirtualModule — hydrate 判据', () => {
  it('hydrate 同时要求 initialPage 与容器内已有 SSR 标记', async () => {
    const code = await createVueAppEntryVirtualModule().load();
    expect(code).toContain('hydrate: !!initialPage && _hasSsrMarkup(config.rootId)');
    expect(code).toContain('data-ubean-ssr');
  });
});
