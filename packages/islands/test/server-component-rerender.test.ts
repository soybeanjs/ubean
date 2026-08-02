import { describe, it, expect, beforeEach } from 'vitest';
import { h, defineComponent } from 'vue';
import { Hono } from 'hono';
import { renderToString } from 'vue/server-renderer';
import {
  defineServerIsland,
  registerServerComponent,
  getServerComponent,
  _clearServerComponentRegistry,
  SERVER_COMPONENT_ENDPOINT
} from '../src/runtime';
import {
  createServerComponentMiddleware,
  SERVER_COMPONENT_RESPONSE_HEADER,
  isServerComponentRequest,
  isServerComponentResponse
} from '../src/server-component';
import { injectServerComponentPath, ubeanIslandsPlugin } from '../src/vite';

// ============== Task 9.4: injectServerComponentPath (Vite transform) ==============

describe('Task 9.4: injectServerComponentPath', () => {
  it('.ts 文件: 注入组件绝对路径作为第 3 参数', () => {
    const code = `
import { defineServerIsland } from 'ubean';
import Dashboard from './Dashboard.server.vue';
export const DashboardIsland = defineServerIsland(Dashboard, {
  rerenderOnPropsChange: true
});
`.trim();
    const result = injectServerComponentPath(code, '/project/src/islands.ts');
    expect(result).not.toBeNull();
    expect(result).toContain('defineServerIsland(Dashboard, {');
    expect(result).toContain('rerenderOnPropsChange: true');
    // 注入了绝对路径作为第 3 参数
    expect(result).toContain(', "/project/src/Dashboard.server.vue"');
    expect(result).toMatch(/defineServerIsland\(Dashboard,\s*\{[^}]*\},\s*"\/project\/src\/Dashboard\.server\.vue"\)/);
  });

  it('.vue SFC: 在 <script setup> 中注入', () => {
    const code = `<script setup>
import { defineServerIsland } from 'ubean';
import Dashboard from './Dashboard.server.vue';
const DashboardIsland = defineServerIsland(Dashboard, {
  rerenderOnPropsChange: true
});
</script>

<template>
  <DashboardIsland :userId="123" />
</template>`;
    const result = injectServerComponentPath(code, '/project/src/page.vue');
    expect(result).not.toBeNull();
    expect(result).toContain(', "/project/src/Dashboard.server.vue"');
    // template 部分保持不变
    expect(result).toContain('<DashboardIsland :userId="123" />');
  });

  it('跳过: 无 rerenderOnPropsChange 选项', () => {
    const code = `
import { defineServerIsland } from 'ubean';
import Dashboard from './Dashboard.server.vue';
export const DashboardIsland = defineServerIsland(Dashboard, { fallback: 'Loading' });
`.trim();
    const result = injectServerComponentPath(code, '/project/src/islands.ts');
    expect(result).toBeNull();
  });

  it('跳过: rerenderOnPropsChange: false', () => {
    const code = `
import { defineServerIsland } from 'ubean';
import Dashboard from './Dashboard.server.vue';
export const DashboardIsland = defineServerIsland(Dashboard, { rerenderOnPropsChange: false });
`.trim();
    const result = injectServerComponentPath(code, '/project/src/islands.ts');
    expect(result).toBeNull();
  });

  it('幂等: 已有第 3 参数不再注入', () => {
    const code = `
import { defineServerIsland } from 'ubean';
import Dashboard from './Dashboard.server.vue';
export const DashboardIsland = defineServerIsland(Dashboard, { rerenderOnPropsChange: true }, "/already/injected.vue");
`.trim();
    const result = injectServerComponentPath(code, '/project/src/islands.ts');
    expect(result).toBeNull();
  });

  it('跳过: identifier 未在 import map 中 (动态 import / 全局注册)', () => {
    const code = `
import { defineServerIsland } from 'ubean';
export const DashboardIsland = defineServerIsland(globalComp, { rerenderOnPropsChange: true });
`.trim();
    const result = injectServerComponentPath(code, '/project/src/islands.ts');
    expect(result).toBeNull();
  });

  it('跳过: 注释中的 defineServerIsland 调用', () => {
    const code = `
// defineServerIsland(Foo, { rerenderOnPropsChange: true })
import { defineServerIsland } from 'ubean';
import Foo from './Foo.server.vue';
const FooIsland = defineServerIsland(Foo, { rerenderOnPropsChange: true });
`.trim();
    const result = injectServerComponentPath(code, '/project/src/islands.ts');
    expect(result).not.toBeNull();
    // 注释中的不应被注入,只有真实的调用被注入
    const injectCount = (result!.match(/"\/project\/src\/Foo\.server\.vue"/g) || []).length;
    expect(injectCount).toBe(1);
  });

  it('跳过: 字符串字面量中的 defineServerIsland 调用', () => {
    const code = `
const example = "defineServerIsland(Foo, { rerenderOnPropsChange: true })";
import { defineServerIsland } from 'ubean';
import Foo from './Foo.server.vue';
const FooIsland = defineServerIsland(Foo, { rerenderOnPropsChange: true });
`.trim();
    const result = injectServerComponentPath(code, '/project/src/islands.ts');
    expect(result).not.toBeNull();
    const injectCount = (result!.match(/"\/project\/src\/Foo\.server\.vue"/g) || []).length;
    expect(injectCount).toBe(1);
  });

  it('跳过: JSDoc 中的 defineServerIsland 示例', () => {
    const code = `
/**
 * const FooIsland = defineServerIsland(Foo, { rerenderOnPropsChange: true })
 */
import { defineServerIsland } from 'ubean';
import Foo from './Foo.server.vue';
const FooIsland = defineServerIsland(Foo, { rerenderOnPropsChange: true });
`.trim();
    const result = injectServerComponentPath(code, '/project/src/islands.ts');
    expect(result).not.toBeNull();
    const injectCount = (result!.match(/"\/project\/src\/Foo\.server\.vue"/g) || []).length;
    expect(injectCount).toBe(1);
  });

  it('跳过: 函数声明 function defineServerIsland(', () => {
    const code = `
function defineServerIsland(Comp, opts) { return Comp; }
import { defineServerIsland as dsi } from 'ubean';
import Foo from './Foo.server.vue';
const FooIsland = dsi(Foo, { rerenderOnPropsChange: true });
`.trim();
    // 函数声明 `function defineServerIsland(` 应被跳过;
    // 别名 `dsi(Foo, ...)` 不匹配 `defineServerIsland(` 正则,也不注入
    const result = injectServerComponentPath(code, '/project/src/islands.ts');
    // 没有真实可注入的 defineServerIsland( 调用 → 返回 null
    expect(result).toBeNull();
  });

  it('处理多个 defineServerIsland 调用 (从后向前注入,索引不偏移)', () => {
    const code = `
import { defineServerIsland } from 'ubean';
import Foo from './Foo.server.vue';
import Bar from './Bar.server.vue';
const FooIsland = defineServerIsland(Foo, { rerenderOnPropsChange: true });
const BarIsland = defineServerIsland(Bar, { rerenderOnPropsChange: true });
`.trim();
    const result = injectServerComponentPath(code, '/project/src/islands.ts');
    expect(result).not.toBeNull();
    expect(result).toContain('"/project/src/Foo.server.vue"');
    expect(result).toContain('"/project/src/Bar.server.vue"');
  });

  it('解析 bare specifier import 不注入 (路径原样保留,但通常不是 .server.vue)', () => {
    // bare specifier (如 'some-lib') 不会被 resolveIslandImportPath 转为绝对路径
    // 仍会注入,只是路径是 bare specifier
    const code = `
import { defineServerIsland } from 'ubean';
import Comp from 'some-lib';
const Island = defineServerIsland(Comp, { rerenderOnPropsChange: true });
`.trim();
    const result = injectServerComponentPath(code, '/project/src/islands.ts');
    expect(result).not.toBeNull();
    expect(result).toContain(', "some-lib"');
  });

  it('无 defineServerIsland 调用返回 null', () => {
    const code = `import Foo from './Foo.vue'; const x = 1;`;
    const result = injectServerComponentPath(code, '/project/src/islands.ts');
    expect(result).toBeNull();
  });

  it('处理嵌套对象选项 (rerenderOnPropsChange 在对象中)', () => {
    const code = `
import { defineServerIsland } from 'ubean';
import Foo from './Foo.server.vue';
const FooIsland = defineServerIsland(Foo, { fallback: 'Loading', rerenderOnPropsChange: true });
`.trim();
    const result = injectServerComponentPath(code, '/project/src/islands.ts');
    expect(result).not.toBeNull();
    expect(result).toContain('"/project/src/Foo.server.vue"');
  });
});

