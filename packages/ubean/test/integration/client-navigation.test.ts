import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import { createVueRenderer } from '../../src/core/vue/renderer';
import { createUbeanApp } from '../../src/runtime/app';
import {
  renderPage,
  pageJsonResponse,
  isPagesRequest,
  PAGE_REQUEST_HEADER,
  PAGE_DATA_ID
} from '../../src/runtime/pages/protocol';
import type { PageObject } from '../../src/runtime/pages/protocol';
import { redirect } from '../../src/runtime/response';

function createTestRenderer(pageComponents: Record<string, any>, layoutComponents: Record<string, any> = {}) {
  return createVueRenderer({
    resolvePageComponent: async (name: string) => pageComponents[name] || null,
    resolveLayoutComponent: async (name: string | false | null) => {
      if (!name || name === false) return null;
      return layoutComponents[name] || null;
    },
    defaultLayout: null
  });
}

describe('Integration: Client navigation protocol', () => {
  it('returns JSON page data when x-ubeanpages header is present', async () => {
    const PageComp = defineComponent({
      name: 'AboutPage',
      props: { title: { type: String, default: '' } },
      render() {
        return h('div', { class: 'about' }, [h('h1', (this as any).title || 'About'), h('p', 'About page content')]);
      }
    });

    const renderer = createTestRenderer({ 'pages/about.vue': PageComp });

    const pageObj: PageObject = {
      component: 'pages/about.vue',
      props: { title: 'About Us' },
      params: {},
      url: '/about',
      head: { title: 'About Us' }
    };

    const html = await renderPage(pageObj, {}, renderer);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('About page content');
    expect(html).toContain('<title>About Us</title>');
    expect(html).toContain(`id="${PAGE_DATA_ID}"`);

    const jsonResponse = pageJsonResponse(pageObj);
    expect(jsonResponse.headers.get('X-UbeanPages')).toBe('true');
    const data = await jsonResponse.json();
    expect(data.component).toBe('pages/about.vue');
    expect(data.props).toEqual({ title: 'About Us' });
    expect(data.url).toBe('/about');
    expect(data.head.title).toBe('About Us');
  });

  it('returns JSON error data for navigation to error pages', async () => {
    const app = createUbeanApp();

    app.hono.get('/protected', async c => {
      const pageObj: PageObject = {
        component: 'pages/error.vue',
        props: { statusCode: 403, message: 'Forbidden' },
        params: {},
        url: '/protected',
        errors: { statusCode: '403', message: 'Forbidden' }
      };
      if (isPagesRequest(c)) {
        return pageJsonResponse(pageObj, { 'X-UbeanError': 'true' });
      }
      return c.json(pageObj, 403);
    });

    const jsonRes = await app.fetch(
      new Request('http://localhost/protected', {
        headers: { [PAGE_REQUEST_HEADER]: 'true' }
      })
    );
    expect(jsonRes.status).toBe(200);
    const data = await jsonRes.json();
    expect(data.errors).toBeTruthy();
    expect(data.errors.statusCode).toBe('403');
  });

  it('SSR HTML contains page data script for hydration', async () => {
    const HomeComp = defineComponent({
      name: 'HomePage',
      props: { msg: { type: String, default: '' } },
      render() {
        return h('div', { class: 'home' }, (this as any).msg || 'Home');
      }
    });

    const renderer = createTestRenderer({ 'pages/index.vue': HomeComp });

    const pageObj: PageObject = {
      component: 'pages/index.vue',
      props: { msg: 'Welcome' },
      params: {},
      url: '/',
      head: { title: 'Home' }
    };

    const html = await renderPage(pageObj, {}, renderer);
    expect(html).toContain('<title>Home</title>');
    expect(html).toContain('Welcome');
    expect(html).toContain(`<script id="${PAGE_DATA_ID}"`);
    expect(html).toContain('application/json');
  });
});

