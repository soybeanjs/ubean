import { describe, it, expect } from 'vitest';
import {
  parseScriptImports,
  scanIslandDirectiveNames,
  resolveIslandImportPath,
  collectIslandComponents,
  generateRegistryModule,
  transformVueSfcIslands
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