// ============== Task 9.4: Vite 插件 transform 集成 ==============

describe('Task 9.4: Vite plugin transform integration', () => {
  function getPlugin(): any {
    const plugin = ubeanIslandsPlugin() as any;
    plugin.configResolved({ root: '/project' }, {});
    return plugin;
  }

  it('.ts 文件: transform 注入 defineServerIsland 路径', () => {
    const plugin = getPlugin();
    const code = `
import { defineServerIsland } from 'ubean';
import Foo from './Foo.server.vue';
export const FooIsland = defineServerIsland(Foo, { rerenderOnPropsChange: true });
`.trim();
    const result = plugin.transform(code, '/project/src/islands.ts');
    expect(result).not.toBeNull();
    expect(result.code).toContain('"/project/src/Foo.server.vue"');
  });

  it('.ts 文件无 defineServerIsland: transform 返回 null', () => {
    const plugin = getPlugin();
    const code = `import Foo from './Foo.vue'; const x = 1;`;
    const result = plugin.transform(code, '/project/src/normal.ts');
    expect(result).toBeNull();
  });

  it('.vue SFC: transform 同时处理 .server.vue 模板包裹 + defineServerIsland 注入', () => {
    const plugin = getPlugin();
    const code = `<script setup>
import { defineServerIsland } from 'ubean';
import Foo from './Foo.server.vue';
const FooIsland = defineServerIsland(Foo, { rerenderOnPropsChange: true });
</script>
<template><div>content</div></template>`;
    // 注意: 这个 .vue 文件本身不是 .server.vue,所以模板不会被包裹
    // 但 defineServerIsland 调用应被注入
    const result = plugin.transform(code, '/project/src/page.vue');
    expect(result).not.toBeNull();
    expect(result.code).toContain('"/project/src/Foo.server.vue"');
  });

  it('.ts 文件带子查询 (?vue) 不处理', () => {
    const plugin = getPlugin();
    const code = `defineServerIsland(Foo, { rerenderOnPropsChange: true });`;
    const result = plugin.transform(code, '/project/src/Foo.vue?vue&type=script&lang.ts');
    // ?vue 子查询不处理 (id.includes('?') 为 true → isTs 为 false, isVue 也为 false)
    expect(result).toBeNull();
  });
});

