/**
 * P9-26: Full-text search via Pagefind integration.
 *
 * Aligns with Astro Pagefind integration. Pagefind is a static-site search
 * tool that indexes built HTML files at build time and provides a client-side
 * search API at runtime.
 *
 * Provides:
 * - `useSearch(options?)` composable wrapping the Pagefind browser API with
 *   reactive `results` / `loading` / `error` state and built-in debounce.
 * - `initPagefind(options)` loads and initializes the Pagefind browser library
 *   from the generated `/pagefind/` assets.
 * - `resolveSearchConfig(config)` merges user config with defaults.
 *
 * The Pagefind index is generated at build time by the Vite plugin's
 * `closeBundle` hook (runs `npx pagefind --site <outputDir>`). At runtime,
 * the browser dynamically imports `/pagefind/pagefind-modern.js`.
 *
 * Usage (composable):
 * ```typescript
 * const { results, search, loading, clear } = useSearch({ debounce: 200 });
 *
 * // In a template: <input @input="search($event.target.value)" />
 * // results.value is an array of SearchResult
 * ```
 */
import { ref, shallowRef } from 'vue';
import type { Ref, ShallowRef } from 'vue';

// --- Pagefind browser API types (minimal, aligned with @pagefind/types) ---

/** A single search result from Pagefind. */
export interface SearchResult {
  /** Unique internal ID of the result. */
  id: number;
  /** The URL of the page this result points to. */
  url: string;
  /** HTML excerpt with matched terms highlighted (via `<mark>`). */
  excerpt: string;
  /** Page metadata extracted during indexing (title, description, etc.). */
  meta: Record<string, string>;
  /** Weighted relevance score (higher = more relevant). */
  score: number;
  /** Word count of the matched content. */
  wordCount?: number;
  /** Raw data reference (advanced use). */
  data?: unknown;
}

/** Filter options passed to `pagefind.search()`. */
export interface SearchFilters {
  /** Key-value filters (e.g. `{ tags: 'guide' }` matches `data-pagefind-filter`). */
  filters?: Record<string, string | string[]>;
  /** Sort results by a meta field instead of relevance. */
  sort?: Record<string, 'asc' | 'desc'>;
}

/** Options for the `useSearch` composable. */
export interface UseSearchOptions {
  /** Debounce delay in ms (default: 150). Set to 0 for no debounce. */
  debounce?: number;
  /** Max number of results to return (default: 10). */
  limit?: number;
  /** Filters/sort passed to every search call. */
  filters?: SearchFilters;
  /** Path to the Pagefind browser bundle (default: '/pagefind/pagefind-modern.js'). */
  pagefindPath?: string;
  /** Auto-search on mount with an initial query (default: ''). */
  immediate?: string;
}

/** Return type of `useSearch()`. */
export interface UseSearchReturn {
  /** Current search query (reactive). */
  query: Ref<string>;
  /** Search results (reactive, shallow — each update replaces the array). */
  results: ShallowRef<SearchResult[]>;
  /** Whether a search is in progress. */
  loading: Ref<boolean>;
  /** Error message if the search failed (null on success). */
  error: Ref<string | null>;
  /** Whether the Pagefind library has been loaded. */
  ready: Ref<boolean>;
  /** Execute a search. Pass an empty string to clear. */
  search: (query: string, filters?: SearchFilters) => Promise<void>;
  /** Clear results and reset query. */
  clear: () => void;
  /** Preload the Pagefind library without searching. */
  preload: () => Promise<void>;
}

// --- Runtime config ---

/** Runtime search configuration (subset of build-time SearchConfig). */
export interface SearchRuntimeConfig {
  /** Path to the Pagefind browser bundle. */
  pagefindPath: string;
  /** Default debounce in ms. */
  debounce: number;
  /** Default result limit. */
  limit: number;
}

const DEFAULT_RUNTIME_CONFIG: SearchRuntimeConfig = {
  pagefindPath: '/pagefind/pagefind-modern.js',
  debounce: 150,
  limit: 10
};

let runtimeConfig: SearchRuntimeConfig = { ...DEFAULT_RUNTIME_CONFIG };

/**
 * Configure the search runtime globally. Call this in `app.ts` (client-side)
 * to override defaults before any `useSearch()` call.
 */
export function configureSearch(config: Partial<SearchRuntimeConfig>): void {
  runtimeConfig = { ...runtimeConfig, ...config };
}

/** Get the current runtime search config. */
export function getSearchConfig(): SearchRuntimeConfig {
  return runtimeConfig;
}

/** Resolve a user-provided config object into a full SearchRuntimeConfig. */
export function resolveSearchConfig(config?: Partial<SearchRuntimeConfig> | true): SearchRuntimeConfig {
  if (config === true || config === undefined) {
    return { ...DEFAULT_RUNTIME_CONFIG };
  }
  return { ...DEFAULT_RUNTIME_CONFIG, ...config };
}

// --- Pagefind browser loader ---

/** The loaded Pagefind browser module (cached after first load). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PagefindModule = any;

let pagefindPromise: Promise<PagefindModule> | null = null;
let pagefindLoaded = false;

/**
 * Dynamically import the Pagefind browser library.
 *
 * The library is generated at build time into `<outputDir>/pagefind/` and
 * served at `/pagefind/pagefind-modern.js`. In dev mode or when Pagefind is
 * not enabled, the import will fail — callers should catch and show a message.
 */
