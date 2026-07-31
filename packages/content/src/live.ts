/**
 * P9-19: Live Content Collections
 *
 * Live Collections fetch content at request time from external sources
 * (CMS, APIs, databases), as opposed to build-time file-based collections.
 * This aligns with Astro 5.10+ Live Collections.
 *
 * Key features:
 * - `defineLiveCollection()` with a request-time loader function
 * - Optional in-memory caching with TTL
 * - Optional schema validation
 * - Full query builder support (where/sort/limit/skip/only/without)
 * - Registration with the content runtime for `queryCollection()` access
 *
 * Usage:
 * ```typescript
 * import { defineLiveCollection } from '@ubean/content';
 *
 * const products = defineLiveCollection({
 *   name: 'products',
 *   loader: async () => {
 *     const res = await fetch('https://api.example.com/products');
 *     const items = await res.json();
 *     return items.map(item => ({
 *       _id: `products:${item.id}`,
 *       _path: `/products/${item.slug}`,
 *       title: item.name,
 *       ...item
 *     }));
 *   },
 *   cache: { ttl: 60 } // cache for 60 seconds
 * });
 *
 * // Query at request time
 * const all = await products.list();
 * const item = await products.getItem('/products/widget');
 * const filtered = await products.query()
 *   .where('category', '==', 'electronics')
 *   .sort('price', 'asc')
 *   .find();
 * ```
 */
import type { ContentDocument, ContentCollection, ContentSchema, ContentQueryBuilder } from './types';

/**
 * A single entry in a live collection. Must include `_id` and `_path`
 * (same shape as `ContentDocument`, but without the file-system metadata).
 */
export interface LiveCollectionEntry {
  _id: string;
  _path: string;
  [key: string]: any;
}

/**
 * Parameters passed to the loader function.
 */
export interface LiveCollectionLoaderParams {
  /** Filter by a specific path (used by `getItem()`). */
  path?: string;
  /** Arbitrary filter params passed by the caller. */
  filter?: Record<string, any>;
}

/**
 * Loader function that fetches collection data at request time.
 * Returns an array of entries. Throw to signal an error.
 */
export type LiveCollectionLoader = (params: LiveCollectionLoaderParams) => Promise<LiveCollectionEntry[]>;

/**
 * Cache configuration for a live collection.
 */
export interface LiveCollectionCacheOptions {
  /** Time-to-live in seconds. 0 disables caching. */
  ttl: number;
  /** Optional cache key generator. Defaults to a stringified params. */
  key?: (params: LiveCollectionLoaderParams) => string;
}

/**
 * Options for defining a live collection.
 */
export interface LiveCollectionOptions {
  name: string;
  loader: LiveCollectionLoader;
  schema?: ContentSchema;
  cache?: LiveCollectionCacheOptions;
}

/**
 * A live collection that fetches data at request time.
 * Extends `ContentCollection` but with async `list()` and `getItem()`.
 */
export interface LiveCollection extends Omit<ContentCollection, 'documents' | 'list' | 'getItem' | 'query'> {
  isLive: true;
  loader: LiveCollectionLoader;
  schema?: ContentSchema;
  cache?: LiveCollectionCacheOptions;
  list(params?: LiveCollectionLoaderParams): Promise<ContentDocument[]>;
  getItem(path: string): Promise<ContentDocument | null>;
  query(params?: LiveCollectionLoaderParams): ContentQueryBuilder;
  /** Invalidate the cache, forcing the next fetch to call the loader. */
  invalidate(): void;
}

interface CacheEntry {
  data: ContentDocument[];
  expiresAt: number;
}

const liveCollections = new Map<string, LiveCollection>();

/**
 * Validate an entry against a schema. Only checks required fields and basic
 * types — does not perform full JSON Schema validation. Invalid entries
 * are logged to console.warn and still returned (lenient validation).
 */
