import { describe, it, expect } from 'vitest';
import { h, defineComponent } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { ServerComponentStub, ClientComponentPlaceholder, defineClientComponent } from '../src/runtime';
import {
  isServerComponentFile,
  isClientComponentFile,
  wrapServerComponentTemplate,
  hasServerComponentTemplate,
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

  /**
   * 「包裹不了」的两种情形必须能区分：**没有 `<template>`** 要报错，**已包裹（幂等）** 要静默跳过。
   *
   * 没有 `<template>` 的 `.server.vue`（render 函数 / `export { default } from …` 这类写法）在改造前
   * 会被静默放过，而客户端 stub 的根标签固定是 `<ubean-server-only>` —— 实测 Vue 报
   * `Hydration node mismatch` 并**把服务端渲染的内容清掉**（首屏有内容、水合后变空）。
   */
  it('hasServerComponentTemplate 区分「没有 template」与「已包裹」', () => {
    expect(hasServerComponentTemplate(`<script setup>const x = 1;</script>`)).toBe(false);
    expect(hasServerComponentTemplate(`<script>export default {}</script>`)).toBe(false);
    expect(hasServerComponentTemplate(`<template><div>a</div></template>`)).toBe(true);
    // 已包裹的仍有 template 块 → 静默跳过（不报错）
    expect(
      hasServerComponentTemplate(`<template><ubean-server-only v-once><div>a</div></ubean-server-only></template>`)
    ).toBe(true);
  });

  it('无 <template> 的 .server.vue 在 transform 阶段报错（不静默放过）', () => {
    const plugin = ubeanIslandsPlugin() as any;
    plugin.configResolved({ root: '/project' }, {});
    expect(() =>
      plugin.transform(`<script>export default { setup: () => () => null };</script>`, '/project/src/Foo.server.vue')
    ).toThrowError(/没有 <template>/);
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

  /**
   * 占位符必须是**注释节点**，不是元素。
   *
   * 元素占位符（早先是 `<div data-client-only>`）在受限父级里会产出非法嵌套：放进
   * `<tr>` / `<table>` / `<ul>` / `<select>` 会被 HTML 解析器提到容器外，DOM 与客户端
   * vnode 树错位 → 水合 mismatch（实测浏览器里行被提到表格之前）。注释在任何位置都合法。
   * 标记文本与 `@ubean/vue` 的 `<ClientOnly>` 保持一致。
   */
  it('SSR 渲染 <!--client-only--> 注释占位符（而非元素）', async () => {
    const html = await renderHtml(ClientComponentPlaceholder);
    expect(html).toContain('<!--client-only-->');
    // 关键：不得有元素包裹（那会在表格/列表上下文里被解析器提出容器）
    expect(html).not.toContain('<div');
    expect(html).not.toContain('data-client-only');
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

  it('SSR 渲染 <!--client-only--> 注释占位符 (与 ClientComponentPlaceholder 一致)', async () => {
    const Inner = defineComponent({ name: 'Inner', setup: () => () => h('div', 'client-only content') });
    const Wrapped = defineClientComponent(Inner);
    const html = await renderHtml(Wrapped);
    // SSR: isClient=false → 渲染占位符 (不是真实组件)
    expect(html).toContain('<!--client-only-->');
    expect(html).not.toContain('<div');
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
    expect(html).toContain('<!--client-only-->');
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

  it('9.1: .server.vue 在 client 构建 (ssr=false) 重定向到**文件级** stub', async () => {
    const plugin = getPlugin();
    const id = await plugin.resolveId.call(
      { resolve: async () => ({ id: '/project/src/Foo.server.vue', external: false }) },
      '/src/Foo.server.vue',
      undefined,
      { ssr: false }
    );
    // 文件级（而非共用一个模块）：否则所有 .server.vue 在客户端图里是同一个组件
    expect(id).toContain(SERVER_COMPONENT_STUB_VIRTUAL_ID);
    expect(id).toContain('/project/src/Foo.server.vue');
  });

  it('9.1: 文件级 stub 带上组件自己的 name（name 判别不再全部相同）', () => {
    const plugin = getPlugin();
    const code = plugin.load('\0virtual:ubean-server-component-stub:/project/src/Foo.server.vue.ubean-wrapper');
    expect(code).toContain('ServerComponentStub');
    expect(code).toContain('name: "Foo"');
  });

  it('9.1: .server.vue 在 SSR 构建 (ssr=true) 正常解析 (返回 undefined)', async () => {
    const plugin = getPlugin();
    const id = await plugin.resolveId.call({}, '/src/Foo.server.vue', undefined, { ssr: true });
    expect(id).toBeUndefined();
  });

  it('9.1: 通用 stub 虚拟模块仍然可用（向后兼容）', () => {
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

// ============== 受限父级：构建期失败而不是静默错位 ==============

describe('受限父级里的 Server Component', () => {
  function getPluginForUsage(): any {
    const plugin = ubeanIslandsPlugin() as any;
    plugin.configResolved({ root: '/project' }, {});
    return plugin;
  }

  const page = (template: string, importPath = './Greeting.server.vue') =>
    `<script setup lang="ts">\nimport Greeting from '${importPath}';\n</script>\n<template>${template}</template>\n`;

  /**
   * 判据是**构建期失败**而不是警告：这些位置的失败在生产模式下是静默的
   * （内容被解析器搬出容器 / 丢弃，Vue 的告警被剥掉），警告留在终端里没人会当回事。
   */
  it('表格上下文里直接当子元素用 → transform 抛错', () => {
    const plugin = getPluginForUsage();
    for (const template of [
      '<table><tr><Greeting /></tr></table>',
      '<table><tbody><Greeting /></tbody></table>',
      '<table><colgroup><Greeting /></colgroup></table>'
    ]) {
      expect(() => plugin.transform(page(template), '/project/src/Page.vue')).toThrowError(/受限父级/);
    }
  });

  it('`<template v-if>` 视为透明：穿透后仍命中', () => {
    const plugin = getPluginForUsage();
    expect(() =>
      plugin.transform(
        page('<table><tr><template v-if="x"><Greeting /></template></tr></table>'),
        '/project/src/Page.vue'
      )
    ).toThrowError(/受限父级/);
  });

  it('select / optgroup 里 → 抛错（解析器会丢弃未知标签）', () => {
    const plugin = getPluginForUsage();
    expect(() => plugin.transform(page('<select><Greeting /></select>'), '/project/src/Page.vue')).toThrowError(
      /受限父级/
    );
    expect(() =>
      plugin.transform(page('<select><optgroup><Greeting /></optgroup></select>'), '/project/src/Page.vue')
    ).toThrowError(/受限父级/);
  });

  it('连字符写法同样命中（<server-greeting /> 对应 import ServerGreeting）', () => {
    const plugin = getPluginForUsage();
    const sfc = page('<table><tr><server-greeting /></tr></table>', './ServerGreeting.server.vue').replace(
      'import Greeting from',
      'import ServerGreeting from'
    );
    expect(() => plugin.transform(sfc, '/project/src/Page.vue')).toThrowError(/受限父级/);
  });

  it('允许的位置不报错：td / li / 普通容器', () => {
    const plugin = getPluginForUsage();
    expect(() =>
      plugin.transform(page('<table><tr><td><Greeting /></td></tr></table>'), '/project/src/Page.vue')
    ).not.toThrow();
    expect(() => plugin.transform(page('<ul><li><Greeting /></li></ul>'), '/project/src/Page.vue')).not.toThrow();
    expect(() => plugin.transform(page('<div><Greeting /></div>'), '/project/src/Page.vue')).not.toThrow();
  });

  /**
   * `ul`/`ol`/`dl` 刻意不在受限集合里：非 `li` 子元素虽然是不合法 HTML，但解析器**不会**搬移或丢弃它，
   * 两侧 DOM 一致、水合正常 —— 报错会是误报。
   */
  it('ul / ol / dl 不报错（解析器不重构 DOM）', () => {
    const plugin = getPluginForUsage();
    expect(() => plugin.transform(page('<ul><Greeting /></ul>'), '/project/src/Page.vue')).not.toThrow();
    expect(() => plugin.transform(page('<ol><Greeting /></ol>'), '/project/src/Page.vue')).not.toThrow();
  });

  it('普通组件与 .client.vue 不受影响', () => {
    const plugin = getPluginForUsage();
    expect(() =>
      plugin.transform(page('<table><tr><Wrapper /></tr></table>', './Wrapper.vue'), '/project/src/Page.vue')
    ).not.toThrow();
    // `.client.vue` 的占位符是注释节点，在表格里合法
    expect(() =>
      plugin.transform(page('<table><tr><ClientRow /></tr></table>', './ClientRow.client.vue'), '/project/src/Page.vue')
    ).not.toThrow();
  });

  it('服务端组件自身不会被误判（它的 template 里没有自己的 import）', () => {
    const plugin = getPluginForUsage();
    const sfc = `<script setup lang="ts">\nconst x = 1;\n</script>\n<template><tr><td>{{ x }}</td></tr></template>\n`;
    expect(() => plugin.transform(sfc, '/project/src/Greeting.server.vue')).not.toThrow();
  });
});