// ============== Task 9.4: 全局服务端组件注册表 ==============

describe('Task 9.4: server component registry', () => {
  beforeEach(() => {
    _clearServerComponentRegistry();
  });

  it('registerServerComponent 注册组件,getServerComponent 取出', () => {
    const Comp = defineComponent({ name: 'Test', setup: () => () => h('div', 'test') });
    registerServerComponent('/abs/path.vue', Comp);
    expect(getServerComponent('/abs/path.vue')).toBe(Comp);
  });

  it('getServerComponent 未注册返回 undefined', () => {
    expect(getServerComponent('/not/registered.vue')).toBeUndefined();
  });

  it('_clearServerComponentRegistry 清空注册表', () => {
    const Comp = defineComponent({ name: 'Test', setup: () => () => h('div') });
    registerServerComponent('/path.vue', Comp);
    expect(getServerComponent('/path.vue')).toBeDefined();
    _clearServerComponentRegistry();
    expect(getServerComponent('/path.vue')).toBeUndefined();
  });
});

// ============== Task 9.4: defineServerIsland runtime ==============

describe('Task 9.4: defineServerIsland runtime (rerenderOnPropsChange)', () => {
  beforeEach(() => {
    _clearServerComponentRegistry();
  });

  async function renderHtml(Comp: any, props?: any): Promise<string> {
    const Root = defineComponent({
      setup() {
        return () => h(Comp, props);
      }
    });
    return renderToString(h(Root));
  }

  it('rerenderOnPropsChange: true + path → SSR 端注册组件到全局注册表', () => {
    const Comp = defineComponent({ name: 'Dashboard', setup: () => () => h('div', 'dashboard') });
    defineServerIsland(Comp, { rerenderOnPropsChange: true }, '/abs/Dashboard.server.vue');
    expect(getServerComponent('/abs/Dashboard.server.vue')).toBe(Comp);
  });

  it('rerenderOnPropsChange: true 但无 path → 不注册,退化为默认行为', () => {
    const Comp = defineComponent({ name: 'Dashboard', setup: () => () => h('div') });
    defineServerIsland(Comp, { rerenderOnPropsChange: true });
    expect(getServerComponent('/any')).toBeUndefined();
  });

  it('rerenderOnPropsChange: false → 不注册', () => {
    const Comp = defineComponent({ name: 'Dashboard', setup: () => () => h('div') });
    defineServerIsland(Comp, { rerenderOnPropsChange: false }, '/abs/path.vue');
    expect(getServerComponent('/abs/path.vue')).toBeUndefined();
  });

  it('无 rerenderOnPropsChange 选项 → 不注册 (默认行为)', () => {
    const Comp = defineComponent({ name: 'Dashboard', setup: () => () => h('div') });
    defineServerIsland(Comp, { fallback: 'Loading' }, '/abs/path.vue');
    expect(getServerComponent('/abs/path.vue')).toBeUndefined();
  });

  it('rerenderOnPropsChange: true + path → SSR 渲染 <ubean-server-island> 容器 + 内容', async () => {
    const Comp = defineComponent({ name: 'Dashboard', setup: () => () => h('div', 'real content') });
    const Island = defineServerIsland(Comp, { rerenderOnPropsChange: true }, '/abs/Dashboard.server.vue');
    const html = await renderHtml(Island);
    expect(html).toContain('<ubean-server-island');
    expect(html).toContain('real content');
  });

  it('默认行为 (无 rerender) → 不渲染 <ubean-server-island> 容器', async () => {
    const Comp = defineComponent({ name: 'Dashboard', setup: () => () => h('div', 'content') });
    const Island = defineServerIsland(Comp, { fallback: 'Loading' });
    const html = await renderHtml(Island);
    expect(html).not.toContain('<ubean-server-island');
    expect(html).toContain('content');
  });

  it('rerenderOnPropsChange: 透传 attrs 给内部组件 (SSR)', async () => {
    const Comp = defineComponent({
      name: 'Dashboard',
      props: { userId: { type: Number, default: 0 } },
      setup: (props: any) => () => h('div', `user=${props.userId}`)
    });
    const Island = defineServerIsland(Comp, { rerenderOnPropsChange: true }, '/abs/Dashboard.server.vue');
    const html = await renderHtml(Island, { userId: 42 });
    expect(html).toContain('user=42');
  });

  it('rerenderOnPropsChange: 透传 slots 给内部组件 (SSR)', async () => {
    const Comp = defineComponent({
      name: 'Dashboard',
      setup:
        (_p: any, { slots }: any) =>
        () =>
          h('div', slots.default?.())
    });
    const Island = defineServerIsland(Comp, { rerenderOnPropsChange: true }, '/abs/Dashboard.server.vue');
    const Root = defineComponent({
      setup() {
        return () => h(Island, null, { default: () => h('span', 'slot content') });
      }
    });
    const html = await renderToString(h(Root));
    expect(html).toContain('slot content');
  });

  it('rerenderOnPropsChange: fallback 仍生效', async () => {
    const Comp = defineComponent({ name: 'Dashboard', setup: () => () => h('div', 'content') });
    const Island = defineServerIsland(
      Comp,
      {
        rerenderOnPropsChange: true,
        fallback: 'Loading...'
      },
      '/abs/Dashboard.server.vue'
    );
    const html = await renderHtml(Island);
    // SSR 渲染真实内容 (Suspense 在 SSR 同步解析时直接输出内容)
    expect(html).toContain('content');
  });
});

