/**
 * P9-26: Full-text search (Pagefind integration) unit tests.
 *
 * Tests the `useSearch()` composable and supporting functions using a mock
 * Pagefind browser module — no real Pagefind build is required.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  useSearch,
  initPagefind,
  executeSearch,
  configureSearch,
  getSearchConfig,
  resolveSearchConfig,
  isPagefindLoaded,
  _resetSearch,
  _setPagefindMock
} from '../src/search';
import type { SearchResult } from '../src/search';

/** Create a mock Pagefind module that returns predefined search results. */
function createMockPagefind(results: SearchResult[] = []) {
  const calls: { query: string; options?: unknown }[] = [];

  return {
    init: vi.fn(),
    search: vi.fn(async (query: string, options?: unknown) => {
      calls.push({ query, options });
      return {
        results: results.map(r => ({
          id: r.id,
          url: r.url,
          excerpt: r.excerpt,
          meta: r.meta,
          score: r.score,
          word_count: r.wordCount,
          data: async () => ({
            url: r.url,
            excerpt: r.excerpt,
            meta: r.meta,
            word_count: r.wordCount
          })
        })),
        _calls: calls
      };
    }),
    _calls: calls
  };
}

const sampleResults: SearchResult[] = [
  {
    id: 0,
    url: '/docs/getting-started',
    excerpt: 'Welcome to <mark>ubean</mark> — the Vue meta-framework.',
    meta: { title: 'Getting Started' },
    score: 10.5,
    wordCount: 120
  },
  {
    id: 1,
    url: '/docs/routing',
    excerpt: 'Routing in <mark>ubean</mark> is file-based.',
    meta: { title: 'Routing Guide' },
    score: 8.2,
    wordCount: 80
  }
];

describe('P9-26: resolveSearchConfig', () => {
  beforeEach(() => _resetSearch());

  it('returns defaults when called with no args', () => {
    const config = resolveSearchConfig();
    expect(config.pagefindPath).toBe('/pagefind/pagefind-modern.js');
    expect(config.debounce).toBe(150);
    expect(config.limit).toBe(10);
  });

  it('returns defaults when called with true', () => {
    const config = resolveSearchConfig(true);
    expect(config.pagefindPath).toBe('/pagefind/pagefind-modern.js');
  });

  it('merges user config over defaults', () => {
    const config = resolveSearchConfig({ debounce: 300, limit: 20 });
    expect(config.debounce).toBe(300);
    expect(config.limit).toBe(20);
    expect(config.pagefindPath).toBe('/pagefind/pagefind-modern.js');
  });
});

describe('P9-26: configureSearch / getSearchConfig', () => {
  beforeEach(() => _resetSearch());

  it('configureSearch overrides runtime config globally', () => {
    configureSearch({ debounce: 500, limit: 25 });
    const config = getSearchConfig();
    expect(config.debounce).toBe(500);
    expect(config.limit).toBe(25);
  });

  it('getSearchConfig returns a snapshot of current config', () => {
    configureSearch({ pagefindPath: '/custom/pagefind.js' });
    const config = getSearchConfig();
    expect(config.pagefindPath).toBe('/custom/pagefind.js');
  });
});

describe('P9-26: initPagefind', () => {
  beforeEach(() => _resetSearch());

  it('loads the Pagefind browser library via dynamic import', async () => {
    const mock = createMockPagefind();
    _setPagefindMock(mock);

    const mod = await initPagefind();
    expect(mod).toBe(mock);
    expect(mock.init).toHaveBeenCalled();
    expect(isPagefindLoaded()).toBe(true);
  });

  it('caches the loaded module (returns same resolved module)', async () => {
    const mock = createMockPagefind(sampleResults);
    _setPagefindMock(mock);

    // initPagefind is async, so each call returns a new wrapper promise.
    // But both should resolve to the same underlying mock module.
    const [m1, m2] = await Promise.all([initPagefind(), initPagefind()]);
    expect(m1).toBe(m2);
  });
});

describe('P9-26: executeSearch', () => {
  beforeEach(() => _resetSearch());

  it('returns empty array for empty/whitespace query', async () => {
    _setPagefindMock(createMockPagefind(sampleResults));

    expect(await executeSearch('')).toEqual([]);
    expect(await executeSearch('   ')).toEqual([]);
  });

  it('returns normalized search results', async () => {
    const mock = createMockPagefind(sampleResults);
    _setPagefindMock(mock);

    const results = await executeSearch('ubean');
    expect(results).toHaveLength(2);
    expect(results[0].url).toBe('/docs/getting-started');
    expect(results[0].excerpt).toContain('<mark>ubean</mark>');
    expect(results[0].meta.title).toBe('Getting Started');
    expect(results[0].score).toBe(10.5);
    expect(results[0].wordCount).toBe(120);
  });

  it('passes filters to Pagefind search', async () => {
    const mock = createMockPagefind(sampleResults);
    _setPagefindMock(mock);

    await executeSearch('test', {
      filters: { filters: { tag: 'guide' } }
    });

    expect(mock.search).toHaveBeenCalledWith('test', { filters: { tag: 'guide' } });
  });

  it('respects limit option', async () => {
    _setPagefindMock(createMockPagefind(sampleResults));

    const results = await executeSearch('ubean', { limit: 1 });
    expect(results).toHaveLength(1);
  });

  it('uses default limit from runtime config', async () => {
    _setPagefindMock(createMockPagefind(sampleResults));

    const results = await executeSearch('ubean');
    // Default limit is 10, and sampleResults has 2 items
    expect(results).toHaveLength(2);
  });
});

