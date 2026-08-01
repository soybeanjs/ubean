import { describe, it, expect } from 'vitest';
import { h, defineComponent, Suspense } from 'vue';
import { renderToString } from 'vue/server-renderer';
import {
  parseScriptImports,
  scanIslandDirectiveNames,
  resolveIslandImportPath,
  collectIslandComponents,
  generateRegistryModule,
  transformVueSfcIslands
} from '../src/vite';
import { defineServerIsland, defineIsland } from '../src/runtime';
import type { ServerIslandOptions, IslandStrategy } from '../src/runtime';
import type { IslandComponentEntry, IslandComponentMap } from '../src/vite';

describe('parseScriptImports', () => {
  it('parses default import', () => {
    const map = parseScriptImports(`import Foo from './Foo.vue'`);
    expect(map.get('Foo')).toBe('./Foo.vue');
  });

  it('parses default import with double quotes', () => {
    const map = parseScriptImports(`import Foo from "some-lib"`);
    expect(map.get('Foo')).toBe('some-lib');
  });

  it('parses default import with named', () => {
    const map = parseScriptImports(`import Foo, { bar, baz } from './Foo.vue'`);
    expect(map.get('Foo')).toBe('./Foo.vue');
  });

  it('parses default import with namespace', () => {
    const map = parseScriptImports(`import Foo, * as ns from './Foo.vue'`);
    expect(map.get('Foo')).toBe('./Foo.vue');
  });

  it('parses { default as Foo } named import', () => {
    const map = parseScriptImports(`import { default as Foo } from './Foo.vue'`);
    expect(map.get('Foo')).toBe('./Foo.vue');
  });

  it('parses { bar, default as Foo } mixed named import', () => {
    const map = parseScriptImports(`import { bar, default as Foo } from './Foo.vue'`);
    expect(map.get('Foo')).toBe('./Foo.vue');
  });

  it('handles aliased named imports (not default)', () => {
    // Aliased non-default imports should NOT be in the map
    // (island components must be default imports or `default as`)
    const map = parseScriptImports(`import { bar as Baz } from './Foo.vue'`);
    expect(map.has('Baz')).toBe(false);
    expect(map.has('bar')).toBe(false);
  });

  it('handles multiple imports', () => {
    const code = `
      import CompA from './CompA.vue';
      import CompB from '../components/CompB.vue';
      import { default as CompC } from './CompC.vue';
    `;
    const map = parseScriptImports(code);
    expect(map.get('CompA')).toBe('./CompA.vue');
    expect(map.get('CompB')).toBe('../components/CompB.vue');
    expect(map.get('CompC')).toBe('./CompC.vue');
  });

  it('handles empty script content', () => {
    expect(parseScriptImports('').size).toBe(0);
  });

  it('first-seen wins for duplicate local names', () => {
    const map = parseScriptImports(`import Foo from './A.vue'; import Foo from './B.vue';`);
    expect(map.get('Foo')).toBe('./A.vue');
  });
});