// ============== Task 9.4: createServerComponentMiddleware ==============

describe('Task 9.4: createServerComponentMiddleware', () => {
  let app: Hono;

  beforeEach(() => {
    _clearServerComponentRegistry();
    app = new Hono();
    app.on('POST', SERVER_COMPONENT_ENDPOINT, createServerComponentMiddleware());
  });

  async function post(path: string, props: Record<string, unknown>): Promise<Response> {
    return app.request(SERVER_COMPONENT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, props })
    });
  }

  it('200: 注册的组件用 props 重新渲染并返回 HTML', async () => {
    const Comp = defineComponent({
      name: 'Dashboard',
      props: { userId: { type: Number, default: 0 } },
      setup: (props: any) => () => h('div', { class: 'dashboard' }, `user=${props.userId}`)
    });
    registerServerComponent('/abs/Dashboard.server.vue', Comp);

    const res = await post('/abs/Dashboard.server.vue', { userId: 123 });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('class="dashboard"');
    expect(html).toContain('user=123');
  });

  it('200: Content-Type 为 text/html', async () => {
    const Comp = defineComponent({ name: 'C', setup: () => () => h('div', 'hi') });
    registerServerComponent('/c.vue', Comp);
    const res = await post('/c.vue', {});
    expect(res.headers.get('Content-Type')).toContain('text/html');
  });

  it('响应包含 x-ubean-server-component: true 头', async () => {
    const Comp = defineComponent({ name: 'C', setup: () => () => h('div') });
    registerServerComponent('/c.vue', Comp);
    const res = await post('/c.vue', {});
    expect(res.headers.get(SERVER_COMPONENT_RESPONSE_HEADER)).toBe('true');
  });

  it('响应包含 Cache-Control: no-store 头', async () => {
    const Comp = defineComponent({ name: 'C', setup: () => () => h('div') });
    registerServerComponent('/c.vue', Comp);
    const res = await post('/c.vue', {});
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('400: 缺少 path 字段', async () => {
    const res = await app.request(SERVER_COMPONENT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ props: {} })
    });
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain('path');
  });

  it('400: Content-Type 非 application/json', async () => {
    const res = await app.request(SERVER_COMPONENT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'plain text'
    });
    expect(res.status).toBe(400);
  });

  it('400: JSON body 格式错误', async () => {
    const res = await app.request(SERVER_COMPONENT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid json'
    });
    expect(res.status).toBe(400);
  });

  it('404: 组件未注册', async () => {
    const res = await post('/not/registered.vue', {});
    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).toContain('not registered');
    expect(text).toContain('/not/registered.vue');
  });

  it('无 props 字段时使用空对象 {}', async () => {
    const Comp = defineComponent({
      name: 'C',
      setup: () => () => h('div', 'ok')
    });
    registerServerComponent('/c.vue', Comp);
    // 不传 props 字段
    const res = await app.request(SERVER_COMPONENT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: '/c.vue' })
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('ok');
  });

  it('500: 组件渲染抛错时返回 500 + 错误信息', async () => {
    const Comp = defineComponent({
      name: 'Broken',
      setup() {
        return () => {
          throw new Error('render boom');
        };
      }
    });
    registerServerComponent('/broken.vue', Comp);
    const res = await post('/broken.vue', {});
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toContain('render boom');
  });

  it('GET 请求不匹配 (中间件仅处理 POST)', async () => {
    const res = await app.request(SERVER_COMPONENT_ENDPOINT, { method: 'GET' });
    // Hono 对未注册的 GET 返回 404
    expect(res.status).toBe(404);
  });
});

