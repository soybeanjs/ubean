import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import type { VNode } from 'vue';
import { createVueRenderer } from '../../src/core/vue/renderer';
import type { PageObject } from '../../src/runtime/pages/protocol';

function createTestComponent(template: string, setup?: () => Record<string, any>) {
  return defineComponent({
    name: 'TestPage',
    setup,
    render() {
      return h('div', { class: 'page-content', 'data-testid': 'page' }, [h('h1', template)]);
    }
  });
}

describe('Integration: Vue SSR rendering', () => {
  it('renders a simple page component to HTML string', async () => {
    const PageComp = defineComponent({
      name: 'HomePage',
      render() {
        return h('div', { class: 'home' }, [h('h1', 'Welcome'), h('p', 'This is the home page')]);
      }
    });

    const renderer = createVueRenderer({
      resolvePageComponent: async () => PageComp,
      resolveLayoutComponent: async () => null
    });

    const pageObj: PageObject = {
      component: 'pages/index.vue',
      props: {},
      params: {},
      url: '/'
    };

    const html = await renderer.render(pageObj, '', {});
    expect(html).toContain('Welcome');
    expect(html).toContain('This is the home page');
    expect(html).toContain('class="home"');
  });

  it('renders page with props passed to component', async () => {
    const PageComp = defineComponent({
      name: 'UserPage',
      props: {
        userId: { type: String, required: true }
      },
      render(this: any) {
        return h('div', { class: 'user-page' }, [h('h1', `User: ${this.userId}`)]);
      }
    });

    const renderer = createVueRenderer({
      resolvePageComponent: async () => PageComp,
      resolveLayoutComponent: async () => null
    });

    const pageObj: PageObject = {
      component: 'pages/users/[id].vue',
      props: { userId: '123' },
      params: { id: '123' },
      url: '/users/123'
    };

    const html = await renderer.render(pageObj, '', {});
    expect(html).toContain('User: 123');
  });

  it('renders page wrapped in single layout', async () => {
    const PageComp = defineComponent({
      name: 'AboutPage',
      render() {
        return h('div', { class: 'about' }, 'About us');
      }
    });

    const DefaultLayout = defineComponent({
      name: 'DefaultLayout',
      props: {
        page: { type: Object, default: () => ({}) },
        layoutName: { type: String, default: '' }
      },
      render() {
        return h('div', { class: 'app-layout' }, [
          h('nav', 'Nav'),
          h('main', (this as { $slots: { default?: () => VNode[] } }).$slots.default?.()),
          h('footer', 'Footer')
        ]);
      }
    });

    const renderer = createVueRenderer({
      resolvePageComponent: async () => PageComp,
      resolveLayoutComponent: async name => {
        if (name === 'default') return DefaultLayout;
        return null;
      },
      defaultLayout: 'default'
    });

    const pageObj: PageObject = {
      component: 'pages/about.vue',
      props: {},
      params: {},
      url: '/about'
    };

    const html = await renderer.render(pageObj, '', {});
    expect(html).toContain('Nav');
    expect(html).toContain('About us');
    expect(html).toContain('Footer');
    expect(html).toContain('class="app-layout"');
  });

  it('renders nested layouts correctly', async () => {
    const PageComp = defineComponent({
      name: 'AdminPage',
      render() {
        return h('div', { class: 'admin-dashboard' }, 'Dashboard');
      }
    });

    const AdminLayout = defineComponent({
      name: 'AdminLayout',
      props: {
        page: { type: Object, default: () => ({}) },
        layoutName: { type: String, default: '' }
      },
      render() {
        return h('div', { class: 'admin-layout' }, [
          h('aside', 'Sidebar'),
          h('section', (this as { $slots: { default?: () => VNode[] } }).$slots.default?.())
        ]);
      }
    });

    const DefaultLayout = defineComponent({
      name: 'DefaultLayout',
      props: {
        page: { type: Object, default: () => ({}) },
        layoutName: { type: String, default: '' }
      },
      render() {
        return h('div', { class: 'default-layout' }, [
          h('header', 'Top Bar'),
          h('main', (this as { $slots: { default?: () => VNode[] } }).$slots.default?.())
        ]);
      }
    });

    const layoutMap: Record<string, any> = {
      default: DefaultLayout,
      admin: AdminLayout
    };

    const renderer = createVueRenderer({
      resolvePageComponent: async () => PageComp,
      resolveLayoutComponent: async name => layoutMap[name as string] || null,
      defaultLayout: 'default',
      resolveLayoutParent: (name: string) => {
        if (name === 'admin') return 'default';
        return null;
      }
    });

    const pageObj: PageObject = {
      component: 'pages/admin/dashboard.vue',
      props: {},
      params: {},
      url: '/admin/dashboard',
      layout: 'admin'
    };

    const html = await renderer.render(pageObj, '', {});
    expect(html).toContain('Top Bar');
    expect(html).toContain('Sidebar');
    expect(html).toContain('Dashboard');
    expect(html).toContain('class="default-layout"');
    expect(html).toContain('class="admin-layout"');
  });

  it('respects layout: false to render page without any layout', async () => {
    const PageComp = defineComponent({
      name: 'StandalonePage',
      render() {
        return h('div', { class: 'standalone' }, 'Standalone content');
      }
    });

    const DefaultLayout = defineComponent({
      name: 'DefaultLayout',
      render() {
        return h('div', { class: 'layout' }, (this as { $slots: { default?: () => VNode[] } }).$slots.default?.());
      }
    });

    const renderer = createVueRenderer({
      resolvePageComponent: async () => PageComp,
      resolveLayoutComponent: async name => {
        if (name === 'default') return DefaultLayout;
        return null;
      },
      defaultLayout: 'default'
    });

    const pageObj: PageObject = {
      component: 'pages/standalone.vue',
      props: {},
      params: {},
      url: '/standalone',
      layout: false
    };

    const html = await renderer.render(pageObj, '', {});
    expect(html).toContain('Standalone content');
    expect(html).not.toContain('class="layout"');
  });

  it('returns islands bootstrap script as preambleScript', () => {
    const renderer = createVueRenderer({
      resolvePageComponent: async () => createTestComponent('Test'),
      resolveLayoutComponent: async () => null
    });

    expect(renderer.preambleScript).toBeDefined();
    expect(typeof renderer.preambleScript).toBe('string');
    expect(renderer.preambleScript!.length).toBeGreaterThan(0);
  });

  it('handles components with reactive setup and data', async () => {
    const PageComp = defineComponent({
      name: 'ReactivePage',
      setup() {
        const items = ['apple', 'banana', 'cherry'];
        return () =>
          h(
            'ul',
            { class: 'fruit-list' },
            items.map((item, i) => h('li', { key: i }, item))
          );
      }
    });

    const renderer = createVueRenderer({
      resolvePageComponent: async () => PageComp,
      resolveLayoutComponent: async () => null
    });

    const pageObj: PageObject = {
      component: 'pages/fruits.vue',
      props: {},
      params: {},
      url: '/fruits'
    };

    const html = await renderer.render(pageObj, '', {});
    expect(html).toContain('apple');
    expect(html).toContain('banana');
    expect(html).toContain('cherry');
    expect(html).toContain('fruit-list');
  });

  it('handles dynamic route params in page object', async () => {
    const PageComp = defineComponent({
      name: 'ProductPage',
      props: {
        productId: { type: String },
        category: { type: String }
      },
      render(this: any) {
        return h('div', { class: 'product' }, [
          h('h1', `Product ${this.productId}`),
          h('span', { class: 'category' }, `Category: ${this.category}`)
        ]);
      }
    });

    const renderer = createVueRenderer({
      resolvePageComponent: async () => PageComp,
      resolveLayoutComponent: async () => null
    });

    const pageObj: PageObject = {
      component: 'pages/[category]/[productId].vue',
      props: { productId: 'p42', category: 'electronics' },
      params: { category: 'electronics', productId: 'p42' },
      url: '/electronics/p42'
    };

    const html = await renderer.render(pageObj, '', {});
    expect(html).toContain('Product p42');
    expect(html).toContain('Category: electronics');
  });
});