describe('Integration: Action form submission protocol', () => {
  it('handles POST action returning redirect response', async () => {
    const app = createUbeanApp();

    app.hono.post('/api/login', async c => {
      const body = await c.req.parseBody();
      if (body.username === 'admin' && body.password === 'secret') {
        return redirect('/dashboard');
      }
      const pageObj: PageObject = {
        component: 'pages/login.vue',
        props: { error: 'Invalid credentials' },
        params: {},
        url: '/login',
        errors: { form: 'Invalid credentials' }
      };
      return pageJsonResponse(pageObj, { 'X-UbeanError': 'true' });
    });

    const successRes = await app.fetch(
      new Request('http://localhost/api/login', {
        method: 'POST',
        body: new URLSearchParams({ username: 'admin', password: 'secret' }),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        redirect: 'manual'
      })
    );
    expect(successRes.status).toBe(302);
    expect(successRes.headers.get('Location')).toBe('/dashboard');

    const failRes = await app.fetch(
      new Request('http://localhost/api/login', {
        method: 'POST',
        body: new URLSearchParams({ username: 'admin', password: 'wrong' }),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          [PAGE_REQUEST_HEADER]: 'true'
        }
      })
    );
    expect(failRes.status).toBe(200);
    expect(failRes.headers.get('X-UbeanError')).toBe('true');
    const data = await failRes.json();
    expect(data.errors.form).toBe('Invalid credentials');
  });

  it('handles JSON POST action with validation errors', async () => {
    const app = createUbeanApp();

    app.hono.post('/api/posts', async c => {
      const body = await c.req.json();
      const errors: Record<string, string> = {};
      if (!body.title) errors.title = 'Title is required';
      if (!body.content || body.content.length < 10) errors.content = 'Content must be at least 10 characters';

      if (Object.keys(errors).length > 0) {
        const pageObj: PageObject = {
          component: 'pages/new-post.vue',
          props: { form: body, errors },
          params: {},
          url: '/posts/new',
          errors
        };
        return pageJsonResponse(pageObj, { 'X-UbeanError': 'true' });
      }

      return redirect('/posts/1');
    });

    const res = await app.fetch(
      new Request('http://localhost/api/posts', {
        method: 'POST',
        body: JSON.stringify({ title: '', content: 'short' }),
        headers: {
          'Content-Type': 'application/json',
          [PAGE_REQUEST_HEADER]: 'true'
        }
      })
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('X-UbeanError')).toBe('true');
    const data = await res.json();
    expect(data.errors.title).toBe('Title is required');
    expect(data.errors.content).toBe('Content must be at least 10 characters');
  });

  it('action redirect includes X-UbeanRedirect header for SPA navigation', async () => {
    const app = createUbeanApp();

    app.hono.post('/api/logout', async c => {
      if (isPagesRequest(c)) {
        return new Response(null, {
          status: 204,
          headers: {
            'X-UbeanRedirect': '/',
            'X-UbeanRedirect-Status': '302'
          }
        });
      }
      return redirect('/');
    });

    const spaRes = await app.fetch(
      new Request('http://localhost/api/logout', {
        method: 'POST',
        headers: { [PAGE_REQUEST_HEADER]: 'true' },
        redirect: 'manual'
      })
    );
    expect(spaRes.status).toBe(204);
    expect(spaRes.headers.get('X-UbeanRedirect')).toBe('/');

    const normalRes = await app.fetch(
      new Request('http://localhost/api/logout', {
        method: 'POST',
        redirect: 'manual'
      })
    );
    expect(normalRes.status).toBe(302);
    expect(normalRes.headers.get('Location')).toBe('/');
  });
});

describe('Integration: Dynamic route parameters in pages', () => {
  it('passes dynamic route params in page object for SSR and JSON', async () => {
    const UserPage = defineComponent({
      name: 'UserPage',
      props: { id: { type: String, default: '' } },
      render() {
        return h('div', { class: 'user-profile' }, [h('h1', `User ${(this as any).id}`)]);
      }
    });

    const renderer = createTestRenderer({ 'pages/users/[id].vue': UserPage });

    const pageObj: PageObject = {
      component: 'pages/users/[id].vue',
      props: { id: '42' },
      params: { id: '42' },
      url: '/users/42'
    };

    const html = await renderPage(pageObj, {}, renderer);
    expect(html).toContain('User 42');

    const jsonResponse = pageJsonResponse(pageObj);
    const data = await jsonResponse.json();
    expect(data.params).toEqual({ id: '42' });
    expect(data.props).toEqual({ id: '42' });
  });
});

