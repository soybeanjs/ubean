/**
 * P9-18: Parallel Routes / Intercepting Routes — virtual module tests
 *
 * Verifies that `createVuePagesVirtualModule` correctly:
 * - Groups parallel routes by path into Vue Router named views (`components`)
 * - Registers intercepting routes with `__intercept_` name prefix
 * - Includes slot/intercept metadata in route meta
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

describe('P9-18: createVuePagesVirtualModule — intercepting routes', () => {
  it('registers intercepting routes with __intercept_ prefix', () => {
    const interceptPage = makePage({
      name: 'PhotoId',
      route: '/photo/[id]',
      fullPath: '/src/pages/(..)photo/[id].vue',
      interceptFrom: '/',
      interceptTarget: 'photo'
    });
    const mod = createVuePagesVirtualModule([interceptPage], []);
    const code = mod.load();
    expect(code).toContain('"__intercept_PhotoId"');
    expect(code).toContain('"interceptFrom":"/"');
    expect(code).toContain('"interceptTarget":"photo"');
    expect(code).toContain('"isIntercepting":true');
  });

  it('keeps intercepting routes separate from regular routes', () => {
    const regularPage = makePage({
      name: 'PhotoId',
      route: '/photo/[id]',
      fullPath: '/src/pages/photo/[id].vue'
    });
    const interceptPage = makePage({
      name: 'PhotoIdIntercept',
      route: '/photo/[id]',
      fullPath: '/src/pages/(..)photo/[id].vue',
      interceptFrom: '/',
      interceptTarget: 'photo'
    });
    const mod = createVuePagesVirtualModule([regularPage, interceptPage], []);
    const code = mod.load();
    // Regular route uses the original name
    expect(code).toContain('name: "PhotoId"');
    // Intercept route uses the __intercept_ prefix
    expect(code).toContain('name: "__intercept_PhotoIdIntercept"');
  });

  it('includes intercept metadata in route meta', () => {
    const interceptPage = makePage({
      name: 'UserIntercept',
      route: '/user/[id]',
      fullPath: '/src/pages/(..)user/[id].vue',
      interceptFrom: '/dashboard',
      interceptTarget: 'user'
    });
    const mod = createVuePagesVirtualModule([interceptPage], []);
    const code = mod.load();
    expect(code).toContain('"interceptFrom":"/dashboard"');
    expect(code).toContain('"interceptTarget":"user"');
  });
});

describe('P9-18: createVuePagesVirtualModule — mixed scenarios', () => {
  it('handles parallel + intercept routes together', () => {
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
    const interceptPage = makePage({
      name: 'SettingsIntercept',
      route: '/settings',
      fullPath: '/src/pages/(..)settings.vue',
      interceptFrom: '/dashboard',
      interceptTarget: 'settings'
    });
    const mod = createVuePagesVirtualModule([defaultPage, modalSlot, interceptPage], []);
    const code = mod.load();
    // Parallel route grouped into named views
    expect(code).toContain('components: { default: Page_Dashboard, "modal": Page_DashboardModal }');
    // Intercept route registered separately
    expect(code).toContain('"__intercept_SettingsIntercept"');
  });

  it('includes page loaders for all pages including slots and intercepts', () => {
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
    const interceptPage = makePage({
      name: 'AboutIntercept',
      route: '/about',
      fullPath: '/src/pages/(..)about.vue',
      interceptFrom: '/',
      interceptTarget: 'about'
    });
    const mod = createVuePagesVirtualModule([defaultPage, slotPage, interceptPage], []);
    const code = mod.load();
    expect(code).toContain('import("/src/pages/index.vue")');
    expect(code).toContain('import("/src/pages/@modal/index.vue")');
    expect(code).toContain('import("/src/pages/(..)about.vue")');
  });
});
