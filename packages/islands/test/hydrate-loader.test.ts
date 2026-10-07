// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { hydrateIslands } from '../src/runtime';

/**
 * 回归测试:`virtual:ubean-islands-registry` 导出的是**惰性 loader**
 * (`() => import('…')`),内核必须**调用**它才能拿到组件。
 *
 * 背景:此前 `hydrateIslands` 里是 `Promise.resolve(comp).then(...)`,
 * 而 `Promise.resolve(loaderFn)` 只会把 loader **本身**透传出去(它只解包
 * thenable,不会调用函数)。Vue 于是把 `import()` 返回的 Promise 当成
 * 函数式组件的渲染结果,渲染成文本节点 `[object Promise]`。
 *
 * 更隐蔽的是:`hydrateIsland` 会**先**打上 `data-hydrated="true"` 再挂载,
 * 所以只断言 `data-hydrated` 的测试会误判为通过 —— 只有真正读 DOM 内容
 * 才能发现。这就是 `test/browser/specs/06-islands.e2e.spec.ts` 里 4 条用例
 * 以 30s 超时失败、而 9 条「只看 SSR 结构」的用例全绿的原因。
 */
const Counter = defineComponent({
  name: 'Counter',
  setup() {
    return () => h('span', { class: 'counter-value' }, '0');
  }
});

function mountTarget(attrs: Record<string, string>): HTMLElement {
  const el = document.createElement('ubean-island');
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  document.body.appendChild(el);
  return el;
}

describe('hydrateIslands 惰性 loader 解析', () => {
  it('调用 loader 并把解析出的组件挂载进 island(不是 [object Promise])', async () => {
    const el = mountTarget({
      'data-island-id': 'loader-1',
      'data-component': 'Counter',
      'data-directive': 'client:load',
      'data-props': '{}'
    });

    const loader = vi.fn(() => Promise.resolve(Counter));
    hydrateIslands({ components: { Counter: loader } });

    expect(loader).toHaveBeenCalledTimes(1);

    await Promise.resolve();
    await Promise.resolve();
    await new Promise(r => setTimeout(r, 0));

    expect(el.querySelector('.counter-value')?.textContent).toBe('0');
    expect(el.textContent).not.toContain('[object Promise]');
  });

  it('同步返回组件的 loader 同样被调用', async () => {
    const el = mountTarget({
      'data-island-id': 'loader-2',
      'data-component': 'Counter',
      'data-directive': 'client:load',
      'data-props': '{}'
    });

    const loader = vi.fn(() => Counter);
    hydrateIslands({ components: { Counter: loader as never } });

    expect(loader).toHaveBeenCalledTimes(1);

    await Promise.resolve();
    await new Promise(r => setTimeout(r, 0));

    expect(el.querySelector('.counter-value')?.textContent).toBe('0');
  });

  it('直接传组件对象(非 loader)时原样使用,不被误调用', async () => {
    const el = mountTarget({
      'data-island-id': 'direct-1',
      'data-component': 'Counter',
      'data-directive': 'client:load',
      'data-props': '{}'
    });

    hydrateIslands({ components: { Counter } });

    await Promise.resolve();
    await new Promise(r => setTimeout(r, 0));

    expect(el.querySelector('.counter-value')?.textContent).toBe('0');
  });

  it('getComponent 返回 loader 时也会被调用', async () => {
    const el = mountTarget({
      'data-island-id': 'getter-1',
      'data-component': 'Counter',
      'data-directive': 'client:load',
      'data-props': '{}'
    });

    const getComponent = vi.fn(() => Promise.resolve(Counter));
    hydrateIslands({ getComponent });

    expect(getComponent).toHaveBeenCalledTimes(1);

    await Promise.resolve();
    await Promise.resolve();
    await new Promise(r => setTimeout(r, 0));

    expect(el.querySelector('.counter-value')?.textContent).toBe('0');
  });

  /**
   * 真实形态:注册表里是 `() => import('/src/components/X.vue')`,而 `import()`
   * resolve 的是**模块命名空间** `{ default: Component }`,不是组件本身。
   * 直接交给 Vue 会得到
   * `[Vue warn] Component is missing template or render function: Module`,
   * DOM 依旧为空。这条用例锁住命名空间的拆包。
   */
  it('loader 返回 ESM 模块命名空间({ default })时拆包出组件', async () => {
    const el = mountTarget({
      'data-island-id': 'ns-1',
      'data-component': 'Counter',
      'data-directive': 'client:load',
      'data-props': '{}'
    });

    const loader = vi.fn(() => Promise.resolve({ default: Counter }));
    hydrateIslands({ components: { Counter: loader } });

    expect(loader).toHaveBeenCalledTimes(1);

    await Promise.resolve();
    await Promise.resolve();
    await new Promise(r => setTimeout(r, 0));

    expect(el.querySelector('.counter-value')?.textContent).toBe('0');
    expect(el.textContent).not.toContain('[object Promise]');
  });

  it('同步返回模块命名空间的 loader 也能拆包', async () => {
    const el = mountTarget({
      'data-island-id': 'ns-2',
      'data-component': 'Counter',
      'data-directive': 'client:load',
      'data-props': '{}'
    });

    const loader = vi.fn(() => ({ default: Counter }));
    hydrateIslands({ components: { Counter: loader as never } });

    await Promise.resolve();
    await new Promise(r => setTimeout(r, 0));

    expect(el.querySelector('.counter-value')?.textContent).toBe('0');
  });
});
