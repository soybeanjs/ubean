import { describe, it, expect } from 'vitest';
import { hydrateIslands, hasPendingIslands, scheduleIslandHydration } from '../src/runtime';

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

function rootOf(els: ReturnType<typeof islandEl>[]) {
  return {
    querySelectorAll: () => ({
      forEach: (cb: (el: (typeof els)[number]) => void) => {
        for (const el of els) cb(el);
      }
    })
  } as never;
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
      root: rootOf([hydrated]),
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

  it('hasPendingIslands is false when every island is hydrated', () => {
    const hydrated = islandEl({
      'data-island-id': 'a',
      'data-component': 'Comp',
      'data-hydrated': 'true'
    });
    expect(hasPendingIslands(rootOf([hydrated]))).toBe(false);
  });

  it('hasPendingIslands is true when an island lacks data-hydrated', () => {
    const pending = islandEl({
      'data-island-id': 'b',
      'data-component': 'Comp'
    });
    expect(hasPendingIslands(rootOf([pending]))).toBe(true);
  });
});

describe('scheduleIslandHydration', () => {
  function createRafQueue() {
    const queue: Array<() => void> = [];
    return {
      raf(cb: () => void) {
        queue.push(cb);
        return queue.length;
      },
      flush() {
        const next = queue.shift();
        next?.();
      },
      get length() {
        return queue.length;
      }
    };
  }

  it('skips the second rAF on afterEach when nothing is pending', () => {
    const frames = createRafQueue();
    let hydrates = 0;
    scheduleIslandHydration({
      requestAnimationFrame: frames.raf,
      hasPending: () => false,
      hydrate: () => {
        hydrates += 1;
      }
    });
    expect(frames.length).toBe(1);
    frames.flush();
    expect(frames.length).toBe(0);
    expect(hydrates).toBe(0);
  });

  it('still waits two frames on first mount even when nothing is pending yet', () => {
    const frames = createRafQueue();
    let hydrates = 0;
    let pending = false;
    scheduleIslandHydration({
      requestAnimationFrame: frames.raf,
      hasPending: () => pending,
      hydrate: () => {
        hydrates += 1;
      },
      forceDoubleFrame: true
    });
    frames.flush();
    expect(frames.length).toBe(1);
    pending = true;
    frames.flush();
    expect(hydrates).toBe(1);
  });

  it('schedules a second rAF and hydrates when islands appear after the first frame', () => {
    const frames = createRafQueue();
    let hydrates = 0;
    scheduleIslandHydration({
      requestAnimationFrame: frames.raf,
      hasPending: () => true,
      hydrate: () => {
        hydrates += 1;
      }
    });
    frames.flush();
    expect(frames.length).toBe(1);
    frames.flush();
    expect(hydrates).toBe(1);
  });
});