// ============== Task 9.4: 中间件辅助函数 ==============

describe('Task 9.4: middleware helpers', () => {
  it('isServerComponentRequest: POST /__server-component → true', () => {
    const ctx = { req: { method: 'POST', path: SERVER_COMPONENT_ENDPOINT } };
    expect(isServerComponentRequest(ctx as any)).toBe(true);
  });

  it('isServerComponentRequest: GET → false', () => {
    const ctx = { req: { method: 'GET', path: SERVER_COMPONENT_ENDPOINT } };
    expect(isServerComponentRequest(ctx as any)).toBe(false);
  });

  it('isServerComponentRequest: 其他路径 → false', () => {
    const ctx = { req: { method: 'POST', path: '/__actions' } };
    expect(isServerComponentRequest(ctx as any)).toBe(false);
  });

  it('isServerComponentResponse: 带头 → true', () => {
    const res = new Response('', { headers: { [SERVER_COMPONENT_RESPONSE_HEADER]: 'true' } });
    expect(isServerComponentResponse(res)).toBe(true);
  });

  it('isServerComponentResponse: 无头 → false', () => {
    const res = new Response('');
    expect(isServerComponentResponse(res)).toBe(false);
  });
});

// ============== Task 9.4: 端到端 (defineServerIsland + 中间件) ==============

describe('Task 9.4: end-to-end (defineServerIsland + middleware)', () => {
  let app: Hono;

  beforeEach(() => {
    _clearServerComponentRegistry();
    app = new Hono();
    app.on('POST', SERVER_COMPONENT_ENDPOINT, createServerComponentMiddleware());
  });

  it('defineServerIsland 注册的组件可被中间件重新渲染', async () => {
    const Comp = defineComponent({
      name: 'UserCard',
      props: { name: { type: String, default: '' } },
      setup: (props: any) => () => h('div', { class: 'card' }, `Hello, ${props.name}!`)
    });
    // 模拟 SSR 端: defineServerIsland 注册组件
    defineServerIsland(Comp, { rerenderOnPropsChange: true }, '/abs/UserCard.server.vue');
    expect(getServerComponent('/abs/UserCard.server.vue')).toBe(Comp);

    // 模拟客户端 POST 请求重新渲染
    const res = await app.request(SERVER_COMPONENT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: '/abs/UserCard.server.vue', props: { name: 'Alice' } })
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('class="card"');
    expect(html).toContain('Hello, Alice!');
  });
});
