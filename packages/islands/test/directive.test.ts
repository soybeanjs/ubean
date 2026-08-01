/**
 * Unit tests for the `v-client` Vue custom directive (P9-29 / Phase 4).
 *
 * Tests cover:
 * - Strategy resolution from modifiers
 * - Strategy ↔ legacy directive string conversion (used internally by Vite plugin)
 * - Directive mounted/unmounted lifecycle (data attributes + strategy application)
 * - Vite plugin transform: `v-client.*` → `<ubean-island>`
 *
 * Phase 4: 旧的 `client:*` attribute 语法已移除,所有测试均使用 `v-client.*`。
 */
import { describe, it, expect } from 'vitest';
import {
  vClient,
  resolveClientStrategy,
  strategyToLegacyDirective,
  legacyDirectiveToStrategy,
  applyStrategy,
  cleanupStrategy,
  CLIENT_DIRECTIVE_ATTR,
  CLIENT_MEDIA_ATTR,
  CLIENT_ONLY_ATTR
} from '../src/directive';
import type { ClientDirectiveModifiers, ClientStrategy } from '../src/directive';
import { transformVueSfcIslands, scanIslandDirectiveNames } from '../src/vite';

/* -------------------------------------------------------------------------- */
/* Mock DOM element helper                                                     */
/* -------------------------------------------------------------------------- */

function createMockElement(tag = 'div'): HTMLElement {
  const attrs = new Map<string, string>();

  const el = {
    tagName: tag.toUpperCase(),
    setAttribute(name: string, value: string) {
      attrs.set(name, value);
    },
    getAttribute(name: string): string | null {
      return attrs.has(name) ? attrs.get(name)! : null;
    },
    removeAttribute(name: string) {
      attrs.delete(name);
    },
    hasAttribute(name: string): boolean {
      return attrs.has(name);
    }
  } as unknown as HTMLElement;

  return el;
}

/** Create a mock directive binding. */
function createBinding(modifiers: Partial<ClientDirectiveModifiers>, value?: string) {
  return {
    modifiers: modifiers as Record<string, boolean>,
    value,
    oldValue: undefined,
    dir: {},
    instance: null
  } as any;
}

/* -------------------------------------------------------------------------- */
/* Strategy resolution tests                                                   */
/* -------------------------------------------------------------------------- */

describe('P9-29: resolveClientStrategy', () => {
  it('resolves load modifier', () => {
    expect(resolveClientStrategy({ load: true })).toBe('load');
  });

  it('resolves idle modifier', () => {
    expect(resolveClientStrategy({ idle: true })).toBe('idle');
  });

  it('resolves visible modifier', () => {
    expect(resolveClientStrategy({ visible: true })).toBe('visible');
  });

  it('resolves media modifier', () => {
    expect(resolveClientStrategy({ media: true })).toBe('media');
  });

  it('resolves only modifier', () => {
    expect(resolveClientStrategy({ only: true })).toBe('only');
  });

  it('defaults to load when no modifier is present', () => {
    expect(resolveClientStrategy({})).toBe('load');
  });

  it('uses priority order: load → idle → visible → media → only', () => {
    expect(resolveClientStrategy({ load: true, idle: true })).toBe('load');
    expect(resolveClientStrategy({ idle: true, visible: true })).toBe('idle');
    expect(resolveClientStrategy({ visible: true, media: true })).toBe('visible');
    expect(resolveClientStrategy({ media: true, only: true })).toBe('media');
  });
});

/* -------------------------------------------------------------------------- */
/* Legacy syntax conversion tests                                              */
/* -------------------------------------------------------------------------- */

