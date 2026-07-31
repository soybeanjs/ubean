import { describe, it, expect } from 'vitest';
import {
  parseScriptImports,
  scanIslandDirectiveNames,
  resolveIslandImportPath,
  collectIslandComponents,
  generateRegistryModule,
  transformVueSfcIslands,
  SERVER_DEFER_DIRECTIVE
} from '../src/vite';
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
    const template = `<IslandCounter client:load />`;
    expect(scanIslandDirectiveNames(template)).toEqual(new Set(['IslandCounter']));
  });

  it('finds non-self-closing island tags', () => {
    const template = `<IslandCounter client:load></IslandCounter>`;
    expect(scanIslandDirectiveNames(template)).toEqual(new Set(['IslandCounter']));
  });

  it('finds multiple different island components', () => {
    const template = `
      <IslandCounter client:load />
      <IslandClock client:idle />
      <IslandMedia client:media="(min-width: 768px)" />
    `;
    expect(scanIslandDirectiveNames(template)).toEqual(new Set(['IslandCounter', 'IslandClock', 'IslandMedia']));
  });

  it('deduplicates same component used with different directives', () => {
    const template = `
      <Foo client:load />
      <Foo client:idle />
    `;
    expect(scanIslandDirectiveNames(template)).toEqual(new Set(['Foo']));
  });

  it('ignores lowercase HTML tags', () => {
    const template = `<div client:load></div>`;
    expect(scanIslandDirectiveNames(template).size).toBe(0);
  });

  it('ignores components without directives', () => {
    const template = `<MyComponent />`;
    expect(scanIslandDirectiveNames(template).size).toBe(0);
  });

  it('handles nested islands', () => {
    const template = `
      <Outer client:load>
        <Inner client:visible />
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
    <IslandCounter client:load />
    <IslandMedia client:media="(min-width: 768px)" />
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
<template><IslandCounter client:load /></template>
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
  <GloballyRegistered client:load />
  <IslandCounter client:load />
  <IslandCounter2 client:idle />
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
  <Foo client:load />
  <Foo client:idle />
</template>
    `;
    const entries = collectIslandComponents(sfc, '/src/pages/test.vue');
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe('Foo');
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
    <IslandCounter client:load />
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

describe('P9-04: server:defer directive transform', () => {
  it('wraps a self-closing server:defer component in <Suspense>', () => {
    const sfc = `<template><SlowComp server:defer /></template>`;
    const result = transformVueSfcIslands(sfc, 'test.vue');
    // The component is wrapped in <Suspense> with a default fallback
    expect(result.code).toContain('<Suspense>');
    expect(result.code).toContain('</Suspense>');
    // Default fallback placeholder
    expect(result.code).toContain('<ubean-defer-fallback');
    expect(result.code).toContain('data-component="SlowComp"');
    // The `server:defer` attribute is stripped from the component tag
    expect(result.code).not.toContain('server:defer');
    // The original component tag is preserved inside the Suspense
    expect(result.code).toContain('<SlowComp');
    // No client island registration happens for server:defer
    expect(result.code).not.toContain('<ubean-island');
    // islandCount stays 0 (server:defer is not a client island)
    expect(result.islandCount).toBe(0);
  });

  it('wraps a non-self-closing server:defer component', () => {
    const sfc = `<template><SlowComp server:defer></SlowComp></template>`;
    const result = transformVueSfcIslands(sfc, 'test.vue');
    expect(result.code).toContain('<Suspense>');
    expect(result.code).toContain('<SlowComp');
    expect(result.code).toContain('</SlowComp>');
    expect(result.code).toContain('</Suspense>');
  });

  it('extracts inline #fallback slot to the Suspense wrapper', () => {
    const sfc = `<template>
  <Dashboard server:defer>
    <template #fallback>Loading dashboard...</template>
    <Stats />
  </Dashboard>
</template>`;
    const result = transformVueSfcIslands(sfc, 'test.vue');
    // Suspense wraps the component
    expect(result.code).toContain('<Suspense>');
    // The fallback slot content is moved to the Suspense #fallback slot
    expect(result.code).toContain('Loading dashboard...');
    // The <template #fallback> is no longer inside the Dashboard component
    const dashboardInner = result.code.match(/<Dashboard[^>]*>([\s\S]*?)<\/Dashboard>/)?.[1] ?? '';
    expect(dashboardInner).not.toContain('#fallback');
    expect(dashboardInner).not.toContain('Loading dashboard...');
    // The default content (<Stats />) stays inside Dashboard
    expect(dashboardInner).toContain('<Stats');
    // No default placeholder since inline fallback was provided
    expect(result.code).not.toContain('<ubean-defer-fallback');
  });

  it('uses default fallback when no inline #fallback slot provided', () => {
    const sfc = `<template><SlowComp server:defer /></template>`;
    const result = transformVueSfcIslands(sfc, 'test.vue');
    expect(result.code).toContain('<ubean-defer-fallback');
    expect(result.code).toContain('data-component="SlowComp"');
  });

  it('preserves other props and attributes on the deferred component', () => {
    const sfc = `<template><SlowComp server:defer class="my-class" id="s1" /></template>`;
    const result = transformVueSfcIslands(sfc, 'test.vue');
    // The component still has its other attributes (server:defer is stripped)
    expect(result.code).toContain('class="my-class"');
    expect(result.code).toContain('id="s1"');
    expect(result.code).not.toContain('server:defer');
  });

  it('handles multiple server:defer components in the same template', () => {
    const sfc = `<template>
  <div>
    <CompA server:defer />
    <CompB server:defer />
  </div>
</template>`;
    const result = transformVueSfcIslands(sfc, 'test.vue');
    // Two Suspense wrappers
    const suspenseCount = (result.code.match(/<Suspense>/g) || []).length;
    expect(suspenseCount).toBe(2);
    // Both components wrapped
    expect(result.code).toContain('data-component="CompA"');
    expect(result.code).toContain('data-component="CompB"');
  });

  it('handles nested server:defer components', () => {
    const sfc = `<template>
  <Outer server:defer>
    <Inner server:defer />
  </Outer>
</template>`;
    const result = transformVueSfcIslands(sfc, 'test.vue');
    // Outer is wrapped in Suspense
    expect(result.code).toContain('<Suspense>');
    // Inner is also wrapped (nested transform)
    const suspenseCount = (result.code.match(/<Suspense>/g) || []).length;
    expect(suspenseCount).toBe(2);
  });

  it('coexists with client:* directives in the same template', () => {
    const sfc = `<template>
  <div>
    <ClientIsland client:load />
    <ServerDeferred server:defer />
  </div>
</template>`;
    const result = transformVueSfcIslands(sfc, 'test.vue');
    // Client island is converted to <ubean-island>
    expect(result.code).toContain('<ubean-island');
    expect(result.code).toContain('data-component="ClientIsland"');
    expect(result.code).toContain('data-directive="client:load"');
    // Server deferred is wrapped in <Suspense>
    expect(result.code).toContain('<Suspense>');
    expect(result.code).toContain('data-component="ServerDeferred"');
    // islandCount counts only client islands
    expect(result.islandCount).toBe(1);
  });

  it('does not register server:defer components in the client island registry', () => {
    // collectIslandComponents should not pick up server:defer (only client:*)
    const sfc = `<script setup>import SlowComp from './SlowComp.vue';</script>
<template><SlowComp server:defer /></template>`;
    const entries = collectIslandComponents(sfc, '/src/pages/test.vue');
    expect(entries).toHaveLength(0);
  });

  it('exports SERVER_DEFER_DIRECTIVE constant', () => {
    expect(SERVER_DEFER_DIRECTIVE).toBe('server:defer');
  });

  it('returns empty when template has no directives', () => {
    const sfc = `<template><div>plain content</div></template>`;
    const result = transformVueSfcIslands(sfc, 'test.vue');
    expect(result.islandCount).toBe(0);
    expect(result.code).toBe(sfc);
  });

  it('preserves template attributes (e.g. lang)', () => {
    const sfc = `<template lang="ts"><SlowComp server:defer /></template>`;
    const result = transformVueSfcIslands(sfc, 'test.vue');
    expect(result.code).toContain('<template lang="ts">');
    expect(result.code).toContain('<Suspense>');
  });
});
