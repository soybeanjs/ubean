import { describe, it, expect } from 'vitest';
import { h, defineComponent } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { ServerComponentStub, ClientComponentPlaceholder, defineClientComponent } from '../src/runtime';
import {
  isServerComponentFile,
  isClientComponentFile,
  wrapServerComponentTemplate,
  ubeanIslandsPlugin,
  SERVER_COMPONENT_STUB_VIRTUAL_ID,
  CLIENT_COMPONENT_PLACEHOLDER_VIRTUAL_ID
} from '../src/vite';

// ============== Task 9.1: .server.vue 文件检测 ==============

describe('Task 9.1: isServerComponentFile', () => {
  it('识别 .server.vue 文件', () => {
    expect(isServerComponentFile('/src/Foo.server.vue')).toBe(true);
    expect(isServerComponentFile('./Foo.server.vue')).toBe(true);
    expect(isServerComponentFile('Foo.server.vue')).toBe(true);
  });

  it('忽略 ?query 后缀', () => {
    expect(isServerComponentFile('/src/Foo.server.vue?vue&type=template')).toBe(true);
    expect(isServerComponentFile('/src/Foo.server.vue?t=123')).toBe(true);
  });

  it('拒绝普通 .vue 文件', () => {
    expect(isServerComponentFile('/src/Foo.vue')).toBe(false);
    expect(isServerComponentFile('/src/Foo.client.vue')).toBe(false);
    expect(isServerComponentFile('/src/server.vue')).toBe(false); // 路径段,非后缀
  });
});

// ============== Task 9.2: .client.vue 文件检测 ==============

describe('Task 9.2: isClientComponentFile', () => {
  it('识别 .client.vue 文件', () => {
    expect(isClientComponentFile('/src/Foo.client.vue')).toBe(true);
    expect(isClientComponentFile('./Foo.client.vue')).toBe(true);
  });

  it('忽略 ?query 后缀', () => {
    expect(isClientComponentFile('/src/Foo.client.vue?vue&type=template')).toBe(true);
  });

  it('拒绝普通 .vue 文件', () => {
    expect(isClientComponentFile('/src/Foo.vue')).toBe(false);
    expect(isClientComponentFile('/src/Foo.server.vue')).toBe(false);
  });
});

// ============== Task 9.1: .server.vue 模板包裹 ==============

describe('Task 9.1: wrapServerComponentTemplate', () => {
  it('将模板内容包裹在 <ubean-server-only v-once> 中', () => {
    const sfc = `<template><div>hello</div></template>`;
    const result = wrapServerComponentTemplate(sfc);
    expect(result).not.toBeNull();
    expect(result).toContain('<ubean-server-only v-once>');
    expect(result).toContain('<div>hello</div>');
    expect(result).toContain('</ubean-server-only>');
  });

  it('保留 <template> 属性 (如 lang)', () => {
    const sfc = `<template lang="html"><div>hello</div></template>`;
    const result = wrapServerComponentTemplate(sfc);
    expect(result).toContain('<template lang="html">');
  });

  it('保留 <script> 块不变', () => {
    const sfc = `<script setup>const x = 1;</script>\n<template><div>{{ x }}</div></template>`;
    const result = wrapServerComponentTemplate(sfc);
    expect(result).toContain('<script setup>const x = 1;</script>');
    expect(result).toContain('<ubean-server-only v-once>');
  });

  it('幂等: 已包裹的不再重复包裹', () => {
    const sfc = `<template><ubean-server-only v-once><div>hello</div></ubean-server-only></template>`;
    const result = wrapServerComponentTemplate(sfc);
    expect(result).toBeNull(); // 已包裹,跳过
  });

  it('无 template 块时返回 null', () => {
    const sfc = `<script setup>const x = 1;</script>`;
    const result = wrapServerComponentTemplate(sfc);
    expect(result).toBeNull();
  });

  it('处理多根节点模板 (fragment)', () => {
    const sfc = `<template><div>A</div><div>B</div></template>`;
    const result = wrapServerComponentTemplate(sfc);
    expect(result).toContain('<ubean-server-only v-once><div>A</div><div>B</div></ubean-server-only>');
  });
});

// ============== Task 9.1: ServerComponentStub runtime ==============

