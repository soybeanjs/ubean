// Client-side content search over the prerendered fuse index (public/search-index.json).
// Renamed from useSearch to avoid collision with ubean/runtime/vue's Pagefind-based useSearch (P9-26).
import { ref, shallowRef } from 'vue';
import Fuse from 'fuse.js';

export interface SearchEntry {
  route: string;
  locale: 'en' | 'zh';
  title: string;
  section: string;
  headings?: string[];
  bodyExcerpt?: string;
}

let fuse: Fuse<SearchEntry> | null = null;
let loadPromise: Promise<Fuse<SearchEntry> | null> | null = null;

async function loadIndex(): Promise<Fuse<SearchEntry> | null> {
  if (fuse) return fuse;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const res = await fetch('/search-index.json');
      if (!res.ok) return null;
      const entries: SearchEntry[] = await res.json();
      fuse = new Fuse(entries, {
        keys: [
          { name: 'title', weight: 0.5 },
          { name: 'headings', weight: 0.3 },
          { name: 'bodyExcerpt', weight: 0.15 },
          { name: 'section', weight: 0.05 }
        ],
        includeScore: true,
        threshold: 0.4,
        ignoreLocation: true
      });
      return fuse;
    } catch {
      return null;
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}

export function useDocSearch() {
  const query = ref('');
  const results = shallowRef<Array<{ item: SearchEntry; score?: number }>>([]);
  const loading = ref(false);
  const open = ref(false);

  let debounce: ReturnType<typeof setTimeout> | null = null;

  async function run() {
    const q = query.value.trim();
    if (!q) {
      results.value = [];
      return;
    }
    loading.value = true;
    const f = await loadIndex();
    if (!f) {
      results.value = [];
      loading.value = false;
      return;
    }
    results.value = f.search(q, { limit: 20 });
    loading.value = false;
  }

  function onInput() {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(run, 150);
  }

  function close() {
    open.value = false;
    query.value = '';
    results.value = [];
  }

  return { query, results, loading, open, onInput, close };
}