describe('scanIslandDirectiveNames', () => {
  it('finds self-closing island tags', () => {
    const template = `<IslandCounter v-client.load />`;
    expect(scanIslandDirectiveNames(template)).toEqual(new Set(['IslandCounter']));
  });

  it('finds non-self-closing island tags', () => {
    const template = `<IslandCounter v-client.load></IslandCounter>`;
    expect(scanIslandDirectiveNames(template)).toEqual(new Set(['IslandCounter']));
  });

  it('finds multiple different island components', () => {
    const template = `
      <IslandCounter v-client.load />
      <IslandClock v-client.idle />
      <IslandMedia v-client.media="'(min-width: 768px)'" />
    `;
    expect(scanIslandDirectiveNames(template)).toEqual(new Set(['IslandCounter', 'IslandClock', 'IslandMedia']));
  });

  it('deduplicates same component used with different directives', () => {
    const template = `
      <Foo v-client.load />
      <Foo v-client.idle />
    `;
    expect(scanIslandDirectiveNames(template)).toEqual(new Set(['Foo']));
  });

  it('ignores lowercase HTML tags', () => {
    const template = `<div v-client.load></div>`;
    expect(scanIslandDirectiveNames(template).size).toBe(0);
  });

  it('ignores components without directives', () => {
    const template = `<MyComponent />`;
    expect(scanIslandDirectiveNames(template).size).toBe(0);
  });

  it('does not detect components with legacy client:* syntax (Phase 4: removed)', () => {
    const template = `<OldComp client:load />`;
    expect(scanIslandDirectiveNames(template).size).toBe(0);
  });

  it('handles nested islands', () => {
    const template = `
      <Outer v-client.load>
        <Inner v-client.visible />
      </Outer>
    `;
    expect(scanIslandDirectiveNames(template)).toEqual(new Set(['Outer', 'Inner']));
  });

  it('returns empty set for empty template', () => {
    expect(scanIslandDirectiveNames('').size).toBe(0);
  });
});

describe('resolveIslandImportPath', () => {
  it('resolves relative path against source file directory', () => {
    const result = resolveIslandImportPath('./Foo.vue', '/src/pages/Bar.vue');
    expect(result).toBe('/src/pages/Foo.vue');
  });

  it('resolves parent relative path', () => {
    // dirname('/src/pages/sub/Page.vue') = '/src/pages/sub'
    // resolve('/src/pages/sub', '../components/Foo.vue') = '/src/pages/components/Foo.vue'
    const result = resolveIslandImportPath('../components/Foo.vue', '/src/pages/sub/Page.vue');
    expect(result).toBe('/src/pages/components/Foo.vue');
  });

  it('resolves grandparent relative path', () => {
    const result = resolveIslandImportPath('../../components/Foo.vue', '/src/pages/sub/Page.vue');
    expect(result).toBe('/src/components/Foo.vue');
  });

  it('keeps bare specifier as-is', () => {
    expect(resolveIslandImportPath('vue', '/src/pages/Foo.vue')).toBe('vue');
    expect(resolveIslandImportPath('@soybeanjs/ui', '/src/pages/Foo.vue')).toBe('@soybeanjs/ui');
  });

  it('keeps scoped package specifier as-is', () => {
    expect(resolveIslandImportPath('@ubean/islands', '/src/Foo.vue')).toBe('@ubean/islands');
  });
});

