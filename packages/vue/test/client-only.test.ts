/** @vitest-environment happy-dom */
/**
 * ClientOnly 组件测试
 *
 * 核心契约:水合安全 —— SSR 输出与客户端首帧(水合渲染)输出必须一致,
 * 真实内容仅在 onMounted 后 patch 进来。分支实现禁止 `typeof window` 判断。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createApp, createSSRApp, h, nextTick } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { ClientOnly, ubeanVue } from '../src/index';

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* 1. 插件注册                                                                 */
/* -------------------------------------------------------------------------- */

describe('ubeanVue 插件注册 ClientOnly', () => {
  it('注册 ClientOnly 全局组件', () => {
    const app = createApp({ render: () => h('div') });
    app.use(ubeanVue);
    expect(app.component('ClientOnly')).toBe(ClientOnly);
  });
});

/* -------------------------------------------------------------------------- */
/* 2. SSR 输出(与客户端首帧一致)                                              */
/* -------------------------------------------------------------------------- */

describe('ClientOnly SSR 渲染', () => {
  it('无 fallback:渲染注释占位,默认 slot 内容不进 SSR HTML', async () => {
    const app = createSSRApp({
      render: () => h(ClientOnly, null, { default: () => h('div', 'client content') })
    });
    const html = await renderToString(app);
    expect(html).not.toContain('client content');
    // 注释占位(零 DOM 元素,无布局污染)
    expect(html).toContain('client-only');
  });

  it('fallback prop:渲染文本占位', async () => {
    const app = createSSRApp({
      render: () => h(ClientOnly, { fallback: 'loading…' }, { default: () => h('div', 'client content') })
    });
    const html = await renderToString(app);
    expect(html).toContain('loading…');
    expect(html).not.toContain('client content');
  });

  it('#fallback slot:渲染自定义占位内容', async () => {
    const app = createSSRApp({
      render: () =>
        h(ClientOnly, null, {
          default: () => h('div', 'client content'),
          fallback: () => h('div', { class: 'skeleton' }, 'skeleton')
        })
    });
    const html = await renderToString(app);
    expect(html).toContain('skeleton');
    expect(html).toContain('class="skeleton"');
    expect(html).not.toContain('client content');
  });
});

/* -------------------------------------------------------------------------- */
/* 3. 客户端挂载(mount 后 patch 进真实内容)                                    */
/* -------------------------------------------------------------------------- */

describe('ClientOnly 客户端渲染', () => {
  it('挂载首帧渲染占位,nextTick 后渲染默认 slot 内容', async () => {
    const root = document.createElement('div');
    const app = createApp({
      render: () => h(ClientOnly, { fallback: 'loading…' }, { default: () => h('div', 'client content') })
    });
    app.mount(root);
    // 首帧(水合渲染阶段):与 SSR 一致,渲染 fallback
    expect(root.textContent).toContain('loading…');
    expect(root.innerHTML).not.toContain('client content');

    await nextTick();
    // onMounted 翻转 mounted → patch 进真实内容
    expect(root.textContent).toContain('client content');
    expect(root.textContent).not.toContain('loading…');
    app.unmount();
  });

  it('无 fallback 时挂载首帧为空,nextTick 后渲染内容', async () => {
    const root = document.createElement('div');
    const app = createApp({
      render: () => h(ClientOnly, null, { default: () => h('span', 'browser only') })
    });
    app.mount(root);
    expect(root.innerHTML).not.toContain('browser only');

    await nextTick();
    expect(root.textContent).toContain('browser only');
    app.unmount();
  });

  it('#fallback slot 在客户端首帧渲染,patch 后替换为默认 slot', async () => {
    const root = document.createElement('div');
    const app = createApp({
      render: () =>
        h(ClientOnly, null, {
          default: () => h('div', 'client content'),
          fallback: () => h('div', { class: 'skeleton' })
        })
    });
    app.mount(root);
    expect(root.querySelector('.skeleton')).not.toBeNull();

    await nextTick();
    expect(root.querySelector('.skeleton')).toBeNull();
    expect(root.textContent).toContain('client content');
    app.unmount();
  });
});

/* -------------------------------------------------------------------------- */
/* 4. SSR → 客户端水合(核心契约:无 mismatch)                                  */
/* -------------------------------------------------------------------------- */

describe('ClientOnly SSR 水合', () => {
  it('SSR HTML 水合首帧输出一致,无 Hydration mismatch 警告', async () => {
    const Host = {
      render: () =>
        h('div', [
          h(ClientOnly, { fallback: 'loading…' }, { default: () => h('div', 'client content') }),
          h(ClientOnly, null, { default: () => h('span', 'browser only') })
        ])
    };

    const warns: string[] = [];
    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      warns.push(args.map(String).join(' '));
    });

    const html = await renderToString(createSSRApp(Host));
    const root = document.createElement('div');
    root.innerHTML = html;

    createSSRApp(Host).mount(root); // createSSRApp + 含 SSR 内容的容器 → 水合

    const mismatches = warns.filter(w => w.includes('Hydration'));
    expect(mismatches, `不应出现水合 mismatch 警告:${mismatches.join('\n')}`).toEqual([]);

    await nextTick();
    expect(root.textContent).toContain('client content');
    expect(root.textContent).toContain('browser only');
  });
});
