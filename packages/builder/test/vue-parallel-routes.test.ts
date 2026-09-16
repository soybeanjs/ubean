/**
 * P9-18: Parallel Routes — virtual module tests
 *
 * Verifies that `createVuePagesVirtualModule` correctly:
 * - Groups parallel routes by path into Vue Router named views (`components`)
 * - Includes slot metadata in route meta (`parallelSlots` / `slot` page loaders)
 *
 * 拦截路由（`(.)` / `(..)` / `(...)`）已随 [docs/adr/0010] 的刻意不做清单移除：扫描器现在直接
 * 拒绝标记段（`packages/vue/test/parallel-routes.test.ts` 守着），因此这里不再有 `__intercept_*`
 * 路由的生成断言。
 */
import { describe, it, expect } from 'vitest';
import type { ScannedPageRoute } from '@ubean/scan';
import { createVuePagesVirtualModule } from '../src/vue-virtual-modules';

function makePage(overrides: Partial<ScannedPageRoute> = {}): ScannedPageRoute {
  return {
    name: 'test',
    route: '/test',
    path: '/test',
    fullPath: '/src/pages/test.vue',
    relativePath: 'test.vue',
    dirname: '.',
    basename: 'test.vue',
    isReuse: false,
    isMarkdown: false,
    ...overrides
  };
}

describe('P9-18: createVuePagesVirtualModule — parallel routes', () => {
  it('groups parallel routes into named views (components)', () => {
    const defaultPage = makePage({
      name: 'Dashboard',
      route: '/dashboard',
      fullPath: '/src/pages/dashboard.vue'
    });
    const slotPage = makePage({
      name: 'DashboardAnalytics',
      route: '/dashboard',
      fullPath: '/src/pages/@analytics/dashboard.vue',
      slot: 'analytics'
    });
    const mod = createVuePagesVirtualModule([defaultPage, slotPage], []);
    const code = mod.load();
    // Should use `components` (plural) with named views
    expect(code).toContain('components: { default: Page_Dashboard, "analytics": Page_DashboardAnalytics }');
    expect(code).toContain('"parallelSlots":["analytics"]');
  });

  it('groups multiple slots into named views', () => {
    const defaultPage = makePage({
      name: 'Dashboard',
      route: '/dashboard',
      fullPath: '/src/pages/dashboard.vue'
    });
    const modalSlot = makePage({
      name: 'DashboardModal',
      route: '/dashboard',
      fullPath: '/src/pages/@modal/dashboard.vue',
      slot: 'modal'
    });
    const sidebarSlot = makePage({
      name: 'DashboardSidebar',
      route: '/dashboard',
      fullPath: '/src/pages/@sidebar/dashboard.vue',
      slot: 'sidebar'
    });
    const mod = createVuePagesVirtualModule([defaultPage, modalSlot, sidebarSlot], []);
    const code = mod.load();
    expect(code).toContain('default: Page_Dashboard');
    expect(code).toContain('"modal": Page_DashboardModal');
    expect(code).toContain('"sidebar": Page_DashboardSidebar');
    expect(code).toContain('"parallelSlots":["modal","sidebar"]');
  });

  it('uses component (singular) for regular routes without slots', () => {
    const page = makePage({
      name: 'About',
      route: '/about',
      fullPath: '/src/pages/about.vue'
    });
    const mod = createVuePagesVirtualModule([page], []);
    const code = mod.load();
    expect(code).toContain('component: Page_About');
    expect(code).not.toContain('components: {');
  });

  it('handles slot-only route (no default page)', () => {
    const slotPage = makePage({
      name: 'DashboardModal',
      route: '/dashboard',
      fullPath: '/src/pages/@modal/dashboard.vue',
      slot: 'modal'
    });
    const mod = createVuePagesVirtualModule([slotPage], []);
    const code = mod.load();
    // Should still register the route with the slot as a named view
    expect(code).toContain('"modal": Page_DashboardModal');
  });
});

describe('P9-18: createVuePagesVirtualModule — mixed scenarios', () => {
  it('groups parallel routes into named views（单条路由记录）', () => {
    const defaultPage = makePage({
      name: 'Dashboard',
      route: '/dashboard',
      fullPath: '/src/pages/dashboard.vue'
    });
    const modalSlot = makePage({
      name: 'DashboardModal',
      route: '/dashboard',
      fullPath: '/src/pages/@modal/dashboard.vue',
      slot: 'modal'
    });
    const mod = createVuePagesVirtualModule([defaultPage, modalSlot], []);
    const code = mod.load();
    // Parallel route grouped into named views
    expect(code).toContain('components: { default: Page_Dashboard, "modal": Page_DashboardModal }');
    // 不再有被单独注册的拦截路由（`__intercept_` 前缀随约定一起移除）
    expect(code).not.toContain('__intercept_');
  });

  it('includes page loaders for all pages including slots', () => {
    const defaultPage = makePage({
      name: 'Home',
      route: '/',
      fullPath: '/src/pages/index.vue'
    });
    const slotPage = makePage({
      name: 'HomeModal',
      route: '/',
      fullPath: '/src/pages/@modal/index.vue',
      slot: 'modal'
    });
    const mod = createVuePagesVirtualModule([defaultPage, slotPage], []);
    const code = mod.load();
    expect(code).toContain('import("/src/pages/index.vue")');
    expect(code).toContain('import("/src/pages/@modal/index.vue")');
  });
});