describe('collectIslandComponents', () => {
  it('collects island components from a complete SFC', () => {
    const sfc = `
<script setup lang="ts">
import IslandCounter from '../components/IslandCounter.vue';
import IslandMedia from '../components/IslandMedia.vue';
</script>

<template>
  <div>
    <IslandCounter v-client.load />
    <IslandMedia v-client.media="'(min-width: 768px)'" />
  </div>
</template>
    `;
    const entries = collectIslandComponents(sfc, '/src/pages/test.vue');
    expect(entries).toHaveLength(2);
    expect(entries.map(e => e.name).sort()).toEqual(['IslandCounter', 'IslandMedia']);
    // import paths should be resolved to absolute
    expect(entries.find(e => e.name === 'IslandCounter')?.importPath).toBe('/src/components/IslandCounter.vue');
    expect(entries.find(e => e.name === 'IslandMedia')?.importPath).toBe('/src/components/IslandMedia.vue');
  });

  it('returns empty array when no directives in template', () => {
    const sfc = `
<script setup lang="ts">
import Foo from './Foo.vue';
</script>
<template><Foo /></template>
    `;
    expect(collectIslandComponents(sfc, '/src/pages/test.vue')).toEqual([]);
  });

  it('returns empty array when no template block', () => {
    const sfc = `<script setup>import Foo from './Foo.vue';</script>`;
    expect(collectIslandComponents(sfc, '/src/pages/test.vue')).toEqual([]);
  });

  it('handles plain <script> block (not setup)', () => {
    const sfc = `
<script>
import IslandCounter from './IslandCounter.vue';
export default { components: { IslandCounter } };
</script>
<template><IslandCounter v-client.load /></template>
    `;
    const entries = collectIslandComponents(sfc, '/src/pages/test.vue');
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe('IslandCounter');
  });

  it('skips island components without static import (warns)', () => {
    const originalWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (msg: string) => warnings.push(msg);

    const sfc = `
<script setup lang="ts">
// No import for GloballyRegistered
</script>
<template>
  <GloballyRegistered v-client.load />
  <IslandCounter v-client.load />
  <IslandCounter2 v-client.idle />
</template>
    `;
    // Note: GloballyRegistered has no import → should be skipped with warning
    // IslandCounter and IslandCounter2 also have no import → also skipped
    const entries = collectIslandComponents(sfc, '/src/pages/test.vue');
    expect(entries).toEqual([]);
    expect(warnings.length).toBe(3); // All three have no import

    console.warn = originalWarn;
  });

  it('handles same component used with multiple directives', () => {
    const sfc = `
<script setup lang="ts">
import Foo from './Foo.vue';
</script>
<template>
  <Foo v-client.load />
  <Foo v-client.idle />
</template>
    `;
    const entries = collectIslandComponents(sfc, '/src/pages/test.vue');
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe('Foo');
  });

  it('does not collect components using legacy client:* syntax (Phase 4: removed)', () => {
    const sfc = `
<script setup lang="ts">
import Foo from './Foo.vue';
</script>
<template>
  <Foo client:load />
</template>
    `;
    const entries = collectIslandComponents(sfc, '/src/pages/test.vue');
    expect(entries).toEqual([]);
  });
});