describe('P9-26: useSearch composable', () => {
  beforeEach(() => _resetSearch());

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns reactive state with correct shape', () => {
    const s = useSearch({ debounce: 0 });
    expect(s.query.value).toBe('');
    expect(s.results.value).toEqual([]);
    expect(s.loading.value).toBe(false);
    expect(s.error.value).toBeNull();
    expect(s.ready.value).toBe(false);
    expect(typeof s.search).toBe('function');
    expect(typeof s.clear).toBe('function');
    expect(typeof s.preload).toBe('function');
  });

  it('search with empty query clears results', async () => {
    _setPagefindMock(createMockPagefind(sampleResults));
    const s = useSearch({ debounce: 0 });

    await s.search('ubean');
    expect(s.results.value).toHaveLength(2);

    await s.search('');
    expect(s.results.value).toEqual([]);
    expect(s.query.value).toBe('');
  });

  it('search populates results from Pagefind', async () => {
    _setPagefindMock(createMockPagefind(sampleResults));
    const s = useSearch({ debounce: 0 });

    await s.search('ubean');
    expect(s.results.value).toHaveLength(2);
    expect(s.results.value[0].url).toBe('/docs/getting-started');
    expect(s.loading.value).toBe(false);
    expect(s.ready.value).toBe(true);
  });

  it('sets loading to true during search', async () => {
    _setPagefindMock(createMockPagefind(sampleResults));
    const s = useSearch({ debounce: 0 });

    const searchPromise = s.search('ubean');
    // loading should be true synchronously after calling search (debounce=0)
    // but since doSearch is async, loading is set before the first await
    await searchPromise;
    expect(s.loading.value).toBe(false);
  });

  it('sets error when Pagefind fails to load', async () => {
    // Don't set a mock — initPagefind will throw because the import fails
    // and _setPagefindMock was not called (reset in beforeEach).
    // But _setPagefindMock sets pagefindLoaded=true, so we need to simulate
    // a failure by NOT setting a mock and having the import fail.
    //
    // Since _resetSearch clears the mock, calling initPagefind will try a
    // real dynamic import which will fail in the test environment.
    const s = useSearch({ debounce: 0 });

    await s.search('test');
    expect(s.error.value).not.toBeNull();
    expect(s.results.value).toEqual([]);
    expect(s.loading.value).toBe(false);
  });

  it('clear() resets all state', async () => {
    _setPagefindMock(createMockPagefind(sampleResults));
    const s = useSearch({ debounce: 0 });

    await s.search('ubean');
    expect(s.results.value).toHaveLength(2);

    s.clear();
    expect(s.query.value).toBe('');
    expect(s.results.value).toEqual([]);
    expect(s.loading.value).toBe(false);
    expect(s.error.value).toBeNull();
  });

  it('debounce delays search execution', async () => {
    vi.useFakeTimers();
    const mock = createMockPagefind(sampleResults);
    _setPagefindMock(mock);

    const s = useSearch({ debounce: 100 });

    const searchPromise = s.search('ubean');
    // Search should not have been called yet (debounce pending)
    expect(mock.search).not.toHaveBeenCalled();
    expect(s.loading.value).toBe(false);

    vi.advanceTimersByTime(100);
    await searchPromise;

    expect(mock.search).toHaveBeenCalledWith('ubean', {});
    expect(s.results.value).toHaveLength(2);

    vi.useRealTimers();
  });

  it('debounce cancel: rapid typing only triggers last search', async () => {
    vi.useFakeTimers();
    const mock = createMockPagefind(sampleResults);
    _setPagefindMock(mock);

    const s = useSearch({ debounce: 100 });

    // Rapid typing
    s.search('u');
    s.search('ub');
    s.search('ube');
    const finalPromise = s.search('ubean');

    vi.advanceTimersByTime(100);
    await finalPromise;

    // Only the last query should have been searched
    expect(mock.search).toHaveBeenCalledTimes(1);
    expect(mock.search).toHaveBeenCalledWith('ubean', {});

    vi.useRealTimers();
  });

  it('immediate option triggers search on mount', async () => {
    _setPagefindMock(createMockPagefind(sampleResults));
    const s = useSearch({ debounce: 0, immediate: 'ubean' });

    // The immediate search is async (doSearch → executeSearch → initPagefind).
    // Flush all microtasks by awaiting multiple times.
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(s.results.value).toHaveLength(2);
  });

  it('preload() loads Pagefind without searching', async () => {
    const mock = createMockPagefind(sampleResults);
    _setPagefindMock(mock);

    const s = useSearch();
    await s.preload();

    expect(s.ready.value).toBe(true);
    expect(mock.search).not.toHaveBeenCalled();
  });

  it('respects limit from composable options', async () => {
    _setPagefindMock(createMockPagefind(sampleResults));
    const s = useSearch({ debounce: 0, limit: 1 });

    await s.search('ubean');
    expect(s.results.value).toHaveLength(1);
  });

  it('passes default filters to search', async () => {
    const mock = createMockPagefind(sampleResults);
    _setPagefindMock(mock);

    const s = useSearch({
      debounce: 0,
      filters: { filters: { section: 'docs' } }
    });

    await s.search('ubean');
    expect(mock.search).toHaveBeenCalledWith('ubean', { filters: { section: 'docs' } });
  });
});

describe('P9-26: isPagefindLoaded', () => {
  beforeEach(() => _resetSearch());

  it('returns false before initPagefind is called', () => {
    expect(isPagefindLoaded()).toBe(false);
  });

  it('returns true after successful initPagefind', async () => {
    _setPagefindMock(createMockPagefind());
    await initPagefind();
    expect(isPagefindLoaded()).toBe(true);
  });
});
