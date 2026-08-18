/**
 * Page route registration ordering unit tests.
 *
 * Validates `sortPagesForRegistration`: catch-all routes (`/**:slug`,
 * converted to Hono `*`) must be registered after specific routes so
 * Hono's RegExpRouter (first-match-wins) does not let the catch-all
 * swallow paths like `/` (the homepage).
 *
 * Reproduces the bug where file-system sort order puts `[...slug].vue`
 * before `index.vue` (`[` < `i`), causing the homepage to render with
 * the catch-all's layout ('default') instead of index.vue's declared
 * layout ('home').
 */
import { describe, it, expect } from 'vitest';
import { sortPagesForRegistration } from '../src/index';

interface Page {
  route: string;
  name: string;
}

describe('sortPagesForRegistration', () => {
  it('moves catch-all to the end, keeps specific routes first', () => {
    // File-system order: [...slug].vue before index.vue ('[' < 'i')
    const pages: Page[] = [
      { route: '/**:slug', name: 'CatchAll' },
      { route: '/', name: 'Index' },
      { route: '/zh', name: 'ZhIndex' }
    ];
    const sorted = sortPagesForRegistration(pages);
    expect(sorted.map(p => p.name)).toEqual(['Index', 'ZhIndex', 'CatchAll']);
  });

  it('preserves relative order of non-catch-all pages', () => {
    const pages: Page[] = [
      { route: '/b', name: 'B' },
      { route: '/**:slug', name: 'CatchAll' },
      { route: '/a', name: 'A' },
      { route: '/c', name: 'C' }
    ];
    const sorted = sortPagesForRegistration(pages);
    // A, B, C keep their relative order; catch-all last
    expect(sorted.map(p => p.name)).toEqual(['B', 'A', 'C', 'CatchAll']);
  });

  it('moves multiple catch-all routes to the end', () => {
    const pages: Page[] = [
      { route: '/**:slug', name: 'CatchAll1' },
      { route: '/home', name: 'Home' },
      { route: '/docs/**:path', name: 'DocsCatchAll' }
    ];
    const sorted = sortPagesForRegistration(pages);
    expect(sorted[0].name).toBe('Home');
    // Both catch-alls are after Home
    const catchAllNames = sorted
      .slice(1)
      .map(p => p.name)
      .sort();
    expect(catchAllNames).toEqual(['CatchAll1', 'DocsCatchAll']);
  });

  it('returns empty array unchanged', () => {
    expect(sortPagesForRegistration([])).toEqual([]);
  });

  it('leaves array unchanged when no catch-all present', () => {
    const pages: Page[] = [
      { route: '/a', name: 'A' },
      { route: '/b', name: 'B' }
    ];
    expect(sortPagesForRegistration(pages).map(p => p.name)).toEqual(['A', 'B']);
  });

  it('does not mutate the input array', () => {
    const pages: Page[] = [
      { route: '/**:slug', name: 'CatchAll' },
      { route: '/', name: 'Index' }
    ];
    sortPagesForRegistration(pages);
    // Input order preserved
    expect(pages.map(p => p.name)).toEqual(['CatchAll', 'Index']);
  });

  it('ensures homepage "/" is registered before catch-all "*"', () => {
    // The exact scenario from apps/docs: [...slug].vue + index.vue
    const pages: Page[] = [
      { route: '/**:slug', name: 'SlugCatchAll' },
      { route: '/', name: 'Index' }
    ];
    const sorted = sortPagesForRegistration(pages);
    // Index must come first so Hono matches '/' before '*'
    expect(sorted[0].route).toBe('/');
    expect(sorted[1].route).toBe('/**:slug');
  });
});