describe('P9-29: strategyToLegacyDirective / legacyDirectiveToStrategy', () => {
  const strategies: ClientStrategy[] = ['load', 'idle', 'visible', 'media', 'only'];

  it('converts strategy to legacy directive string', () => {
    expect(strategyToLegacyDirective('load')).toBe('client:load');
    expect(strategyToLegacyDirective('idle')).toBe('client:idle');
    expect(strategyToLegacyDirective('visible')).toBe('client:visible');
    expect(strategyToLegacyDirective('media')).toBe('client:media');
    expect(strategyToLegacyDirective('only')).toBe('client:only');
  });

  it('parses legacy directive string back to strategy', () => {
    for (const s of strategies) {
      const legacy = strategyToLegacyDirective(s);
      expect(legacyDirectiveToStrategy(legacy)).toBe(s);
    }
  });

  it('parses v-client.* attribute name back to strategy', () => {
    // The function accepts both `client:strategy` and `v-client.strategy` formats
    expect(legacyDirectiveToStrategy('v-client.load')).toBe('load');
    expect(legacyDirectiveToStrategy('v-client.media')).toBe('media');
    expect(legacyDirectiveToStrategy('client:load')).toBe('load');
    expect(legacyDirectiveToStrategy('client:media')).toBe('media');
  });

  it('returns null for invalid directive strings', () => {
    expect(legacyDirectiveToStrategy('client:unknown')).toBeNull();
    expect(legacyDirectiveToStrategy('invalid')).toBeNull();
    expect(legacyDirectiveToStrategy('')).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Directive lifecycle tests                                                   */
/* -------------------------------------------------------------------------- */

describe('P9-29: vClient directive mounted', () => {
  it('sets data-client-directive attribute for .load', () => {
    const el = createMockElement();
    vClient.mounted!(el as any, createBinding({ load: true }), null as any, null as any);

    expect(el.getAttribute(CLIENT_DIRECTIVE_ATTR)).toBe('load');
  });

  it('sets data-client-directive attribute for .idle', () => {
    const el = createMockElement();
    vClient.mounted!(el as any, createBinding({ idle: true }), null as any, null as any);

    expect(el.getAttribute(CLIENT_DIRECTIVE_ATTR)).toBe('idle');
  });

  it('sets data-client-directive attribute for .visible', () => {
    const el = createMockElement();
    vClient.mounted!(el as any, createBinding({ visible: true }), null as any, null as any);

    expect(el.getAttribute(CLIENT_DIRECTIVE_ATTR)).toBe('visible');
  });

  it('sets data-client-directive and data-media for .media with value', () => {
    const el = createMockElement();
    const mediaQuery = '(max-width: 768px)';
    vClient.mounted!(el as any, createBinding({ media: true }, mediaQuery), null as any, null as any);

    expect(el.getAttribute(CLIENT_DIRECTIVE_ATTR)).toBe('media');
    expect(el.getAttribute(CLIENT_MEDIA_ATTR)).toBe(mediaQuery);
  });

  it('does not set data-media for .media without value', () => {
    const el = createMockElement();
    vClient.mounted!(el as any, createBinding({ media: true }), null as any, null as any);

    expect(el.getAttribute(CLIENT_DIRECTIVE_ATTR)).toBe('media');
    expect(el.getAttribute(CLIENT_MEDIA_ATTR)).toBeNull();
  });

  it('sets data-client-only for .only', () => {
    const el = createMockElement();
    vClient.mounted!(el as any, createBinding({ only: true }), null as any, null as any);

    expect(el.getAttribute(CLIENT_DIRECTIVE_ATTR)).toBe('only');
    expect(el.getAttribute(CLIENT_ONLY_ATTR)).toBe('true');
  });

  it('defaults to load when no modifier is given', () => {
    const el = createMockElement();
    vClient.mounted!(el as any, createBinding({}), null as any, null as any);

    expect(el.getAttribute(CLIENT_DIRECTIVE_ATTR)).toBe('load');
  });
});

describe('P9-29: vClient directive unmounted', () => {
  it('removes all data attributes on unmount', () => {
    const el = createMockElement();
    vClient.mounted!(el as any, createBinding({ media: true }, '(max-width: 768px)'), null as any, null as any);

    expect(el.getAttribute(CLIENT_DIRECTIVE_ATTR)).toBe('media');
    expect(el.getAttribute(CLIENT_MEDIA_ATTR)).toBe('(max-width: 768px)');

    vClient.unmounted!(el as any, null as any, null as any, null as any);

    expect(el.getAttribute(CLIENT_DIRECTIVE_ATTR)).toBeNull();
    expect(el.getAttribute(CLIENT_MEDIA_ATTR)).toBeNull();
    expect(el.getAttribute(CLIENT_ONLY_ATTR)).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* applyStrategy / cleanupStrategy tests                                      */
/* -------------------------------------------------------------------------- */

describe('P9-29: applyStrategy', () => {
  it('load strategy is a no-op (no pending state)', () => {
    const el = createMockElement();
    applyStrategy(el, 'load');
    expect(el.getAttribute('data-client-pending')).toBeNull();
  });

  it('only strategy is a no-op (no pending state)', () => {
    const el = createMockElement();
    applyStrategy(el, 'only');
    expect(el.getAttribute('data-client-pending')).toBeNull();
  });

  it('idle strategy sets data-client-pending=idle and cleans up', () => {
    const el = createMockElement();
    applyStrategy(el, 'idle');

    expect(el.getAttribute('data-client-pending')).toBe('idle');

    cleanupStrategy(el);
    expect(el.getAttribute('data-client-pending')).toBeNull();
  });

  it('visible strategy sets data-client-pending=visible', () => {
    const el = createMockElement();
    applyStrategy(el, 'visible');

    expect(el.getAttribute('data-client-pending')).toBe('visible');

    cleanupStrategy(el);
    expect(el.getAttribute('data-client-pending')).toBeNull();
  });

  it('media strategy with matching query does not set pending', () => {
    const el = createMockElement();
    // matchMedia mock that returns matches=true
    const originalWindow = (globalThis as any).window;
    (globalThis as any).window = {
      matchMedia: () => ({
        matches: true,
        addEventListener: () => {},
        removeEventListener: () => {}
      })
    };

    applyStrategy(el, 'media', '(min-width: 100px)');
    expect(el.getAttribute('data-client-pending')).toBeNull();

    (globalThis as any).window = originalWindow;
  });

  it('media strategy with non-matching query sets pending=media', () => {
    const el = createMockElement();
    const originalWindow = (globalThis as any).window;
    (globalThis as any).window = {
      matchMedia: () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {}
      })
    };

    applyStrategy(el, 'media', '(min-width: 9999px)');
    expect(el.getAttribute('data-client-pending')).toBe('media');

    cleanupStrategy(el);
    expect(el.getAttribute('data-client-pending')).toBeNull();

    (globalThis as any).window = originalWindow;
  });
});

/* -------------------------------------------------------------------------- */
/* Vite plugin transform: v-client.* → <ubean-island>                         */
/* -------------------------------------------------------------------------- */

describe('P9-29: Vite plugin transform — v-client.* syntax', () => {
  it('transforms v-client.load to <ubean-island> with data-directive="client:load"', () => {
    const sfc = `<template><Counter v-client.load /></template>`;
    const result = transformVueSfcIslands(sfc, 'Test.vue');

    expect(result.islandCount).toBe(1);
    expect(result.code).toContain('<ubean-island');
    expect(result.code).toContain('data-directive="client:load"');
    expect(result.code).toContain('data-component="Counter"');
    // v-client.load should be stripped from the output
    expect(result.code).not.toContain('v-client.load');
  });

  it('transforms v-client.idle to data-directive="client:idle"', () => {
    const sfc = `<template><HeavyChart v-client.idle /></template>`;
    const result = transformVueSfcIslands(sfc, 'Test.vue');

    expect(result.islandCount).toBe(1);
    expect(result.code).toContain('data-directive="client:idle"');
  });

  it('transforms v-client.visible to data-directive="client:visible"', () => {
    const sfc = `<template><LazyMap v-client.visible /></template>`;
    const result = transformVueSfcIslands(sfc, 'Test.vue');

    expect(result.islandCount).toBe(1);
    expect(result.code).toContain('data-directive="client:visible"');
  });

  it('transforms v-client.media with media query value', () => {
    const sfc = `<template><MobileNav v-client.media="'(max-width: 768px)'" /></template>`;
    const result = transformVueSfcIslands(sfc, 'Test.vue');

    expect(result.islandCount).toBe(1);
    expect(result.code).toContain('data-directive="client:media"');
    expect(result.code).toContain('data-media="(max-width: 768px)"');
  });

  it('transforms v-client.only to data-directive="client:only"', () => {
    const sfc = `<template><Widget v-client.only /></template>`;
    const result = transformVueSfcIslands(sfc, 'Test.vue');

    expect(result.islandCount).toBe(1);
    expect(result.code).toContain('data-directive="client:only"');
  });

  it('does NOT transform legacy client:* syntax (Phase 4: removed)', () => {
    // After Phase 4, `client:load` is treated as a regular attribute — not an island directive.
    const sfc = `<template><Counter client:load /></template>`;
    const result = transformVueSfcIslands(sfc, 'Test.vue');

    expect(result.islandCount).toBe(0);
    // The original attribute is preserved unchanged
    expect(result.code).toContain('client:load');
    expect(result.code).not.toContain('<ubean-island');
  });

  it('preserves static props on v-client.* elements', () => {
    const sfc = `<template><Counter v-client.load :count="5" title="Test" /></template>`;
    const result = transformVueSfcIslands(sfc, 'Test.vue');

    // Static props should be in data-props (bound props like :count are excluded)
    expect(result.code).toContain('data-props=');
    // v-client.load should not be in props
    const propsMatch = result.code.match(/data-props="([^"]*)"/);
    if (propsMatch) {
      const props = JSON.parse(
        propsMatch[1]
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
      );
      expect(props.title).toBe('Test');
      expect(props['v-client.load']).toBeUndefined();
    }
  });

  it('handles multiple v-client.* directives in one template', () => {
    const sfc = `<template>
      <Counter v-client.load />
      <HeavyChart v-client.idle />
      <LazyMap v-client.visible />
    </template>`;
    const result = transformVueSfcIslands(sfc, 'Test.vue');

    expect(result.islandCount).toBe(3);
    expect(result.code).toContain('data-directive="client:load"');
    expect(result.code).toContain('data-directive="client:idle"');
    expect(result.code).toContain('data-directive="client:visible"');
  });
});

/* -------------------------------------------------------------------------- */
/* scanIslandDirectiveNames: v-client.* detection                             */
/* -------------------------------------------------------------------------- */

describe('P9-29: scanIslandDirectiveNames — v-client.* syntax', () => {
  it('detects components with v-client.load', () => {
    const template = `<Counter v-client.load />`;
    const names = scanIslandDirectiveNames(template);
    expect(names.has('Counter')).toBe(true);
  });

  it('detects components with v-client.media', () => {
    const template = `<MobileNav v-client.media="'(max-width: 768px)'" />`;
    const names = scanIslandDirectiveNames(template);
    expect(names.has('MobileNav')).toBe(true);
  });

  it('detects multiple v-client.* directives', () => {
    const template = `
      <CompA v-client.load />
      <CompB v-client.idle />
      <CompC v-client.visible />
    `;
    const names = scanIslandDirectiveNames(template);
    expect(names.has('CompA')).toBe(true);
    expect(names.has('CompB')).toBe(true);
    expect(names.has('CompC')).toBe(true);
  });

  it('does not detect components with legacy client:* syntax (Phase 4: removed)', () => {
    // After Phase 4, `client:*` is no longer recognized — it's just a regular attribute.
    const template = `<CompB client:idle />`;
    const names = scanIslandDirectiveNames(template);
    expect(names.size).toBe(0);
  });

  it('does not detect components without client directives', () => {
    const template = `<NormalComp title="test" />`;
    const names = scanIslandDirectiveNames(template);
    expect(names.size).toBe(0);
  });
});
