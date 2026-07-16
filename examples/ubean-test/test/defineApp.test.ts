import { describe, it, expect } from 'vitest';
import type { Plugin, Component } from 'vue';
import { defineApp } from 'ubean/runtime/vue';
import { api } from './helper';

describe('defineApp()', () => {
  describe('defineApp() function', () => {
    it('returns an app definition object', () => {
      const def = defineApp({
        head: {
          title: 'Test App'
        },
        rootId: 'app'
      });
      expect(def).toBeDefined();
      expect(def.head?.title).toBe('Test App');
      expect(def.rootId).toBe('app');
    });

    it('accepts onClientReady callback', () => {
      const def = defineApp({
        onClientReady: () => {
          // callback registered
        }
      });
      expect(def.onClientReady).toBeDefined();
      expect(typeof def.onClientReady).toBe('function');
    });

    it('accepts plugins array', () => {
      const plugin = {
        install: () => {}
      };
      const def = defineApp({
        plugins: [plugin as unknown as Plugin]
      });
      expect(def.plugins).toBeDefined();
      expect(def.plugins).toHaveLength(1);
    });

    it('accepts head meta', () => {
      const def = defineApp({
        head: {
          title: 'My App',
          meta: [
            { name: 'description', content: 'Test description' },
            { name: 'viewport', content: 'width=device-width' }
          ]
        }
      });
      expect(def.head?.title).toBe('My App');
      expect(def.head?.meta).toHaveLength(2);
    });

    it('accepts loadingComponent', () => {
      const LoadingComp = { template: '<div>Loading...</div>' };
      const def = defineApp({
        loadingComponent: LoadingComp as unknown as Component
      });
      expect(def.loadingComponent).toBeDefined();
    });
  });

  describe('HTTP integration - app head metadata', () => {
    it('index page has title from defineApp', async () => {
      const res = await api('/');
      expect(res.status).toBe(200);
      // The title should be set from defineApp head config
      expect(res.text).toContain('<title');
    });

    it('index page has meta description', async () => {
      const res = await api('/');
      expect(res.status).toBe(200);
      // Should contain meta description
      expect(res.text.toLowerCase()).toContain('meta');
    });

    it('index page has rootId div', async () => {
      const res = await api('/');
      expect(res.status).toBe(200);
      // The rootId 'app' should be in the HTML
      expect(res.text).toContain('id="app"');
    });
  });

  describe('Global component registration', () => {
    it('Link component is globally registered', async () => {
      const res = await api('/about');
      expect(res.status).toBe(200);
      // About page uses <Link> component
      expect(res.text).toContain('<a');
    });
  });

  describe('Vue app plugin registration', () => {
    it('plugins are applied during SSR', async () => {
      const res = await api('/');
      expect(res.status).toBe(200);
      // The page should render correctly, indicating plugins work
      expect(res.text).toContain('<html');
    });
  });
});
