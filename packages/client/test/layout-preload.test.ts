// @vitest-environment happy-dom
/**
 * 布局链首帧契约：
 * 1. 传入 `layoutNames` 时 `preloadLayouts()` 预热全部布局，首帧就带当前路由布局。
 * 2. 导航确认前 `beforeResolve` 已解析目标布局，不会先用旧布局/裸 `PageView` 渲染一帧。
 */
import { describe, it, expect } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import type { Component } from 'vue';
import type { RouteRecordRaw } from 'vue-router';
import { createUbeanClientApp } from '../src/app';
import { createClientHead } from '../src/index';

const layout = (id: string): Component =>
  defineComponent({
    name: id,
    setup: () => () => h('div', { id: `${id}-layout` }, id)
  });

const layouts: Record<string, Component> = {
  default: layout('default'),
  blank: layout('blank'),
  admin: layout('admin')
};

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'index', component: { render: () => h('div', 'home') } },
  { path: '/login', name: 'login', component: { render: () => h('div', 'login') }, meta: { layout: 'blank' } },
  { path: '/admin', name: 'admin', component: { render: () => h('div', 'admin') }, meta: { layout: 'admin' } }
];

describe('布局链首帧', () => {
  it('preloadLayouts 预热全部布局，首帧即带当前路由布局', async () => {
    const seen = new Set<string>();
    const instance = createUbeanClientApp({
      routes,
      defaultLayout: 'default',
      layoutNames: ['default', 'blank', 'admin'],
      resolveLayoutComponent: async name => {
        const key = String(name);
        seen.add(key);
        return layouts[key] ?? null;
      },
      head: createClientHead()
    });

    await instance.preloadLayouts();
    expect([...seen].sort()).toEqual(['admin', 'blank', 'default']);

    const host = document.createElement('div');
    instance.app.mount(host);
    await nextTick();
    expect(host.innerHTML).toContain('default-layout');
  });

  it('跨布局导航等到目标布局解析完才确认', async () => {
    let signalAdmin: (() => void) | undefined;
    const adminRequested = new Promise<void>(resolve => {
      signalAdmin = resolve;
    });
    let releaseAdmin: (() => void) | undefined;
    const adminGate = new Promise<void>(resolve => {
      releaseAdmin = resolve;
    });

    const instance = createUbeanClientApp({
      routes,
      defaultLayout: 'default',
      resolveLayoutComponent: async name => {
        const key = String(name);
        if (key === 'admin') {
          signalAdmin?.();
          await adminGate;
        }
        return layouts[key] ?? null;
      },
      head: createClientHead()
    });

    await instance.router.isReady();
    const host = document.createElement('div');
    instance.app.mount(host);
    await nextTick();
    expect(host.innerHTML).toContain('default-layout');

    let settled = false;
    const navigation = instance.router.push('/admin');
    void navigation.then(() => {
      settled = true;
    });
    await adminRequested;
    expect(settled).toBe(false);

    releaseAdmin?.();
    await navigation;
    await nextTick();
    expect(host.innerHTML).toContain('admin-layout');
    expect(host.innerHTML).not.toContain('default-layout');
  });
});
