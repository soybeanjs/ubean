/**
 * P9-17: Nested Layouts — virtual module generation tests
 *
 * Verifies that `createVuePagesVirtualModule` correctly serializes array layouts
 * in the generated route meta, including 'default' handling and backward
 * compatibility with single-string layouts.
 */
import { describe, it, expect } from 'vitest';
import type { ScannedPageRoute, ScannedLayout } from '@ubean/scan';
import { createVuePagesVirtualModule } from '../src/vue-virtual-modules';

function makePage(overrides: Partial<ScannedPageRoute> = {}): ScannedPageRoute {
  return {
    name: 'test',
    route: '/test',
    path: '/test',
    fullPath: '/src/pages/test.vue',
    relativePath: 'test.vue',
    dirname: '.',
    basename: 'test.vue',
    isReuse: false,
    isMarkdown: false,
    ...overrides
  };
}

// makeLayout is used implicitly via the layouts array parameter;
// keeping it for clarity and future test expansion.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function makeLayout(name: string, isDefault = false): ScannedLayout {
  return {
    name,
    route: '',
    path: '',
    fullPath: `/src/layouts/${name}.vue`,
    relativePath: `${name}.vue`,
    dirname: '.',
    basename: `${name}.vue`,
    isDefault
  };
}

describe('P9-17: createVuePagesVirtualModule — nested layouts', () => {
  it('generates array layout in route meta', () => {
    const page = makePage({
      name: 'dashboard',
      layout: ['admin', 'dashboard']
    });
    const mod = createVuePagesVirtualModule([page], []);
    const code = mod.load();
    expect(code).toContain('layout: ["admin","dashboard"]');
  });

  it('generates false for layout: false', () => {
    const page = makePage({ layout: false });
    const mod = createVuePagesVirtualModule([page], []);
    const code = mod.load();
    expect(code).toContain('layout: false');
  });

  it('generates undefined for layout: undefined', () => {
    const page = makePage({ layout: undefined });
    const mod = createVuePagesVirtualModule([page], []);
    const code = mod.load();
    expect(code).toContain('layout: undefined');
  });

  it('keeps "default" in array in virtual module (literal name)', () => {
    const page = makePage({
      layout: ['default', 'admin', 'dashboard']
    });
    const mod = createVuePagesVirtualModule([page], []);
    const code = mod.load();
    expect(code).toContain('layout: ["default","admin","dashboard"]');
  });

  it('generates array with single "default" (literal name)', () => {
    const page = makePage({
      layout: ['default']
    });
    const mod = createVuePagesVirtualModule([page], []);
    const code = mod.load();
    expect(code).toContain('layout: ["default"]');
  });

  it('serializes empty array layout as-is (extract 层负责归一化为 undefined)', () => {
    const page = makePage({
      layout: []
    });
    const mod = createVuePagesVirtualModule([page], []);
    const code = mod.load();
    // 统一生成器对 meta 做 JSON 序列化,layout 原样透传(真实管线中
    // extractDefinePageFromCode 已把空数组归一化为 undefined)
    expect(code).toContain('"layout":[]');
  });

  it('generates single string layout (backward compat)', () => {
    const page = makePage({ layout: 'admin' });
    const mod = createVuePagesVirtualModule([page], []);
    const code = mod.load();
    expect(code).toContain('layout: "admin"');
  });

  it('serializes single "default" string as-is (extract 层负责归一化为 undefined)', () => {
    const page = makePage({ layout: 'default' });
    const mod = createVuePagesVirtualModule([page], []);
    const code = mod.load();
    // 同上:统一生成器透传,真实管线中 extract 层已归一化
    expect(code).toContain('"layout":"default"');
  });

  it('includes layout names in pages export', () => {
    const page = makePage({
      name: 'home',
      layout: ['default', 'admin']
    });
    const mod = createVuePagesVirtualModule([page], []);
    const code = mod.load();
    // The pages export uses `layout: ${JSON.stringify(p.layout)}` format
    expect(code).toContain('layout: ["default","admin"]');
  });
});