describe('generateRegistryModule', () => {
  it('generates empty registry for empty map', () => {
    const map: IslandComponentMap = new Map();
    expect(generateRegistryModule(map)).toBe('export const islands = {};');
  });

  it('generates correct imports and exports', () => {
    const map: IslandComponentMap = new Map<string, IslandComponentEntry>([
      [
        'IslandCounter',
        { name: 'IslandCounter', importPath: '/src/components/IslandCounter.vue', sourceFile: '/src/pages/test.vue' }
      ],
      [
        'IslandMedia',
        { name: 'IslandMedia', importPath: '/src/components/IslandMedia.vue', sourceFile: '/src/pages/test.vue' }
      ]
    ]);
    const code = generateRegistryModule(map);

    // Should import both components
    expect(code).toContain(`import __island_0 from "/src/components/IslandCounter.vue";`);
    expect(code).toContain(`import __island_1 from "/src/components/IslandMedia.vue";`);

    // Should export both in the islands object
    expect(code).toContain(`"IslandCounter": __island_0`);
    expect(code).toContain(`"IslandMedia": __island_1`);

    // Should be valid module structure
    expect(code).toContain('export const islands = {');
    expect(code.trim().endsWith('};')).toBe(true);
  });

  it('handles bare specifiers (node_modules)', () => {
    const map: IslandComponentMap = new Map<string, IslandComponentEntry>([
      ['ExternalComp', { name: 'ExternalComp', importPath: 'some-lib', sourceFile: '/src/pages/test.vue' }]
    ]);
    const code = generateRegistryModule(map);
    expect(code).toContain(`import __island_0 from "some-lib";`);
    expect(code).toContain(`"ExternalComp": __island_0`);
  });

  it('generates syntactically valid object with commas between entries (regression)', () => {
    // Regression: entries must be separated by commas, otherwise the generated
    // virtual module fails to parse with "Expected `,` or `}`" when >1 island.
    const map: IslandComponentMap = new Map<string, IslandComponentEntry>([
      ['IslandCounter', { name: 'IslandCounter', importPath: '/src/a.vue', sourceFile: '/src/pages/test.vue' }],
      ['IslandClock', { name: 'IslandClock', importPath: '/src/b.vue', sourceFile: '/src/pages/test.vue' }],
      ['IslandVisibility', { name: 'IslandVisibility', importPath: '/src/c.vue', sourceFile: '/src/pages/test.vue' }]
    ]);
    const code = generateRegistryModule(map);

    // Extract the islands object body and verify each entry ends with a comma.
    const bodyMatch = code.match(/export const islands = \{([\s\S]*)\};/);
    expect(bodyMatch).not.toBeNull();
    const body = bodyMatch![1].trim();
    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      if (trimmed) {
        expect(trimmed.endsWith(',')).toBe(true);
      }
    }

    // Sanity check: the object literal (with placeholder values) must parse as valid JS.
    const objLiteral = `{${body.replace(/__island_\d+/g, 'null')}}`;
    expect(() => JSON.parse(objLiteral.replace(/'/g, '"').replace(/,(\s*[}\]])/g, '$1'))).not.toThrow();
  });
});

describe('transformVueSfcIslands (integration with collection)', () => {
  it('still transforms template correctly alongside collection', () => {
    const sfc = `
<template>
  <div>
    <IslandCounter v-client.load />
  </div>
</template>
    `;
    const result = transformVueSfcIslands(sfc, 'test.vue');
    expect(result.islandCount).toBe(1);
    expect(result.code).toContain('<ubean-island');
    expect(result.code).toContain('data-component="IslandCounter"');
    expect(result.code).toContain('data-directive="client:load"');
  });
});

describe('P9-04: defineServerIsland runtime (replaces server:defer directive)', () => {
  /**
   * 用 SSR `renderToString` 渲染组件并返回 HTML 字符串。
   *
   * 同步组件会立即解析,Suspense 不会进入 fallback 分支,因此对 fallback
   * 行为的断言通过手动调用 wrapper setup 的 render 函数来验证(见
   * `getWrapperVdom` 辅助函数)。
   */
  async function renderHtml(Comp: any, props?: any, slots?: any): Promise<string> {
    const Root = defineComponent({
      setup() {
        return () => h(Comp, props, slots);
      }
    });
    return renderToString(h(Root));
  }

  /**
   * 直接调用 wrapper 组件的 setup 函数,获取其 render 函数,再调用 render
   * 函数得到 vdom。这样可以断言 Suspense 的 slot 结构(default + fallback)。
   */
  function getWrapperVdom(Wrapped: any, ctxOverrides: Record<string, unknown> = {}) {
    const setupFn = Wrapped.setup;
    const slots = (ctxOverrides.slots as any) ?? {};
    const attrs = (ctxOverrides.attrs as any) ?? {};
    const renderFn = setupFn({}, { slots, attrs, emit: () => {}, expose: () => {} });
    return renderFn();
  }

  it('returns a Vue component (object with setup)', () => {
    const Inner = defineComponent({ name: 'Inner', setup: () => () => h('div', 'hi') });
    const Wrapped = defineServerIsland(Inner);
    expect(typeof Wrapped).toBe('object');
    expect(Wrapped).toHaveProperty('setup');
  });

  it('wraps the inner component in a <Suspense> boundary', () => {
    const Inner = defineComponent({ name: 'Inner', setup: () => () => h('div', 'inner') });
    const Wrapped = defineServerIsland(Inner) as any;
    const vdom = getWrapperVdom(Wrapped);
    expect(vdom.type).toBe(Suspense);
    expect(vdom.children).toHaveProperty('default');
    expect(vdom.children).toHaveProperty('fallback');
  });

  it('uses default <ubean-defer-fallback> placeholder when no fallback provided', () => {
    const Inner = defineComponent({ name: 'Inner', setup: () => () => h('div', 'inner') });
    const Wrapped = defineServerIsland(Inner) as any;
    const vdom = getWrapperVdom(Wrapped);
    expect(vdom.type).toBe(Suspense);
    const fallbackVnode = vdom.children.fallback();
    // Default fallback renders `h('ubean-defer-fallback')` → vnode with type 'ubean-defer-fallback'
    expect(fallbackVnode.type).toBe('ubean-defer-fallback');
  });

  it('accepts a string fallback (rendered as static text)', () => {
    const Inner = defineComponent({ name: 'Inner', setup: () => () => h('div', 'inner') });
    const Wrapped = defineServerIsland(Inner, { fallback: 'Loading dashboard...' } as ServerIslandOptions) as any;
    const vdom = getWrapperVdom(Wrapped);
    const fallbackVnode = vdom.children.fallback();
    // String fallback returns the string directly (Vue renders as text node)
    expect(fallbackVnode).toBe('Loading dashboard...');
  });

  it('accepts a Vue component fallback (rendered as vnode)', () => {
    const Inner = defineComponent({ name: 'Inner', setup: () => () => h('div', 'inner') });
    const Fallback = defineComponent({
      name: 'Fallback',
      setup: () => () => h('div', { class: 'spinner' }, 'Loading...')
    });
    const Wrapped = defineServerIsland(Inner, { fallback: Fallback }) as any;
    const vdom = getWrapperVdom(Wrapped);
    const fallbackVnode = vdom.children.fallback();
    // Component fallback wraps the component in a vnode
    expect(fallbackVnode.type).toBe(Fallback);
  });

  it('forwards attrs (props) to the inner component', () => {
    const Inner = defineComponent({
      name: 'Inner',
      props: { userId: { type: Number, default: 0 } },
      setup(props) {
        return () => h('div', `userId=${props.userId}`);
      }
    });
    const Wrapped = defineServerIsland(Inner) as any;
    const vdom = getWrapperVdom(Wrapped, { attrs: { userId: 123 } });
    expect(vdom.type).toBe(Suspense);
    const defaultVnode = vdom.children.default();
    expect(defaultVnode.type).toBe(Inner);
    expect(defaultVnode.props).toMatchObject({ userId: 123 });
  });

  it('forwards slots to the inner component', () => {
    const Inner = defineComponent({
      name: 'Inner',
      setup(_, { slots }) {
        return () => h('div', slots.default?.());
      }
    });
    const SlotContent = defineComponent({
      name: 'SlotContent',
      setup: () => () => h('span', 'slot-content')
    });
    const Wrapped = defineServerIsland(Inner) as any;
    const vdom = getWrapperVdom(Wrapped, {
      slots: { default: () => h(SlotContent) }
    });
    const defaultVnode = vdom.children.default();
    expect(defaultVnode.type).toBe(Inner);
    // The Inner vnode should have received the default slot
    expect(defaultVnode.children).toBeTruthy();
    expect(defaultVnode.children).toHaveProperty('default');
  });

  it('renders the inner component content via SSR (sync component resolves immediately)', async () => {
    const Inner = defineComponent({
      name: 'Inner',
      setup: () => () => h('div', { class: 'inner' }, 'rendered-content')
    });
    const Wrapped = defineServerIsland(Inner);
    const html = await renderHtml(Wrapped);
    // Inner content is rendered inside the Suspense boundary
    expect(html).toContain('class="inner"');
    expect(html).toContain('rendered-content');
    // No fallback placeholder is emitted (sync component resolves immediately)
    expect(html).not.toContain('ubean-defer-fallback');
  });

  it('sets inheritAttrs: false so attrs are not duplicated on root', () => {
    const Inner = defineComponent({ name: 'Inner', setup: () => () => h('div', 'inner') });
    const Wrapped = defineServerIsland(Inner) as any;
    expect(Wrapped.inheritAttrs).toBe(false);
  });

  it('names the wrapper component "ServerIsland"', () => {
    const Inner = defineComponent({ name: 'Inner', setup: () => () => h('div', 'inner') });
    const Wrapped = defineServerIsland(Inner) as any;
    expect(Wrapped.name).toBe('ServerIsland');
  });
});

describe('transformVueSfcIslands: server:defer is no longer transformed (Phase 3)', () => {
  // After Phase 3 refactor, `server:defer` is removed entirely.
  // Users migrate to `defineServerIsland()` runtime wrapper.

  it('returns code unchanged when only server:defer is present (no v-client.* directive)', () => {
    const sfc = `<template><SlowComp server:defer /></template>`;
    const result = transformVueSfcIslands(sfc, 'test.vue');
    // No transform applied — `server:defer` is treated as a regular attribute
    expect(result.islandCount).toBe(0);
    expect(result.code).toBe(sfc);
  });

  it('does not register server:defer components in the client island registry', () => {
    const sfc = `<script setup>import SlowComp from './SlowComp.vue';</script>
<template><SlowComp server:defer /></template>`;
    const entries = collectIslandComponents(sfc, '/src/pages/test.vue');
    expect(entries).toHaveLength(0);
  });

  it('returns empty when template has no directives', () => {
    const sfc = `<template><div>plain content</div></template>`;
    const result = transformVueSfcIslands(sfc, 'test.vue');
    expect(result.islandCount).toBe(0);
    expect(result.code).toBe(sfc);
  });
});

describe('Phase 4: defineIsland runtime (programmatic alternative to v-client.*)', () => {
  /**
   * 直接调用 wrapper 组件的 setup 函数,获取其 render 函数,再调用 render
   * 函数得到 vdom。这样可以断言 `<ubean-island>` 元素的属性结构。
   */
  function getWrapperVdom(Wrapped: any, ctxOverrides: Record<string, unknown> = {}) {
    const setupFn = Wrapped.setup;
    const slots = (ctxOverrides.slots as any) ?? {};
    const attrs = (ctxOverrides.attrs as any) ?? {};
    const renderFn = setupFn({}, { slots, attrs, emit: () => {}, expose: () => {} });
    return renderFn();
  }

  it('returns a Vue component (object with setup)', () => {
    const Inner = defineComponent({ name: 'Inner', setup: () => () => h('div', 'hi') });
    const Wrapped = defineIsland(Inner, 'load');
    expect(typeof Wrapped).toBe('object');
    expect(Wrapped).toHaveProperty('setup');
  });

  it('renders a <ubean-island> element with data-directive="client:load"', () => {
    const Inner = defineComponent({ name: 'Counter', setup: () => () => h('div', 'count') });
    const Wrapped = defineIsland(Inner, 'load') as any;
    const vdom = getWrapperVdom(Wrapped);
    expect(vdom.type).toBe('ubean-island');
    expect(vdom.props['data-directive']).toBe('client:load');
    expect(vdom.props['data-component']).toBe('Counter');
    expect(vdom.props['data-island-id']).toBe('island-runtime-load');
  });

  it('renders correct data-directive for each strategy', () => {
    const Inner = defineComponent({ name: 'Inner', setup: () => () => h('div', 'x') });
    const strategies: IslandStrategy[] = ['load', 'idle', 'visible', 'media', 'only'];
    for (const s of strategies) {
      const Wrapped = defineIsland(Inner, s) as any;
      const vdom = getWrapperVdom(Wrapped);
      expect(vdom.props['data-directive']).toBe(`client:${s}`);
    }
  });

  it('adds data-media attribute for media strategy', () => {
    const Inner = defineComponent({ name: 'Inner', setup: () => () => h('div', 'x') });
    const Wrapped = defineIsland(Inner, 'media', { mediaQuery: '(max-width: 768px)' }) as any;
    const vdom = getWrapperVdom(Wrapped);
    expect(vdom.props['data-directive']).toBe('client:media');
    expect(vdom.props['data-media']).toBe('(max-width: 768px)');
  });

  it('does not add data-media when mediaQuery is omitted for media strategy', () => {
    const Inner = defineComponent({ name: 'Inner', setup: () => () => h('div', 'x') });
    const Wrapped = defineIsland(Inner, 'media') as any;
    const vdom = getWrapperVdom(Wrapped);
    expect(vdom.props['data-directive']).toBe('client:media');
    expect(vdom.props['data-media']).toBeUndefined();
  });

  it('serializes static props to data-props attribute', () => {
    const Inner = defineComponent({ name: 'Inner', setup: () => () => h('div', 'x') });
    const Wrapped = defineIsland(Inner, 'load', { props: { count: 5, label: 'hi' } }) as any;
    const vdom = getWrapperVdom(Wrapped);
    const propsJson = vdom.props['data-props'];
    expect(propsJson).toBeTruthy();
    const decoded = JSON.parse(propsJson.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<'));
    expect(decoded).toEqual({ count: 5, label: 'hi' });
  });

  it('merges attrs over static props (attrs win)', () => {
    const Inner = defineComponent({ name: 'Inner', setup: () => () => h('div', 'x') });
    const Wrapped = defineIsland(Inner, 'load', { props: { count: 1 } }) as any;
    const vdom = getWrapperVdom(Wrapped, { attrs: { count: 99, title: 'overridden' } });
    const propsJson = vdom.props['data-props'];
    const decoded = JSON.parse(propsJson.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<'));
    expect(decoded.count).toBe(99); // attrs override static props
    expect(decoded.title).toBe('overridden');
  });

  it('renders inner component as child for non-only strategies', () => {
    const Inner = defineComponent({ name: 'Inner', setup: () => () => h('div', 'inner') });
    const Wrapped = defineIsland(Inner, 'load') as any;
    const vdom = getWrapperVdom(Wrapped);
    // ubean-island should have inner component as child vnode (Vue may
    // normalize children to an array, so check both forms).
    expect(vdom.children).toBeTruthy();
    const child = Array.isArray(vdom.children) ? vdom.children[0] : vdom.children;
    expect(child.type).toBe(Inner);
  });

  it('does NOT render inner component for only strategy (SSR placeholder empty)', () => {
    const Inner = defineComponent({ name: 'Inner', setup: () => () => h('div', 'inner') });
    const Wrapped = defineIsland(Inner, 'only') as any;
    const vdom = getWrapperVdom(Wrapped);
    expect(vdom.props['data-directive']).toBe('client:only');
    // children should be null (no SSR rendering for client:only)
    expect(vdom.children).toBeNull();
  });

  it('sets inheritAttrs: false so attrs are not duplicated on root', () => {
    const Inner = defineComponent({ name: 'Inner', setup: () => () => h('div', 'inner') });
    const Wrapped = defineIsland(Inner, 'load') as any;
    expect(Wrapped.inheritAttrs).toBe(false);
  });

  it('names the wrapper component "ClientIsland"', () => {
    const Inner = defineComponent({ name: 'Inner', setup: () => () => h('div', 'inner') });
    const Wrapped = defineIsland(Inner, 'load') as any;
    expect(Wrapped.name).toBe('ClientIsland');
  });

  it('falls back to "AnonymousIsland" when Component has no name', () => {
    const Inner = defineComponent({ setup: () => () => h('div', 'inner') });
    const Wrapped = defineIsland(Inner, 'load') as any;
    const vdom = getWrapperVdom(Wrapped);
    expect(vdom.props['data-component']).toBe('AnonymousIsland');
  });

  it('renders inner component via SSR (sync component resolves immediately)', async () => {
    const Inner = defineComponent({
      name: 'Inner',
      setup: () => () => h('div', { class: 'inner' }, 'rendered-content')
    });
    const Wrapped = defineIsland(Inner, 'load');
    const Root = defineComponent({
      setup() {
        return () => h(Wrapped);
      }
    });
    const html = await renderToString(h(Root));
    // ubean-island wraps the rendered inner content
    expect(html).toContain('<ubean-island');
    expect(html).toContain('data-directive="client:load"');
    expect(html).toContain('class="inner"');
    expect(html).toContain('rendered-content');
  });
});