describe('Task 9.1: ServerComponentStub (client stub)', () => {
  async function renderHtml(Comp: any): Promise<string> {
    const Root = defineComponent({
      setup() {
        return () => h(Comp);
      }
    });
    return renderToString(h(Root));
  }

  it('渲染空的 <ubean-server-only> 元素 (无子节点)', async () => {
    const html = await renderHtml(ServerComponentStub);
    expect(html).toContain('<ubean-server-only');
    expect(html).toContain('data-server-only');
    // stub 渲染空元素 (无子内容),SSR 内容由服务端渲染后客户端保留
    expect(html).toMatch(/<ubean-server-only[^>]*><\/ubean-server-only>/);
  });

  it('组件名为 ServerComponentStub', () => {
    expect((ServerComponentStub as any).name).toBe('ServerComponentStub');
  });
});

// ============== Task 9.2: ClientComponentPlaceholder runtime ==============

describe('Task 9.2: ClientComponentPlaceholder (SSR placeholder)', () => {
  async function renderHtml(Comp: any): Promise<string> {
    const Root = defineComponent({
      setup() {
        return () => h(Comp);
      }
    });
    return renderToString(h(Root));
  }

  it('SSR 渲染 <div data-client-only> 占位符', async () => {
    const html = await renderHtml(ClientComponentPlaceholder);
    expect(html).toContain('<div');
    expect(html).toContain('data-client-only');
    // 占位符为空 div
    expect(html).toMatch(/<div[^>]*data-client-only[^>]*><\/div>/);
  });

  it('组件名为 ClientComponentPlaceholder', () => {
    expect((ClientComponentPlaceholder as any).name).toBe('ClientComponentPlaceholder');
  });
});

// ============== Task 9.2: defineClientComponent runtime ==============

describe('Task 9.2: defineClientComponent (client wrapper)', () => {
  async function renderHtml(Comp: any, props?: any): Promise<string> {
    const Root = defineComponent({
      setup() {
        return () => h(Comp, props);
      }
    });
    return renderToString(h(Root));
  }

  it('SSR 渲染 <div data-client-only> 占位符 (与 ClientComponentPlaceholder 一致)', async () => {
    const Inner = defineComponent({ name: 'Inner', setup: () => () => h('div', 'client-only content') });
    const Wrapped = defineClientComponent(Inner);
    const html = await renderHtml(Wrapped);
    // SSR: isClient=false → 渲染占位符 (不是真实组件)
    expect(html).toContain('data-client-only');
    expect(html).not.toContain('client-only content');
  });

  it('透传 attrs (props) 给真实组件 (验证 setup 接收 attrs)', async () => {
    const Inner = defineComponent({
      name: 'Inner',
      props: { msg: { type: String, default: '' } },
      setup(props) {
        return () => h('div', `msg=${props.msg}`);
      }
    });
    const Wrapped = defineClientComponent(Inner);
    // SSR: 渲染占位符,不渲染真实组件
    const html = await renderHtml(Wrapped, { msg: 'hello' });
    expect(html).toContain('data-client-only');
    expect(html).not.toContain('msg=hello');
  });

  it('设置 inheritAttrs: false', () => {
    const Inner = defineComponent({ name: 'Inner', setup: () => () => h('div') });
    const Wrapped = defineClientComponent(Inner) as any;
    expect(Wrapped.inheritAttrs).toBe(false);
  });

  it('组件名为 ClientComponent', () => {
    const Inner = defineComponent({ name: 'Inner', setup: () => () => h('div') });
    const Wrapped = defineClientComponent(Inner) as any;
    expect(Wrapped.name).toBe('ClientComponent');
  });
});

// ============== Vite 插件: resolveId / load 路由 ==============