function validateEntry(
  entry: LiveCollectionEntry,
  schema: ContentSchema | undefined,
  collectionName: string
): ContentDocument {
  if (!schema) {
    return entry as ContentDocument;
  }

  const doc: ContentDocument = {
    _type: 'json' as const,
    _extension: 'json',
    _dir: '',
    _file: '',
    _draft: false,
    _partial: false,
    _empty: false,
    ...entry
  };

  // Check required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (entry[field] === undefined) {
        console.warn(
          `[ubean/content] Live collection "${collectionName}": entry "${entry._id}" is missing required field "${field}"`
        );
      }
    }
  }

  // Check field types
  if (schema.properties) {
    for (const [field, fieldSchema] of Object.entries(schema.properties)) {
      const value = entry[field];
      if (value === undefined) continue;
      const expectedType = fieldSchema.type;
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (expectedType && actualType !== expectedType && !(expectedType === 'date' && value instanceof Date)) {
        console.warn(
          `[ubean/content] Live collection "${collectionName}": field "${field}" expected "${expectedType}" but got "${actualType}" in entry "${entry._id}"`
        );
      }
    }
  }

  return doc;
}

/**
 * Define a live collection that fetches content at request time.
 *
 * The loader is called on every request (unless caching is enabled).
 * Entries are converted to `ContentDocument` shape and can be queried
 * using the standard query builder.
 *
 * @param options Collection definition
 * @returns LiveCollection instance
 */
