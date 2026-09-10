import { ref } from 'vue';
import type { Ref } from 'vue';
import { createSectionSearch } from './search';
import type { SearchHit, SearchSection, SectionQueryOptions, SectionSearchEngine, SectionSearchOptions } from './types';

export interface UseContentSearchOptions {
  /**
   * 直接提供 sections（SSR 场景：由 `queryCollectionSearchSections` 生成后传入）。
   * 提供时跳过 fetch。
   */
  sections?: SearchSection[] | (() => SearchSection[] | Promise<SearchSection[]>);
  /**
   * sections JSON payload 的 URL（dev 由 Vite 插件提供，SSG 由构建产物提供）。
   * 默认 `/__search.json`。
   */
  sectionsUrl?: string;
  /** 仅搜索指定 collections（`__search.json` 为 `{ [collection]: sections }`） */
  collections?: string | string[];
  /** 立即初始化引擎（默认 true）；`false` 时延迟到首次 search */
  immediate?: boolean;
  /** 引擎选项（MiniSearch 可用时的选项与降级 fallback 的权重） */
  searchOptions?: SectionSearchOptions;
}

export interface UseContentSearchReturn {
  status: Ref<'idle' | 'loading' | 'ready' | 'error'>;
  error: Ref<Error | null>;
  results: Ref<SearchHit[]>;
  /** 手动触发引擎初始化（`immediate: false` 时使用） */
  init: () => Promise<void>;
  /** 执行搜索；空查询清空结果。引擎懒初始化 */
  search: (query: string, options?: SectionQueryOptions) => Promise<SearchHit[]>;
}

/**
 * 客户端全文搜索 composable。
 *
 * 数据源优先级：
 * 1. `options.sections`（SSR 直传 / 静态导入）
 * 2. `fetch(options.sectionsUrl ?? '/__search.json')`（dev 中间件 / SSG 构建产物）
 *
 * 引擎：优先 MiniSearch（可选依赖，前缀 + 模糊匹配），未安装/加载失败时降级
 * 内置 fallback 引擎（精确/前缀匹配）。两者共享 CJK 感知分词器。
 *
 * 浏览器端必须注入 `searchOptions.loadMiniSearch`，字面量 import 才能被 Vite
 * 解析（详见 `UseContentSearchOptions.searchOptions` / `SectionSearchOptions`）。
 */
export function useContentSearch(options: UseContentSearchOptions = {}): UseContentSearchReturn {
  const status: Ref<'idle' | 'loading' | 'ready' | 'error'> = ref('idle');
  const error: Ref<Error | null> = ref(null);
  const results: Ref<SearchHit[]> = ref([]);

  let engine: SectionSearchEngine | null = null;
  let initPromise: Promise<void> | null = null;

  function filterCollections(payload: Record<string, SearchSection[]>): SearchSection[] {
    const wanted = options.collections
      ? Array.isArray(options.collections)
        ? options.collections
        : [options.collections]
      : null;
    if (!wanted) return Object.values(payload).flat();
    return wanted.flatMap(name => payload[name] ?? []);
  }

  async function loadSections(): Promise<SearchSection[]> {
    if (options.sections) {
      return typeof options.sections === 'function' ? await options.sections() : options.sections;
    }
    const res = await fetch(options.sectionsUrl ?? '/__search.json');
    if (!res.ok) {
      throw new Error(
        `Failed to load search sections from ${options.sectionsUrl ?? '/__search.json'}: HTTP ${res.status}`
      );
    }
    const payload = await res.json();
    return filterCollections(payload);
  }

  async function init(): Promise<void> {
    if (engine || status.value === 'loading') return initPromise ?? Promise.resolve();
    status.value = 'loading';
    error.value = null;
    initPromise = (async () => {
      try {
        const sections = await loadSections();
        engine = await createSectionSearch(sections, options.searchOptions);
        status.value = 'ready';
      } catch (err) {
        engine = null;
        error.value = err instanceof Error ? err : new Error(String(err));
        status.value = 'error';
      } finally {
        initPromise = null;
      }
    })();
    return initPromise;
  }

  async function search(query: string, queryOptions: SectionQueryOptions = {}): Promise<SearchHit[]> {
    if (!engine) await init();
    if (!engine) return [];
    results.value = query.trim() ? engine.search(query, queryOptions) : [];
    return results.value;
  }

  if (options.immediate !== false) {
    void init();
  }

  return { status, error, results, init, search };
}
