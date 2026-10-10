import { describe, it, expect, beforeEach } from 'vitest';
import { defineDevToolsTab, getCustomTabs, clearCustomTabs } from '@ubean/devtools';
import { api } from './helper';
import { perMode } from './mode';

describe('DevTools system', () => {
  beforeEach(() => {
    clearCustomTabs();
  });

  describe('defineDevToolsTab()', () => {
    it('defines a custom DevTools tab', () => {
      defineDevToolsTab({
        id: 'test-tab',
        label: 'Test Tab',
        icon: 'i-lucide-test',
        src: 'about:blank'
      });
      const tabs = getCustomTabs();
      expect(tabs).toHaveLength(1);
      expect(tabs[0].id).toBe('test-tab');
      expect(tabs[0].label).toBe('Test Tab');
    });

    it('supports multiple custom tabs', () => {
      defineDevToolsTab({ id: 'tab1', label: 'Tab 1', icon: 'icon1', src: 'about:blank' });
      defineDevToolsTab({ id: 'tab2', label: 'Tab 2', icon: 'icon2', src: 'about:blank' });
      defineDevToolsTab({ id: 'tab3', label: 'Tab 3', icon: 'icon3', src: 'about:blank' });
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
      defineDevToolsTab({ id: 'a', label: 'A', icon: 'ia', src: 'about:blank' });
      defineDevToolsTab({ id: 'b', label: 'B', icon: 'ib', src: 'about:blank' });
      const tabs = getCustomTabs();
      expect(tabs).toHaveLength(2);
      expect(tabs.map(t => t.id)).toContain('a');
      expect(tabs.map(t => t.id)).toContain('b');
    });
  });

  describe('clearCustomTabs()', () => {
    it('clears all custom tabs', () => {
      defineDevToolsTab({ id: 'x', label: 'X', icon: 'ix', src: 'about:blank' });
      expect(getCustomTabs()).toHaveLength(1);
      clearCustomTabs();
      expect(getCustomTabs()).toHaveLength(0);
    });
  });

  describe('HTTP integration - DevTools endpoints', () => {
    // TS-33 双轨：这两个端点**只在 dev 暴露**（生产构建里应当 404）。把 dev-only 断言改写成
    // 「双轨两端的期望值都钉住」，顺带成为一道**生产泄漏守卫** —— 比单边断言更有价值。
    it('OpenAPI / Scalar 文档端点只在 dev 暴露（build 轨必须 404）', async () => {
      const openapi = await api('/_openapi.json');
      expect(openapi.status).toBe(perMode(200, 404));

      const scalar = await api('/_scalar');
      expect(scalar.status).toBe(perMode(200, 404));
    });

    it('devframe hub 声明了 ubean frame（RPC 宿主已接线）', async () => {
      // 迁移前这里探 `/_devtools/rpc`（旧 DTK 的 JSON-RPC 端点）。devframe 的 RPC 走 WebSocket
      // （`/__devframes/__ws`），HTTP 侧能断言的「宿主真的在」的凭据是 hub 的 `__index.json`：
      // 它列出已安装的 devframe 与各端点。build 轨不挂 hub → 404（生产泄漏守卫）。
      const res = await api('/__devframes/__index.json');
      expect(res.status).toBe(perMode(200, 404));
      if (res.status === 200) {
        const body = res.data as { frames: Array<{ id: string }> };
        expect(body.frames.map(f => f.id)).toContain('ubean');
      }
    });
  });
});