export function defineLiveCollection(options: LiveCollectionOptions): LiveCollection {
  const cacheStore = new Map<string, CacheEntry>();

  const fetchEntries = async (params: LiveCollectionLoaderParams = {}): Promise<ContentDocument[]> => {
    const cacheKey = options.cache?.key ? options.cache.key(params) : JSON.stringify(params);
    const now = Date.now();

    // Check cache
    if (options.cache && options.cache.ttl > 0) {
      const cached = cacheStore.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        return cached.data;
      }
    }

    // Fetch from loader
    const entries = await options.loader(params);
    const docs = entries.map(e => validateEntry(e, options.schema, options.name));

    // Store in cache
    if (options.cache && options.cache.ttl > 0) {
      cacheStore.set(cacheKey, {
        data: docs,
        expiresAt: now + options.cache.ttl * 1000
      });
    }

    return docs;
  };

  const collection: LiveCollection = {
    name: options.name,
    source: 'live',
    type: 'json',
    isLive: true,
    loader: options.loader,
    schema: options.schema,
    cache: options.cache,
    async list(params = {}) {
      return fetchEntries(params);
    },
    async getItem(path: string) {
      // Try to fetch a single item by passing the path filter to the loader.
      // If the loader doesn't support path filtering, fall back to filtering
      // the full list.
      const docs = await fetchEntries({ path });
      const found = docs.find(d => d._path === path);
      if (found) return found;
      // Fallback: fetch all and filter
      const all = await fetchEntries({});
      return all.find(d => d._path === path) || null;
    },
    query(params = {}) {
      // Note: query builder is synchronous but calls fetchEntries internally.
      // We use a lazy approach: create a builder over a snapshot fetched at
      // query time. For true async query support, use `list()` + manual filter.
      let docsPromise: Promise<ContentDocument[]> | null = null;
      const getDocs = () => {
        if (!docsPromise) {
          docsPromise = fetchEntries(params);
        }
        return docsPromise;
      };

      // Return a query builder that works with the async data.
      // Since createQueryBuilder expects synchronous documents, we create
      // a deferred builder that fetches on first `find()`/`findOne()` call.
      const deferredBuilder: ContentQueryBuilder = {
        where(fieldOrQuery: string | Record<string, any>, operator?: string, value?: any) {
          // Defer: store the clause and apply after fetch
          pendingWhere.push({ fieldOrQuery, operator, value });
          return deferredBuilder;
        },
        sort(field: string, direction: 'asc' | 'desc' = 'asc') {
          pendingSort.push({ field, direction });
          return deferredBuilder;
        },
        limit(count: number) {
          limitCount = count;
          return deferredBuilder;
        },
        skip(count: number) {
          skipCount = count;
          return deferredBuilder;
        },
        only(fields: string[]) {
          selectedFields = fields;
          return deferredBuilder;
        },
        without(fields: string[]) {
          excludedFields = fields;
          return deferredBuilder;
        },
        async find() {
          const docs = await getDocs();
          let result = applyFilters(docs);
          return applySelection(result);
        },
        async findOne() {
          limitCount = 1;
          const docs = await getDocs();
          const result = applyFilters(docs);
          return result[0] || null;
        },
        async findSurround(path: string, surroundOptions: { before?: number; after?: number } = {}) {
          const before = surroundOptions.before ?? 1;
          const after = surroundOptions.after ?? 1;
          const docs = await getDocs();
          const filtered = applyFilters(docs);
          const index = filtered.findIndex(d => d._path === path);
          if (index === -1) return [];
          const start = Math.max(0, index - before);
          const end = Math.min(filtered.length, index + after + 1);
          return applySelection(filtered.slice(start, end).filter((_, i) => i !== before));
        },
        async count() {
          const docs = await getDocs();
          return applyFilters(docs).length;
        }
      };

      let pendingWhere: Array<{ fieldOrQuery: string | Record<string, any>; operator?: string; value?: any }> = [];
      let pendingSort: Array<{ field: string; direction: 'asc' | 'desc' }> = [];
      let limitCount: number | null = null;
      let skipCount = 0;
      let selectedFields: string[] | null = null;
      let excludedFields: string[] | null = null;

      function applyFilters(docs: ContentDocument[]): ContentDocument[] {
        let result = [...docs];
        for (const w of pendingWhere) {
          if (typeof w.fieldOrQuery === 'object') {
            for (const [key, val] of Object.entries(w.fieldOrQuery)) {
              result = result.filter(d => getNested(d, key) === val);
            }
          } else {
            const field = w.fieldOrQuery;
            let op = w.operator;
            let val = w.value;
            if (val === undefined && w.operator !== undefined) {
              op = '==';
              val = w.operator;
            }
            result = result.filter(d => {
              const dv = getNested(d, field);
              switch (op) {
                case '=':
                case '==':
                case undefined:
                  return dv === val;
                case '!=':
                  return dv !== val;
                case '>':
                  return dv > val;
                case '>=':
                  return dv >= val;
                case '<':
                  return dv < val;
                case '<=':
                  return dv <= val;
                case 'contains':
                  return String(dv).includes(val);
                case 'in':
                  return Array.isArray(val) && val.includes(dv);
                case 'exists':
                  return val ? dv !== undefined : dv === undefined;
                default:
                  return dv === val;
              }
            });
          }
        }
        if (pendingSort.length === 0) {
          pendingSort = [{ field: '_path', direction: 'asc' }];
        }
        result.sort((a, b) => {
          for (const { field, direction } of pendingSort) {
            const av = getNested(a, field);
            const bv = getNested(b, field);
            if (av === bv) continue;
            const cmp = av < bv ? -1 : 1;
            return direction === 'desc' ? -cmp : cmp;
          }
          return 0;
        });
        if (skipCount > 0) result = result.slice(skipCount);
        if (limitCount !== null) result = result.slice(0, limitCount);
        return result;
      }

      function applySelection(docs: ContentDocument[]): ContentDocument[] {
        if (!selectedFields && !excludedFields) return docs;
        return docs.map(doc => {
          const newDoc: ContentDocument = { ...doc };
          if (excludedFields) {
            for (const f of excludedFields) delete (newDoc as Record<string, unknown>)[f];
          }
          if (selectedFields) {
            const kept: Record<string, unknown> = {};
            for (const f of selectedFields) kept[f] = (doc as Record<string, unknown>)[f];
            kept._id = doc._id;
            kept._path = doc._path;
            return kept as unknown as ContentDocument;
          }
          return newDoc;
        });
      }

      return deferredBuilder;
    },
    invalidate() {
      cacheStore.clear();
    }
  };

  liveCollections.set(options.name, collection);
  return collection;
}

/**
 * Get a registered live collection by name.
 */
export function getLiveCollection(name: string): LiveCollection | undefined {
  return liveCollections.get(name);
}

/**
 * List all registered live collection names.
 */
export function listLiveCollections(): string[] {
  return Array.from(liveCollections.keys());
}

/**
 * Clear all registered live collections (useful for testing).
 */
export function clearLiveCollections(): void {
  liveCollections.clear();
}

function getNested(obj: any, path: string): any {
  return path.split('.').reduce((o, key) => o?.[key], obj);
}
