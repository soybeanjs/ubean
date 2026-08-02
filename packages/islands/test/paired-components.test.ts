import { describe, it, expect, beforeEach, vi } from 'vitest';
import { h, defineComponent } from 'vue';
import { renderToString } from 'vue/server-renderer';

// `vi.mock` 会被提升到文件顶部,在 import 之前执行。mock `node:fs` 的
// `existsSync` 以便测试 resolveId 的兄弟文件检测逻辑 (无需真实文件系统)。
vi.mock('node:fs', () => ({
  existsSync: vi.fn()
}));

// 在 mock 之后导入 — `existsSync` 此处是 mock 函数,可在每个测试中配置返回值。
import { existsSync } from 'node:fs';
import { definePairedComponent, ServerComponentStub } from '../src/runtime';
import { ubeanIslandsPlugin } from '../src/vite';

const mockedExistsSync = vi.mocked(existsSync);

function getPlugin(): any {
  const plugin = ubeanIslandsPlugin() as any;
  plugin.configResolved({ root: '/project' }, {});
  return plugin;
}

// ============== Task 9.3: resolveId 配对组件解析 ==============

describe('Task 9.3: resolveId paired component resolution', () => {
  beforeEach(() => {
    mockedExistsSync.mockReset();
  });

  it('普通 .vue 同时存在 .server.vue + .client.vue → 重定向到配对 wrapper', async () => {
    const plugin = getPlugin();
    mockedExistsSync.mockImplementation(p => {
      const s = String(p);
      return s === '/project/src/Foo.server.vue' || s === '/project/src/Foo.client.vue';
    });
    const id = await plugin.resolveId.call({}, './Foo.vue', '/project/src/page.vue', { ssr: false });
    expect(id).toContain('virtual:ubean-paired-component:');
    expect(id).toContain('/project/src/Foo.server.vue');
    expect(id).toContain('|');
    expect(id).toContain('/project/src/Foo.client.vue');
  });

  it('配对 wrapper 不区分 SSR / client — 都重定向到同一 wrapper ID', async () => {
    const plugin = getPlugin();
    mockedExistsSync.mockImplementation(p => {
      const s = String(p);
      return s === '/project/src/Foo.server.vue' || s === '/project/src/Foo.client.vue';
    });
    const idSsr = await plugin.resolveId.call({}, './Foo.vue', '/project/src/page.vue', { ssr: true });
    const idClient = await plugin.resolveId.call({}, './Foo.vue', '/project/src/page.vue', { ssr: false });
    expect(idSsr).toBe(idClient);
    expect(idSsr).toContain('virtual:ubean-paired-component:');
  });

  it('仅存在 .server.vue → 重定向到 .server.vue (由现有规则处理)', async () => {
    const plugin = getPlugin();
    mockedExistsSync.mockImplementation(p => String(p) === '/project/src/Foo.server.vue');
    const id = await plugin.resolveId.call({}, './Foo.vue', '/project/src/page.vue', { ssr: false });
    expect(id).toBe('/project/src/Foo.server.vue');
  });

  it('仅存在 .client.vue → 重定向到 .client.vue (由现有规则处理)', async () => {
    const plugin = getPlugin();
    mockedExistsSync.mockImplementation(p => String(p) === '/project/src/Foo.client.vue');
    const id = await plugin.resolveId.call({}, './Foo.vue', '/project/src/page.vue', { ssr: false });
    expect(id).toBe('/project/src/Foo.client.vue');
  });

  it('无兄弟文件 → 返回 undefined (走默认解析)', async () => {
    const plugin = getPlugin();
    mockedExistsSync.mockReturnValue(false);
    const id = await plugin.resolveId.call({}, './Foo.vue', '/project/src/page.vue', { ssr: false });
    expect(id).toBeUndefined();
  });

  it('非相对路径 (bare specifier) 不触发兄弟检测', async () => {
    const plugin = getPlugin();
    mockedExistsSync.mockReturnValue(true); // 即使存在也不应触发
    const id = await plugin.resolveId.call({}, 'vue', '/project/src/page.vue', { ssr: false });
    expect(id).toBeUndefined();
  });

  it('绝对路径不触发兄弟检测 (仅相对路径触发)', async () => {
    const plugin = getPlugin();
    mockedExistsSync.mockReturnValue(true);
    const id = await plugin.resolveId.call({}, '/src/Foo.vue', undefined, { ssr: false });
    expect(id).toBeUndefined();
  });

  it('无 importer (entry) 不触发兄弟检测', async () => {
    const plugin = getPlugin();
    mockedExistsSync.mockReturnValue(true);
    const id = await plugin.resolveId.call({}, './Foo.vue', undefined, { ssr: false });
    expect(id).toBeUndefined();
  });

  it('importer 为虚拟模块 (\\0 前缀) 不触发兄弟检测', async () => {
    const plugin = getPlugin();
    mockedExistsSync.mockReturnValue(true);
    const id = await plugin.resolveId.call({}, './Foo.vue', '\0virtual:ubean-something', { ssr: false });
    expect(id).toBeUndefined();
  });

  it('配对 wrapper 内部 import .client.vue 不被拦截 (importer 检查)', async () => {
    const plugin = getPlugin();
    // 模拟从配对 wrapper 内部 import .client.vue
    const wrapperImporter = '\0virtual:ubean-paired-component:/project/src/Foo.server.vue|/project/src/Foo.client.vue';
    const id = await plugin.resolveId.call({}, '/project/src/Foo.client.vue', wrapperImporter, { ssr: false });
    // 不重定向到 client wrapper,走默认解析 (返回 undefined)
    expect(id).toBeUndefined();
  });
});

