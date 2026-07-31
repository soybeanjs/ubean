/**
 * P9-19: Live Content Collections — unit tests
 *
 * Tests `defineLiveCollection()` for:
 * - Basic list/getItem/query operations
 * - Loader function invocation
 * - Caching with TTL
 * - Schema validation (required fields + type checking)
 * - Registration and lookup
 * - Cache invalidation
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { defineLiveCollection, getLiveCollection, listLiveCollections, clearLiveCollections } from '../src/live';
import type { LiveCollectionEntry } from '../src/live';

const sampleEntries: LiveCollectionEntry[] = [
  { _id: 'products:1', _path: '/products/widget', title: 'Widget', price: 9.99, category: 'electronics' },
  { _id: 'products:2', _path: '/products/gadget', title: 'Gadget', price: 19.99, category: 'electronics' },
  { _id: 'products:3', _path: '/products/book', title: 'Book', price: 14.99, category: 'books' }
];

describe('P9-19: defineLiveCollection — basic operations', () => {
  beforeEach(() => {
    clearLiveCollections();
  });

  it('lists all entries via loader', async () => {
    const loader = vi.fn(async () => sampleEntries);
    const col = defineLiveCollection({ name: 'products', loader });
    const docs = await col.list();
    expect(docs).toHaveLength(3);
    expect(docs[0]._id).toBe('products:1');
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('gets a single item by path', async () => {
    const col = defineLiveCollection({
      name: 'products',
      loader: async () => sampleEntries
    });
    const item = await col.getItem('/products/widget');
    expect(item).not.toBeNull();
    expect(item!._id).toBe('products:1');
    expect(item!.title).toBe('Widget');
  });

  it('returns null for non-existent item', async () => {
    const col = defineLiveCollection({
      name: 'products',
      loader: async () => sampleEntries
    });
    const item = await col.getItem('/products/nonexistent');
    expect(item).toBeNull();
  });

  it('queries with where filter', async () => {
    const col = defineLiveCollection({
      name: 'products',
      loader: async () => sampleEntries
    });
    const results = await col.query().where('category', '==', 'electronics').find();
    expect(results).toHaveLength(2);
    expect(results[0].category).toBe('electronics');
  });

  it('queries with sort', async () => {
    const col = defineLiveCollection({
      name: 'products',
      loader: async () => sampleEntries
    });
    const results = await col.query().sort('price', 'desc').find();
    expect(results[0].price).toBe(19.99);
    expect(results[2].price).toBe(9.99);
  });

  it('queries with limit and skip', async () => {
    const col = defineLiveCollection({
      name: 'products',
      loader: async () => sampleEntries
    });
    const results = await col.query().sort('price', 'asc').skip(1).limit(1).find();
    expect(results).toHaveLength(1);
    expect(results[0].price).toBe(14.99);
  });

  it('queries with findOne', async () => {
    const col = defineLiveCollection({
      name: 'products',
      loader: async () => sampleEntries
    });
    const item = await col.query().where('category', '==', 'books').findOne();
    expect(item).not.toBeNull();
    expect(item!.title).toBe('Book');
  });

  it('counts entries', async () => {
    const col = defineLiveCollection({
      name: 'products',
      loader: async () => sampleEntries
    });
    const count = await col.query().count();
    expect(count).toBe(3);
  });

  it('selects fields with only()', async () => {
    const col = defineLiveCollection({
      name: 'products',
      loader: async () => sampleEntries
    });
    const results = await col.query().only(['title']).find();
    // Default sort is _path asc: /products/book < /products/gadget < /products/widget
    expect(results[0].title).toBe('Book');
    expect(results[0].price).toBeUndefined();
    // _id and _path are always kept
    expect(results[0]._id).toBe('products:3');
    expect(results[0]._path).toBe('/products/book');
  });

  it('excludes fields with without()', async () => {
    const col = defineLiveCollection({
      name: 'products',
      loader: async () => sampleEntries
    });
    const results = await col.query().without(['price']).find();
    // Default sort is _path asc: /products/book first
    expect(results[0].price).toBeUndefined();
    expect(results[0].title).toBe('Book');
  });
});

describe('P9-19: defineLiveCollection — caching', () => {
  beforeEach(() => {
    clearLiveCollections();
  });

  it('caches results within TTL', async () => {
    const loader = vi.fn(async () => sampleEntries);
    const col = defineLiveCollection({
      name: 'products',
      loader,
      cache: { ttl: 60 }
    });
    await col.list();
    await col.list();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('re-fetches after cache expires', async () => {
    const loader = vi.fn(async () => sampleEntries);
    const col = defineLiveCollection({
      name: 'products',
      loader,
      cache: { ttl: 0 } // 0 = no caching
    });
    await col.list();
    await col.list();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('invalidates cache on demand', async () => {
    const loader = vi.fn(async () => sampleEntries);
    const col = defineLiveCollection({
      name: 'products',
      loader,
      cache: { ttl: 60 }
    });
    await col.list();
    expect(loader).toHaveBeenCalledTimes(1);
    col.invalidate();
    await col.list();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('uses custom cache key', async () => {
    const loader = vi.fn(async params => {
      if (params.filter?.category === 'electronics') {
        return sampleEntries.filter(e => e.category === 'electronics');
      }
      return sampleEntries;
    });
    const col = defineLiveCollection({
      name: 'products',
      loader,
      cache: {
        ttl: 60,
        key: params => params.filter?.category || 'all'
      }
    });
    await col.list({ filter: { category: 'electronics' } });
    await col.list({ filter: { category: 'electronics' } });
    expect(loader).toHaveBeenCalledTimes(1);
    // Different params → different cache key → re-fetch
    await col.list({ filter: { category: 'books' } });
    expect(loader).toHaveBeenCalledTimes(2);
  });
});

describe('P9-19: defineLiveCollection — schema validation', () => {
  beforeEach(() => {
    clearLiveCollections();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warns on missing required fields', async () => {
    const entries: LiveCollectionEntry[] = [{ _id: 'items:1', _path: '/items/a', title: 'A' }];
    const col = defineLiveCollection({
      name: 'items',
      loader: async () => entries,
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string', required: true },
          price: { type: 'number' }
        },
        required: ['title', 'price']
      }
    });
    await col.list();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('missing required field "price"'));
  });

  it('warns on type mismatch', async () => {
    const entries: LiveCollectionEntry[] = [{ _id: 'items:1', _path: '/items/a', title: 123, price: 9.99 }];
    const col = defineLiveCollection({
      name: 'items',
      loader: async () => entries,
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          price: { type: 'number' }
        }
      }
    });
    await col.list();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('field "title" expected "string" but got "number"')
    );
  });

  it('does not warn when schema is valid', async () => {
    const entries: LiveCollectionEntry[] = [{ _id: 'items:1', _path: '/items/a', title: 'A', price: 9.99 }];
    const col = defineLiveCollection({
      name: 'items',
      loader: async () => entries,
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          price: { type: 'number' }
        },
        required: ['title', 'price']
      }
    });
    await col.list();
    expect(console.warn).not.toHaveBeenCalled();
  });
});

describe('P9-19: defineLiveCollection — registration', () => {
  beforeEach(() => {
    clearLiveCollections();
  });

  it('registers collection for lookup', () => {
    defineLiveCollection({
      name: 'articles',
      loader: async () => []
    });
    expect(listLiveCollections()).toContain('articles');
  });

  it('retrieves collection by name', () => {
    const col = defineLiveCollection({
      name: 'articles',
      loader: async () => []
    });
    const retrieved = getLiveCollection('articles');
    expect(retrieved).toBe(col);
  });

  it('returns undefined for unregistered collection', () => {
    expect(getLiveCollection('nonexistent')).toBeUndefined();
  });

  it('clears all collections', () => {
    defineLiveCollection({ name: 'a', loader: async () => [] });
    defineLiveCollection({ name: 'b', loader: async () => [] });
    expect(listLiveCollections()).toHaveLength(2);
    clearLiveCollections();
    expect(listLiveCollections()).toHaveLength(0);
  });

  it('marks collection as live', () => {
    const col = defineLiveCollection({
      name: 'products',
      loader: async () => sampleEntries
    });
    expect(col.isLive).toBe(true);
    expect(col.source).toBe('live');
  });
});

describe('P9-19: defineLiveCollection — query builder', () => {
  beforeEach(() => {
    clearLiveCollections();
  });

  it('supports object-style where', async () => {
    const col = defineLiveCollection({
      name: 'products',
      loader: async () => sampleEntries
    });
    const results = await col.query().where({ category: 'books' }).find();
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Book');
  });

  it('supports != operator', async () => {
    const col = defineLiveCollection({
      name: 'products',
      loader: async () => sampleEntries
    });
    const results = await col.query().where('category', '!=', 'electronics').find();
    expect(results).toHaveLength(1);
    expect(results[0].category).toBe('books');
  });

  it('supports > operator', async () => {
    const col = defineLiveCollection({
      name: 'products',
      loader: async () => sampleEntries
    });
    const results = await col.query().where('price', '>', 10).find();
    expect(results).toHaveLength(2);
  });

  it('supports findSurround', async () => {
    const col = defineLiveCollection({
      name: 'products',
      loader: async () => sampleEntries
    });
    const surrounding = await col.query().sort('price', 'asc').findSurround('/products/book', { before: 1, after: 1 });
    expect(surrounding).toHaveLength(2);
  });
});
