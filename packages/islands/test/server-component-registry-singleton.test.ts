/**
 * TS-36：服务端组件注册表必须是**进程单例**（挂 `globalThis`）。
 *
 * 历史事故：dev 下 SSR 图把 `packages/islands/dist/runtime.js` 内联进 Vite 预构建 chunk
 * （实测 `form-action-*.js`），而 `createUbeanApp()` 由 `@ubean/app` 的**产物**静态
 * `import '@ubean/islands/server'` 走 Node 原生解析取到另一份 `dist/runtime.js`。
 * 注册表当时是模块级 `new Map()`，于是「SSR 渲染时注册」与「`POST /__server-component`
 * 查找」读两个 Map —— 该端点恒 404 `Component not registered for path`，而页面本身渲染正常。
 *
 * 本文件用「同一模块二次实例化」复现该双实例形态（比 dev server 便宜、且确定可复现）。
 * 判据：`serverComponentRegistry` 若退回模块级 `Map`，这条用例必红。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { defineComponent, h } from 'vue';
import { registerServerComponent, getServerComponent, _clearServerComponentRegistry } from '../src/runtime';

type RuntimeModule = typeof import('../src/runtime');

/** 让同一模块被求值第二次 —— 得到「另一份模块实例」，正是 dev 双实例的等价形态。 */
async function loadSecondInstance(): Promise<RuntimeModule> {
  const href = new URL('../src/runtime.ts?ts36-second-instance', import.meta.url).href;
  return (await import(/* @vite-ignore */ href)) as RuntimeModule;
}

describe('TS-36: server component registry 是进程单例', () => {
  beforeEach(() => {
    _clearServerComponentRegistry();
  });

  it('探针自证：二次实例化确实拿到不同的模块实例', async () => {
    const second = await loadSecondInstance();
    // 若这条断言变成相等，说明 import 被去重 —— 本文件的第二例将失去意义，必须先察觉。
    expect(second.registerServerComponent).not.toBe(registerServerComponent);
    expect(second.getServerComponent).not.toBe(getServerComponent);
  });

  it('在第二实例注册的组件，第一实例能查到（跨实例共享）', async () => {
    const Comp = defineComponent({ name: 'EchoWidget', setup: () => () => h('p', 'Echo') });
    const second = await loadSecondInstance();

    // 模拟：dev SSR 图（内联实例）注册 → `@ubean/app` 产物侧（另一实例）查找
    second.registerServerComponent('/abs/EchoWidget.vue', Comp);

    expect(getServerComponent('/abs/EchoWidget.vue')).toBe(Comp);
    // 反向同样成立
    expect(second.getServerComponent('/abs/EchoWidget.vue')).toBe(Comp);
  });

  it('清空注册表会同时作用于两份实例（同一底层 Map）', async () => {
    const Comp = defineComponent({ name: 'EchoWidget', setup: () => () => h('p', 'Echo') });
    const second = await loadSecondInstance();
    second.registerServerComponent('/abs/EchoWidget.vue', Comp);

    _clearServerComponentRegistry();

    expect(getServerComponent('/abs/EchoWidget.vue')).toBeUndefined();
    expect(second.getServerComponent('/abs/EchoWidget.vue')).toBeUndefined();
  });
});
