import { describe, it, expect } from 'vitest';
import { hydrateIslands } from '../src/runtime';

function islandEl(attrs: Record<string, string>) {
  const map = new Map(Object.entries(attrs));
  return {
    getAttribute: (name: string) => map.get(name) ?? null,
    setAttribute: (name: string, value: string) => {
      map.set(name, value);
    },
    hasAttribute: (name: string) => map.has(name),
    innerHTML: ''
  };
}

describe('hydrateIslands skip', () => {
  it('skips islands that already have data-hydrated', () => {
    const hydrated = islandEl({
      'data-island-id': 'a',
      'data-component': 'Comp',
      'data-directive': 'client:load',
      'data-hydrated': 'true'
    });
    const seen: string[] = [];
    hydrateIslands({
      root: {
        querySelectorAll: () => ({
          forEach: (cb: (el: typeof hydrated) => void) => {
            cb(hydrated);
          }
        })
      } as never,
      components: {
        Comp: { name: 'Comp', setup: () => () => null }
      },
      onHydrated: el => {
        seen.push(el.getAttribute('data-island-id') || '');
      }
    });
    expect(seen).toEqual([]);
    expect(hydrated.hasAttribute('data-hydrated')).toBe(true);
  });
});
