export interface StorageDriver {
  getItemRaw(key: string): Promise<unknown>;
  setItemRaw(key: string, value: unknown): Promise<void>;
  removeItem(key: string): Promise<void>;
  getKeys(base?: string): Promise<string[]>;
  clear(base?: string): Promise<void>;
  hasItem(key: string): Promise<boolean>;
}

export interface UbeanStorage {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T, ttl?: number): Promise<void>;
  remove(key: string): Promise<void>;
  keys(base?: string): Promise<string[]>;
  clear(base?: string): Promise<void>;
  has(key: string): Promise<boolean>;
  getMeta(key: string): Promise<{ ttl?: number; createdAt?: number; expiresAt?: number } | null>;
  mount(base: string, driver: StorageDriver): void;
}

interface StorageEntry<T = unknown> {
  value: T;
  createdAt: number;
  expiresAt?: number;
}

export function createMemoryDriver(): StorageDriver {
  const store = new Map<string, unknown>();

  return {
    async getItemRaw(key: string): Promise<unknown> {
      return store.get(key);
    },

    async setItemRaw(key: string, value: unknown): Promise<void> {
      store.set(key, value);
    },

    async removeItem(key: string): Promise<void> {
      store.delete(key);
    },

    async getKeys(base?: string): Promise<string[]> {
      const prefix = base || '';
      return Array.from(store.keys()).filter(k => k.startsWith(prefix));
    },

    async clear(base?: string): Promise<void> {
      if (!base) {
        store.clear();
        return;
      }
      for (const key of Array.from(store.keys())) {
        if (key.startsWith(base)) {
          store.delete(key);
        }
      }
    },

    async hasItem(key: string): Promise<boolean> {
      return store.has(key);
    }
  };
}

export function createStorage(options: { driver?: StorageDriver; base?: string } = {}): UbeanStorage {
  const mounts = new Map<string, StorageDriver>();
  const rootDriver = options.driver || createMemoryDriver();
  const rootBase = options.base ? `${options.base.replace(/\/$/, '')  }:` : '';

  function resolveKey(key: string): { driver: StorageDriver; relativeKey: string } {
    const fullKey = rootBase + key;
    let bestMatch = '';
    let bestDriver: StorageDriver = rootDriver;
    for (const [base, driver] of mounts) {
      if (fullKey.startsWith(`${base  }:`) && base.length > bestMatch.length) {
        bestMatch = base;
        bestDriver = driver;
      }
    }
    const relativeKey = bestMatch ? fullKey.slice(bestMatch.length + 1) : fullKey;
    return { driver: bestDriver, relativeKey };
  }

  async function getEntry<T>(key: string): Promise<StorageEntry<T> | null> {
    const { driver, relativeKey } = resolveKey(key);
    const raw = await driver.getItemRaw(relativeKey);
    if (raw === undefined || raw === null) return null;
    const entry = raw as StorageEntry<T>;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      await driver.removeItem(relativeKey);
      return null;
    }
    return entry;
  }

  return {
    async get<T>(key: string): Promise<T | null> {
      const entry = await getEntry<T>(key);
      return entry ? entry.value : null;
    },

    async set<T>(key: string, value: T, ttl?: number): Promise<void> {
      const { driver, relativeKey } = resolveKey(key);
      const entry: StorageEntry<T> = {
        value,
        createdAt: Date.now(),
        expiresAt: ttl ? Date.now() + ttl * 1000 : undefined
      };
      await driver.setItemRaw(relativeKey, entry);
    },

    async remove(key: string): Promise<void> {
      const { driver, relativeKey } = resolveKey(key);
      await driver.removeItem(relativeKey);
    },

    async keys(base?: string): Promise<string[]> {
      const prefix = base || '';
      const rootPrefix = rootBase;
      const results = new Set<string>();
      const rootKeys = await rootDriver.getKeys(rootPrefix);
      for (const k of rootKeys) {
        const stripped = k.slice(rootPrefix.length);
        if (!prefix || stripped.startsWith(prefix)) {
          results.add(stripped);
        }
      }
      return Array.from(results);
    },

    async clear(base?: string): Promise<void> {
      const rootPrefix = rootBase + (base || '');
      const rootKeys = await rootDriver.getKeys(rootPrefix);
      for (const k of rootKeys) {
        await rootDriver.removeItem(k);
      }
    },

    async has(key: string): Promise<boolean> {
      const entry = await getEntry(key);
      return entry !== null;
    },

    async getMeta(key: string) {
      const entry = await getEntry(key);
      if (!entry) return null;
      return {
        ttl: entry.expiresAt ? Math.max(0, Math.floor((entry.expiresAt - Date.now()) / 1000)) : undefined,
        createdAt: entry.createdAt,
        expiresAt: entry.expiresAt
      };
    },

    mount(base: string, driver: StorageDriver): void {
      mounts.set(rootBase + base.replace(/\/$/, ''), driver);
    }
  };
}

let globalStorage: UbeanStorage | null = null;

export function useStorage(storage?: UbeanStorage): UbeanStorage {
  if (storage) {
    globalStorage = storage;
    return storage;
  }
  if (!globalStorage) {
    globalStorage = createStorage();
  }
  return globalStorage;
}

export function clearGlobalStorage(): void {
  globalStorage = null;
}

export interface KVOptions<T = unknown> {
  ttl?: number;
  prefix?: string;
  serialize?: (value: T) => string;
  deserialize?: (raw: string) => T;
}

export interface KVNamespace<T = unknown> {
  get(key: string): Promise<T | null>;
  set(key: string, value: T, ttl?: number): Promise<void>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
  has(key: string): Promise<boolean>;
  clear(): Promise<void>;
}

export function createKV<T = unknown>(options: KVOptions<T> = {}): KVNamespace<T> {
  const storage = useStorage();
  const prefix = options.prefix || 'kv:default';
  const serialize = options.serialize || ((v: T) => JSON.stringify(v));
  const deserialize = options.deserialize || ((raw: string) => JSON.parse(raw) as T);

  const fullKey = (key: string) => `${prefix}:${key}`;

  return {
    async get(key: string): Promise<T | null> {
      const raw = await storage.get<string>(fullKey(key));
      if (raw === null) return null;
      return deserialize(raw);
    },

    async set(key: string, value: T, ttl?: number): Promise<void> {
      await storage.set(fullKey(key), serialize(value), ttl ?? options.ttl);
    },

    async remove(key: string): Promise<void> {
      await storage.remove(fullKey(key));
    },

    async keys(): Promise<string[]> {
      const all = await storage.keys(prefix);
      return all.map(k => k.slice(prefix.length + 1)).filter(k => k.length > 0);
    },

    async has(key: string): Promise<boolean> {
      return storage.has(fullKey(key));
    },

    async clear(): Promise<void> {
      await storage.clear(prefix);
    }
  };
}

const namespaces = new Map<string, KVNamespace>();

export function useKV<T = unknown>(name: string = 'default', options?: KVOptions<T>): KVNamespace<T> {
  if (namespaces.has(name)) {
    return namespaces.get(name) as KVNamespace<T>;
  }
  const ns = createKV<T>({ ...options, prefix: `kv:${name}` });
  namespaces.set(name, ns as KVNamespace);
  return ns;
}