export async function initPagefind(options: { pagefindPath?: string } = {}): Promise<PagefindModule> {
  if (pagefindPromise) return pagefindPromise;

  const path = options.pagefindPath || runtimeConfig.pagefindPath;

  pagefindPromise = import(/* @vite-ignore */ path)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .then((mod: any) => {
      pagefindLoaded = true;
      // Pagefind exposes init() — call it if available (idempotent).
      if (typeof mod?.init === 'function') {
        mod.init();
      }
      return mod;
    })
    .catch(err => {
      // Reset so a retry is possible after a failure.
      pagefindPromise = null;
      throw new Error(
        `[ubean/search] Failed to load Pagefind from "${path}". ` +
          'Ensure `search: true` is set in ubean.config.ts and the site has been built. ' +
          `Original error: ${err instanceof Error ? err.message : String(err)}`
      );
    });

  return pagefindPromise;
}

/** Check whether the Pagefind browser library has been loaded. */
export function isPagefindLoaded(): boolean {
  return pagefindLoaded;
}

// --- Search execution ---

/**
 * Execute a raw Pagefind search. Returns normalized `SearchResult[]`.
 *
 * Exposed for advanced use cases where the reactive composable is not needed
 * (e.g. server-side API routes that proxy search requests).
 */
export async function executeSearch(
  query: string,
  options: {
    filters?: SearchFilters;
    limit?: number;
    pagefindPath?: string;
  } = {}
): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const pagefind = await initPagefind({ pagefindPath: options.pagefindPath });

  // Pagefind search options: { filters, sort, limit }
  const searchOptions: Record<string, unknown> = {};
  if (options.filters?.filters) searchOptions.filters = options.filters.filters;
  if (options.filters?.sort) searchOptions.sort = options.filters.sort;

  const searchResult = await pagefind.search(query, searchOptions);

  // Each result has a `.data()` method that resolves to { url, excerpt, meta, ... }
  const limit = options.limit ?? runtimeConfig.limit;
  const results = await Promise.all(
    (searchResult.results || []).slice(0, limit).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (r: any, index: number): Promise<SearchResult> => {
        const data = typeof r.data === 'function' ? await r.data() : r.data || {};
        return {
          id: r.id ?? index,
          url: data.url || r.url || '',
          excerpt: data.excerpt || r.excerpt || '',
          meta: data.meta || r.meta || {},
          score: r.score ?? 0,
          wordCount: data.word_count || r.word_count,
          data: r.data
        };
      }
    )
  );

  return results;
}

// --- Composable ---

/**
 * `useSearch` — reactive Pagefind search composable.
 *
 * Lazily loads the Pagefind browser library on first search and provides
 * reactive `results`, `loading`, and `error` state. Built-in debounce
 * prevents excessive searches while the user is typing.
 *
 * @example
 * ```vue
 * <script setup>
 * const { search, results, loading } = useSearch({ debounce: 200 });
 * </script>
 *
 * <template>
 *   <input
 *     type="search"
 *     placeholder="Search..."
 *     @input="search($event.target.value)"
 *   />
 *   <div v-if="loading">Searching...</div>
 *   <ul v-else>
 *     <li v-for="r in results" :key="r.id">
 *       <a :href="r.url" v-html="r.meta.title || r.url" />
 *       <p v-html="r.excerpt" />
 *     </li>
 *   </ul>
 * </template>
 * ```
 */
export function useSearch(options: UseSearchOptions = {}): UseSearchReturn {
  const debounce = options.debounce ?? runtimeConfig.debounce;
  const limit = options.limit ?? runtimeConfig.limit;
  const defaultFilters = options.filters;

  const query = ref('');
  const results = shallowRef<SearchResult[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const ready = ref(false);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastQuery = '';

  async function doSearch(q: string, filters?: SearchFilters): Promise<void> {
    const trimmed = q.trim();

    if (!trimmed) {
      results.value = [];
      query.value = '';
      error.value = null;
      loading.value = false;
      return;
    }

    // Skip if the query hasn't changed (e.g. debounce fired with same value).
    if (trimmed === lastQuery) return;
    lastQuery = trimmed;

    loading.value = true;
    error.value = null;

    try {
      const resolvedFilters = filters ?? defaultFilters;
      const found = await executeSearch(trimmed, {
        filters: resolvedFilters,
        limit,
        pagefindPath: options.pagefindPath
      });
      results.value = found;
      ready.value = true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      results.value = [];
    } finally {
      loading.value = false;
    }
  }

  function search(q: string, filters?: SearchFilters): Promise<void> {
    query.value = q;

    if (debounce > 0) {
      if (debounceTimer) clearTimeout(debounceTimer);
      return new Promise(resolve => {
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          doSearch(q, filters).finally(resolve);
        }, debounce);
      });
    }

    return doSearch(q, filters);
  }

  function clear(): void {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    query.value = '';
    lastQuery = '';
    results.value = [];
    loading.value = false;
    error.value = null;
  }

  async function preload(): Promise<void> {
    try {
      await initPagefind({ pagefindPath: options.pagefindPath });
      ready.value = true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    }
  }

  // Auto-search with initial query if provided.
  if (options.immediate) {
    search(options.immediate);
  }

  return {
    query,
    results,
    loading,
    error,
    ready,
    search,
    clear,
    preload
  };
}

// --- Test helpers ---

/** Reset all internal state (for unit tests only). */
export function _resetSearch(): void {
  pagefindPromise = null;
  pagefindLoaded = false;
  runtimeConfig = { ...DEFAULT_RUNTIME_CONFIG };
}

/**
 * Inject a mock Pagefind module for testing.
 *
 * The mock replaces the dynamic `import()` so tests can simulate search
 * results without a real Pagefind build. Also calls `mock.init()` to mimic
 * the real library's initialization.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function _setPagefindMock(mock: any): void {
  pagefindLoaded = true;
  if (typeof mock?.init === 'function') mock.init();
  pagefindPromise = Promise.resolve(mock);
}