// ============== Task 9.3: load 配对 wrapper 模块 ==============

describe('Task 9.3: load paired component wrapper module', () => {
  beforeEach(() => {
    mockedExistsSync.mockReset();
  });

  it('SSR load 直接 re-export .server.vue (不调用 definePairedComponent)', () => {
    const plugin = getPlugin();
    const wrapperId = '\0virtual:ubean-paired-component:/project/src/Foo.server.vue|/project/src/Foo.client.vue';
    const code = plugin.load(wrapperId, { ssr: true });
    expect(code).toContain('import ServerComp from "/project/src/Foo.server.vue"');
    expect(code).toContain('export default ServerComp');
    // 不应导入 client 或 definePairedComponent
    expect(code).not.toContain('.client.vue');
    expect(code).not.toContain('definePairedComponent');
  });

  it('client load 同时导入 .server.vue + .client.vue,调用 definePairedComponent', () => {
    const plugin = getPlugin();
    const wrapperId = '\0virtual:ubean-paired-component:/project/src/Foo.server.vue|/project/src/Foo.client.vue';
    const code = plugin.load(wrapperId, { ssr: false });
    expect(code).toContain('import ServerComp from "/project/src/Foo.server.vue"');
    expect(code).toContain('import ClientComp from "/project/src/Foo.client.vue"');
    expect(code).toContain("import { definePairedComponent } from '@ubean/islands/runtime'");
    expect(code).toContain('export default definePairedComponent(ServerComp, ClientComp)');
  });

  it('无 options 时默认按 client 处理 (调用 definePairedComponent)', () => {
    const plugin = getPlugin();
    const wrapperId = '\0virtual:ubean-paired-component:/a/b.server.vue|/a/b.client.vue';
    const code = plugin.load(wrapperId);
    expect(code).toContain('definePairedComponent');
  });

  it('格式错误的 wrapper ID (无分隔符) 返回 undefined', () => {
    const plugin = getPlugin();
    const badId = '\0virtual:ubean-paired-component:no-separator';
    const code = plugin.load(badId, { ssr: false });
    expect(code).toBeUndefined();
  });
});

// ============== Task 9.3: definePairedComponent runtime ==============

describe('Task 9.3: definePairedComponent runtime', () => {
  async function renderHtml(Comp: any, props?: any): Promise<string> {
    const Root = defineComponent({
      setup() {
        return () => h(Comp, props);
      }
    });
    return renderToString(h(Root));
  }

  it('SSR 渲染 ServerComp (注意: 实际配对 wrapper SSR 直接 re-export ServerComp,不调用本函数)', async () => {
    const ServerComp = defineComponent({
      name: 'ServerComp',
      setup: () => () => h('div', 'server content')
    });
    const ClientComp = defineComponent({
      name: 'ClientComp',
      setup: () => () => h('div', 'client content')
    });
    const Paired = definePairedComponent(ServerComp, ClientComp);
    // SSR: isClient=false → 渲染 ServerComp
    const html = await renderHtml(Paired);
    expect(html).toContain('server content');
    expect(html).not.toContain('client content');
  });

  it('设置 inheritAttrs: false', () => {
    const ServerComp = defineComponent({ name: 'S', setup: () => () => h('div') });
    const ClientComp = defineComponent({ name: 'C', setup: () => () => h('div') });
    const Paired = definePairedComponent(ServerComp, ClientComp) as any;
    expect(Paired.inheritAttrs).toBe(false);
  });

  it('组件名为 PairedComponent', () => {
    const ServerComp = defineComponent({ name: 'S', setup: () => () => h('div') });
    const ClientComp = defineComponent({ name: 'C', setup: () => () => h('div') });
    const Paired = definePairedComponent(ServerComp, ClientComp) as any;
    expect(Paired.name).toBe('PairedComponent');
  });

  it('透传 attrs 给 ServerComp (SSR)', async () => {
    const ServerComp = defineComponent({
      name: 'ServerComp',
      props: { msg: { type: String, default: '' } },
      setup: (props: any) => () => h('div', `msg=${props.msg}`)
    });
    const ClientComp = defineComponent({ name: 'C', setup: () => () => h('div') });
    const Paired = definePairedComponent(ServerComp, ClientComp);
    const html = await renderHtml(Paired, { msg: 'hello' });
    expect(html).toContain('msg=hello');
  });

  it('透传 slots 给 ServerComp (SSR)', async () => {
    const ServerComp = defineComponent({
      name: 'ServerComp',
      setup:
        (_props: any, { slots }: any) =>
        () =>
          h('div', slots.default?.())
    });
    const ClientComp = defineComponent({ name: 'C', setup: () => () => h('div') });
    const Paired = definePairedComponent(ServerComp, ClientComp);
    const Root = defineComponent({
      setup() {
        return () => h(Paired, null, { default: () => h('span', 'slot content') });
      }
    });
    const html = await renderToString(h(Root));
    expect(html).toContain('slot content');
  });

  it('与 ServerComponentStub 配合: SSR 渲染 stub (模拟客户端构建中 ServerComp=stub)', async () => {
    // 客户端构建中,ServerComp 会被替换为 ServerComponentStub (渲染空 <ubean-server-only>)
    const ClientComp = defineComponent({
      name: 'ClientComp',
      setup: () => () => h('div', 'client content')
    });
    const Paired = definePairedComponent(ServerComponentStub, ClientComp);
    // SSR (在客户端构建语境下,这里仅验证初始渲染走 ServerComp 分支):
    const html = await renderHtml(Paired);
    expect(html).toContain('ubean-server-only');
    expect(html).not.toContain('client content');
  });
});
