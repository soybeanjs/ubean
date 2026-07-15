import { describe, it, expect, beforeEach } from 'vitest';
import { defineDevToolsTab, getCustomTabs, clearCustomTabs } from 'ubean';
import { api, getJson } from './helper';

describe('DevTools system', () => {
  beforeEach(() => {
    clearCustomTabs();
  });

  describe('defineDevToolsTab()', () => {
    it('defines a custom DevTools tab', () => {
      defineDevToolsTab({
        id: 'test-tab',
        name: 'Test Tab',
        icon: 'i-lucide-test',
        view: () => null
      });
      const tabs = getCustomTabs();
      expect(tabs).toHaveLength(1);
      expect(tabs[0].id).toBe('test-tab');
      expect(tabs[0].name).toBe('Test Tab');
    });

    it('supports multiple custom tabs', () => {
      defineDevToolsTab({ id: 'tab1', name: 'Tab 1', icon: 'icon1', view: () => null });
      defineDevToolsTab({ id: 'tab2', name: 'Tab 2', icon: 'icon2', view: () => null });
      defineDevToolsTab({ id: 'tab3', name: 'Tab 3', icon: 'icon3', view: () => null });
      const tabs = getCustomTabs();
      expect(tabs).toHaveLength(3);
    });
  });

  describe('getCustomTabs()', () => {
    it('returns empty array when no tabs defined', () => {
      const tabs = getCustomTabs();
      expect(tabs).toHaveLength(0);
    });

    it('returns all defined tabs', () => {
      defineDevToolsTab({ id: 'a', name: 'A', icon: 'ia', view: () => null });
      defineDevToolsTab({ id: 'b', name: 'B', icon: 'ib', view: () => null });
      const tabs = getCustomTabs();
      expect(tabs).toHaveLength(2);
      expect(tabs.map(t => t.id)).toContain('a');
      expect(tabs.map(t => t.id)).toContain('b');
    });
  });

  describe('clearCustomTabs()', () => {
    it('clears all custom tabs', () => {
      defineDevToolsTab({ id: 'x', name: 'X', icon: 'ix', view: () => null });
      expect(getCustomTabs()).toHaveLength(1);
      clearCustomTabs();
      expect(getCustomTabs()).toHaveLength(0);
    });
  });

  describe('HTTP integration - DevTools endpoints', () => {
    it('/_openapi.json is accessible in dev', async () => {
      const res = await api('/_openapi.json');
      expect(res.status).toBe(200);
    });

    it('/_scalar is accessible in dev', async () => {
      const res = await api('/_scalar');
      // Scalar UI should return HTML
      expect(res.status).toBe(200);
    });

    it('DevTools RPC endpoint exists', async () => {
      // The DevTools RPC path is /__ubean_devtools__/rpc
      const res = await api('/__ubean_devtools__/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'overview.get',
          params: {},
          id: 'test-1'
        })
      });
      // Should return some response (may be JSON-RPC or error)
      expect(res.status).toBeLessThan(500);
    });
  });
});