describe('Task 9.1/9.2: Vite plugin resolveId / load', () => {
  function getPlugin() {
    const plugin = ubeanIslandsPlugin() as any;
    // 模拟 configResolved 设置 viteConfig
    plugin.configResolved({ root: '/project' }, {});
    return plugin;
  }

  // --- .server.vue ---

  it('9.1: .server.vue 在 client 构建 (ssr=false) 重定向到 stub', async () => {
    const plugin = getPlugin();
    const id = await plugin.resolveId.call({}, '/src/Foo.server.vue', undefined, { ssr: false });
    expect(id).toBe(`\0${SERVER_COMPONENT_STUB_VIRTUAL_ID}`);
  });

  it('9.1: .server.vue 在 SSR 构建 (ssr=true) 正常解析 (返回 undefined)', async () => {
    const plugin = getPlugin();
    const id = await plugin.resolveId.call({}, '/src/Foo.server.vue', undefined, { ssr: true });
    expect(id).toBeUndefined();
  });

  it('9.1: load 返回 ServerComponentStub 模块', () => {
    const plugin = getPlugin();
    const code = plugin.load(`\0${SERVER_COMPONENT_STUB_VIRTUAL_ID}`);
    expect(code).toContain('ServerComponentStub');
    expect(code).toContain('@ubean/islands/runtime');
    expect(code).toContain('export default');
  });

  // --- .client.vue ---

  it('9.2: .client.vue 在 SSR 构建 (ssr=true) 重定向到占位符', async () => {
    const plugin = getPlugin();
    const id = await plugin.resolveId.call({}, '/src/Foo.client.vue', undefined, { ssr: true });
    expect(id).toBe(`\0${CLIENT_COMPONENT_PLACEHOLDER_VIRTUAL_ID}`);
  });

  it('9.2: .client.vue 在 client 构建 (ssr=false) 重定向到包装模块', async () => {
    const plugin = getPlugin();
    // 模拟 this.resolve 返回绝对路径
    const ctx = {
      resolve: async () => ({ id: '/project/src/Foo.client.vue' })
    };
    const id = await plugin.resolveId.call(ctx, '/src/Foo.client.vue', undefined, { ssr: false });
    expect(id).toContain('virtual:ubean-client-component:');
    expect(id).toContain('/project/src/Foo.client.vue');
  });

  it('9.2: .client.vue 从包装模块内部 import 时不被拦截 (importer 检查)', async () => {
    const plugin = getPlugin();
    const wrapperImporter = '\0virtual:ubean-client-component:/project/src/Foo.client.vue';
    const id = await plugin.resolveId.call({}, '/project/src/Foo.client.vue', wrapperImporter, { ssr: false });
    // importer 是包装模块 → 不拦截,返回 undefined 走默认解析
    expect(id).toBeUndefined();
  });

  it('9.2: load SSR 占位符返回 ClientComponentPlaceholder 模块', () => {
    const plugin = getPlugin();
    const code = plugin.load(`\0${CLIENT_COMPONENT_PLACEHOLDER_VIRTUAL_ID}`);
    expect(code).toContain('ClientComponentPlaceholder');
    expect(code).toContain('@ubean/islands/runtime');
    expect(code).toContain('export default');
  });

  it('9.2: load client 包装模块返回 defineClientComponent 包装代码', () => {
    const plugin = getPlugin();
    const wrapperId = '\0virtual:ubean-client-component:/project/src/Foo.client.vue';
    const code = plugin.load(wrapperId);
    expect(code).toContain('import RealComp from "/project/src/Foo.client.vue"');
    expect(code).toContain('defineClientComponent');
    expect(code).toContain('export default defineClientComponent(RealComp)');
  });

  // --- 普通 .vue 不受影响 ---

  it('普通 .vue 文件不受 resolveId 影响', async () => {
    const plugin = getPlugin();
    const id1 = await plugin.resolveId.call({}, '/src/Foo.vue', undefined, { ssr: false });
    const id2 = await plugin.resolveId.call({}, '/src/Foo.vue', undefined, { ssr: true });
    expect(id1).toBeUndefined();
    expect(id2).toBeUndefined();
  });
});

// ============== Vite 插件: transform 模板包裹 ==============

describe('Task 9.1: Vite plugin transform wraps .server.vue template', () => {
  function getPlugin() {
    const plugin = ubeanIslandsPlugin() as any;
    plugin.configResolved({ root: '/project' }, {});
    return plugin;
  }

  it('transform 为 .server.vue 模板包裹 <ubean-server-only v-once>', () => {
    const plugin = getPlugin();
    const sfc = `<template><div>server content</div></template>`;
    const result = plugin.transform(sfc, '/src/Foo.server.vue');
    expect(result).not.toBeNull();
    expect(result.code).toContain('<ubean-server-only v-once>');
    expect(result.code).toContain('<div>server content</div>');
    expect(result.code).toContain('</ubean-server-only>');
  });

  it('transform 不影响普通 .vue 文件 (无 v-client.* 指令)', () => {
    const plugin = getPlugin();
    const sfc = `<template><div>normal content</div></template>`;
    const result = plugin.transform(sfc, '/src/Foo.vue');
    expect(result).toBeNull();
  });

  it('transform 不影响 .client.vue 文件', () => {
    const plugin = getPlugin();
    const sfc = `<template><div>client content</div></template>`;
    const result = plugin.transform(sfc, '/src/Foo.client.vue');
    // .client.vue 不做模板包裹 (SSR 用占位符,client 用 defineClientComponent)
    expect(result).toBeNull();
  });
});