describe('Integration: Page data serialization safety', () => {
  it('pageJsonResponse escapes HTML in serialized data to prevent XSS', async () => {
    const pageObj: PageObject = {
      component: 'pages/test.vue',
      props: {
        userInput: '</script><script>alert("xss")</script>'
      },
      params: {},
      url: '/test'
    };

    const response = pageJsonResponse(pageObj);
    const text = await response.text();
    expect(text).not.toContain('</script><script>');
    expect(text).toContain('\\u003c/script\\u003e');
  });

  it('serializes nested objects and arrays in props correctly', async () => {
    const pageObj: PageObject = {
      component: 'pages/list.vue',
      props: {
        items: [
          { id: 1, name: 'A' },
          { id: 2, name: 'B' }
        ],
        meta: { total: 2, page: 1 },
        nullable: null,
        bool: true
      },
      params: { category: 'news' },
      url: '/list'
    };

    const response = pageJsonResponse(pageObj);
    const data = await response.json();
    expect(data.props.items).toHaveLength(2);
    expect(data.props.items[0]).toEqual({ id: 1, name: 'A' });
    expect(data.props.meta.total).toBe(2);
    expect(data.props.nullable).toBeNull();
    expect(data.props.bool).toBe(true);
  });
});

describe('Integration: Full page navigation flow (server-side)', () => {
  it('renders both SSR HTML and JSON page data for navigation flow', async () => {
    const HomeComp = defineComponent({
      name: 'HomePage',
      render() {
        return h('div', { class: 'home' }, 'Home Page');
      }
    });

    const AboutComp = defineComponent({
      name: 'AboutPage',
      render() {
        return h('div', { class: 'about' }, 'About Page');
      }
    });

    const renderer = createTestRenderer({
      'pages/index.vue': HomeComp,
      'pages/about.vue': AboutComp
    });

    const homeObj: PageObject = {
      component: 'pages/index.vue',
      props: {},
      params: {},
      url: '/',
      head: { title: 'Home' }
    };

    const aboutObj: PageObject = {
      component: 'pages/about.vue',
      props: {},
      params: {},
      url: '/about',
      head: { title: 'About' }
    };

    const homeHtml = await renderPage(homeObj, {}, renderer);
    expect(homeHtml).toContain('Home Page');
    expect(homeHtml).toContain('<title>Home</title>');

    const aboutJson = await pageJsonResponse(aboutObj).json();
    expect(aboutJson.component).toBe('pages/about.vue');
    expect(aboutJson.head.title).toBe('About');

    const aboutHtml = await renderPage(aboutObj, {}, renderer);
    expect(aboutHtml).toContain('About Page');
    expect(aboutHtml).toContain('<title>About</title>');
  });

  it('layout wrapping works with JSON and HTML responses', async () => {
    const PageComp = defineComponent({
      name: 'DashPage',
      render() {
        return h('main', 'Dashboard Content');
      }
    });

    const LayoutComp = defineComponent({
      name: 'DefaultLayout',
      props: { page: Object, layoutName: String },
      render() {
        return h('div', { class: 'layout' }, [h('header', 'Header'), h('main', (this as any).$slots.default?.())]);
      }
    });

    const renderer = createTestRenderer({ 'pages/dashboard.vue': PageComp }, { default: LayoutComp });

    const pageObj: PageObject = {
      component: 'pages/dashboard.vue',
      props: {},
      params: {},
      url: '/dashboard',
      layout: 'default',
      head: { title: 'Dashboard' }
    };

    const html = await renderPage(pageObj, {}, renderer);
    expect(html).toContain('Dashboard Content');
    expect(html).toContain('Header');
    expect(html).toContain('class="layout"');

    const json = await pageJsonResponse(pageObj).json();
    expect(json.layout).toBe('default');
    expect(json.url).toBe('/dashboard');
  });
});
