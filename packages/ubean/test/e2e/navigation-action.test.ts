import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { defineComponent, h } from 'vue';
import { startDevServer } from '../../src/core/dev/server';
import type { DevServer } from '../../src/core/dev/server';
import { createVueRenderer } from '../../src/core/vue/renderer';
import { createUbeanApp } from '../../src/runtime/app';
import {
  renderPage,
  pageJsonResponse,
  isPagesRequest,
  PAGE_REQUEST_HEADER,
  PAGE_DATA_ID
} from '../../src/runtime/pages/protocol';
import type { PageObject, PageRenderer } from '../../src/runtime/pages/protocol';

function createTestRenderer(
  pageComponents: Record<string, any>,
  layoutComponents: Record<string, any> = {}
): PageRenderer {
  return createVueRenderer({
    resolvePageComponent: async (name: string) => pageComponents[name] || null,
    resolveLayoutComponent: async (name: string | false | null) => {
      if (!name || name === false) return null;
      return layoutComponents[name] || null;
    },
    defaultLayout: null
  });
}

describe('E2E: Full navigation and action protocol over HTTP', () => {
  let server: DevServer;
  let baseUrl: string;

  const HomePage = defineComponent({
    name: 'HomePage',
    props: { message: { type: String, default: '' } },
    render() {
      return h('div', { class: 'home-page' }, [h('h1', 'Home'), h('p', (this as any).message || 'Welcome')]);
    }
  });

  const AboutPage = defineComponent({
    name: 'AboutPage',
    render() {
      return h('div', { class: 'about-page' }, [h('h1', 'About'), h('p', 'About us page')]);
    }
  });

  const LoginPage = defineComponent({
    name: 'LoginPage',
    props: { error: { type: String, default: '' } },
    render() {
      return h('div', { class: 'login-page' }, [
        h('h1', 'Login'),
        (this as any).error ? h('p', { class: 'error' }, (this as any).error) : null
      ]);
    }
  });

  const DashboardPage = defineComponent({
    name: 'DashboardPage',
    props: { username: { type: String, default: '' } },
    render() {
      return h('div', { class: 'dashboard' }, [h('h1', `Dashboard: ${(this as any).username || ''}`)]);
    }
  });

  beforeAll(async () => {
    const app = createUbeanApp({ devtools: false });

    const renderer = createTestRenderer({
      'pages/index.vue': HomePage,
      'pages/about.vue': AboutPage,
      'pages/login.vue': LoginPage,
      'pages/dashboard.vue': DashboardPage
    });

    app.hono.get('/', async c => {
      const pageObj: PageObject = {
        component: 'pages/index.vue',
        props: { message: 'Hello E2E' },
        params: {},
        url: '/',
        head: { title: 'Home' }
      };
      if (isPagesRequest(c)) {
        return pageJsonResponse(pageObj);
      }
      return c.html(await renderPage(pageObj, {}, renderer));
    });

    app.hono.get('/about', async c => {
      const pageObj: PageObject = {
        component: 'pages/about.vue',
        props: {},
        params: {},
        url: '/about',
        head: { title: 'About' }
      };
      if (isPagesRequest(c)) {
        return pageJsonResponse(pageObj);
      }
      return c.html(await renderPage(pageObj, {}, renderer));
    });

    app.hono.get('/login', async c => {
      const pageObj: PageObject = {
        component: 'pages/login.vue',
        props: {},
        params: {},
        url: '/login',
        head: { title: 'Login' }
      };
      if (isPagesRequest(c)) {
        return pageJsonResponse(pageObj);
      }
      return c.html(await renderPage(pageObj, {}, renderer));
    });

    app.hono.post('/api/login', async c => {
      const body = await c.req.parseBody();
      if (body.username === 'admin' && body.password === 'secret') {
        if (isPagesRequest(c)) {
          return new Response(null, {
            status: 204,
            headers: {
              'X-UbeanRedirect': '/dashboard',
              'X-UbeanRedirect-Status': '302'
            }
          });
        }
        return c.redirect('/dashboard');
      }
      const pageObj: PageObject = {
        component: 'pages/login.vue',
        props: { error: 'Invalid credentials' },
        params: {},
        url: '/login',
        errors: { form: 'Invalid credentials' }
      };
      if (isPagesRequest(c)) {
        return pageJsonResponse(pageObj, { 'X-UbeanError': 'true' });
      }
      return c.html(await renderPage(pageObj, {}, renderer), 400);
    });

    app.hono.get('/dashboard', async c => {
      const pageObj: PageObject = {
        component: 'pages/dashboard.vue',
        props: { username: 'admin' },
        params: {},
        url: '/dashboard',
        head: { title: 'Dashboard' }
      };
      if (isPagesRequest(c)) {
        return pageJsonResponse(pageObj);
      }
      return c.html(await renderPage(pageObj, {}, renderer));
    });

    await app.init();

    server = await startDevServer({
      port: 0,
      app,
      host: '127.0.0.1'
    });

    baseUrl = `http://127.0.0.1:${server.port}`;
  }, 30000);

  afterAll(async () => {
    await server?.close();
  });

  describe('SSR HTML responses', () => {
    it('returns complete HTML document with doctype for initial page load', async () => {
      const res = await fetch(`${baseUrl}/`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
      const html = await res.text();
      expect(html).toContain('<!doctype html>');
      expect(html).toContain('<html');
      expect(html).toContain('</html>');
    });

    it('renders page component content in SSR HTML', async () => {
      const res = await fetch(`${baseUrl}/`);
      const html = await res.text();
      expect(html).toContain('Hello E2E');
      expect(html).toContain('class="home-page"');
    });

    it('includes page data script for hydration', async () => {
      const res = await fetch(`${baseUrl}/`);
      const html = await res.text();
      expect(html).toContain(`id="${PAGE_DATA_ID}"`);
      expect(html).toContain('application/json');
    });

    it('renders head tags including title', async () => {
      const res = await fetch(`${baseUrl}/about`);
      const html = await res.text();
      expect(html).toContain('<title>About</title>');
      expect(html).toContain('About us page');
    });
  });

  describe('SPA navigation (x-ubeanpages requests)', () => {
    it('returns JSON with X-UbeanPages header for navigation requests', async () => {
      const res = await fetch(`${baseUrl}/about`, {
        headers: { [PAGE_REQUEST_HEADER]: 'true' }
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('x-ubeanpages')).toBe('true');
      expect(res.headers.get('content-type')).toContain('application/json');
    });

    it('JSON response contains page component and props', async () => {
      const res = await fetch(`${baseUrl}/`, {
        headers: { [PAGE_REQUEST_HEADER]: 'true' }
      });
      const data = await res.json();
      expect(data.component).toBe('pages/index.vue');
      expect(data.props.message).toBe('Hello E2E');
      expect(data.url).toBe('/');
      expect(data.head.title).toBe('Home');
    });

    it('navigates between pages using JSON responses', async () => {
      const homeRes = await fetch(`${baseUrl}/`, {
        headers: { [PAGE_REQUEST_HEADER]: 'true' }
      });
      const homeData = await homeRes.json();
      expect(homeData.component).toBe('pages/index.vue');

      const aboutRes = await fetch(`${baseUrl}/about`, {
        headers: { [PAGE_REQUEST_HEADER]: 'true' }
      });
      const aboutData = await aboutRes.json();
      expect(aboutData.component).toBe('pages/about.vue');
      expect(aboutData.head.title).toBe('About');
    });
  });

  describe('Action form submission', () => {
    it('returns X-UbeanRedirect header for SPA form submission', async () => {
      const formData = new URLSearchParams();
      formData.append('username', 'admin');
      formData.append('password', 'secret');

      const res = await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          [PAGE_REQUEST_HEADER]: 'true'
        },
        redirect: 'manual'
      });
      expect(res.status).toBe(204);
      expect(res.headers.get('x-ubeanredirect')).toBe('/dashboard');
      expect(res.headers.get('x-ubeanredirect-status')).toBe('302');
    });

    it('returns X-UbeanError with validation errors for failed login', async () => {
      const formData = new URLSearchParams();
      formData.append('username', 'admin');
      formData.append('password', 'wrong');

      const res = await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          [PAGE_REQUEST_HEADER]: 'true'
        }
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('x-ubeanerror')).toBe('true');
      const data = await res.json();
      expect(data.errors.form).toBe('Invalid credentials');
      expect(data.props.error).toBe('Invalid credentials');
    });
  });

  describe('Error handling and security', () => {
    it('safely serializes JSON to prevent XSS in page data', async () => {
      const xssRenderer = createTestRenderer({
        'pages/xss.vue': defineComponent({
          name: 'XssPage',
          render() {
            return h('div', 'test');
          }
        })
      });

      const xssApp = createUbeanApp({ devtools: false });
      xssApp.hono.get('/xss', async c => {
        const pageObj: PageObject = {
          component: 'pages/xss.vue',
          props: {
            payload: '</script><script>alert("xss")</script>'
          },
          params: {},
          url: '/xss'
        };
        if (isPagesRequest(c)) {
          return pageJsonResponse(pageObj);
        }
        return c.html(await renderPage(pageObj, {}, xssRenderer));
      });
      await xssApp.init();

      const xssServer = await startDevServer({
        port: 0,
        app: xssApp,
        host: '127.0.0.1'
      });

      try {
        const htmlRes = await fetch(`http://127.0.0.1:${xssServer.port}/xss`);
        const html = await htmlRes.text();
        expect(html).not.toContain('</script><script>');
        expect(html).toContain('\\u003c/script\\u003e');

        const jsonRes = await fetch(`http://127.0.0.1:${xssServer.port}/xss`, {
          headers: { [PAGE_REQUEST_HEADER]: 'true' }
        });
        const jsonText = await jsonRes.text();
        expect(jsonText).not.toContain('</script><script>');
      } finally {
        await xssServer.close();
      }
    });

    it('returns 404 for non-existent routes', async () => {
      const res = await fetch(`${baseUrl}/non-existent-page`);
      expect(res.status).toBe(404);
    });
  });

  describe('Full navigation flow simulation', () => {
    it('simulates complete SPA navigation flow: Home → About → Login → Dashboard', async () => {
      const homeRes = await fetch(`${baseUrl}/`);
      expect(homeRes.status).toBe(200);
      const homeHtml = await homeRes.text();
      expect(homeHtml).toContain('Home');

      const aboutRes = await fetch(`${baseUrl}/about`, {
        headers: { [PAGE_REQUEST_HEADER]: 'true' }
      });
      expect(aboutRes.status).toBe(200);
      const aboutData = await aboutRes.json();
      expect(aboutData.component).toBe('pages/about.vue');

      const loginForm = new URLSearchParams();
      loginForm.append('username', 'admin');
      loginForm.append('password', 'secret');

      const loginRes = await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        body: loginForm,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          [PAGE_REQUEST_HEADER]: 'true'
        },
        redirect: 'manual'
      });
      expect(loginRes.status).toBe(204);
      expect(loginRes.headers.get('x-ubeanredirect')).toBe('/dashboard');

      const dashboardRes = await fetch(`${baseUrl}/dashboard`, {
        headers: { [PAGE_REQUEST_HEADER]: 'true' }
      });
      expect(dashboardRes.status).toBe(200);
      const dashboardData = await dashboardRes.json();
      expect(dashboardData.component).toBe('pages/dashboard.vue');
      expect(dashboardData.props.username).toBe('admin');

      const dashboardHtml = await fetch(`${baseUrl}/dashboard`);
      const dashboardHtmlText = await dashboardHtml.text();
      expect(dashboardHtmlText).toContain('Dashboard: admin');
    });
  });
});
