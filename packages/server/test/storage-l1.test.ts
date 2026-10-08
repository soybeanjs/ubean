/**
 * TS-34 · L2 → L1 下沉（域 6/6：storage）
 *
 * `packages/server/src/storage.ts` 的纯逻辑层此前只在 `packages/server/test/fs-cache.test.ts`
 * 里被顺带碰到（`createStorage` / `createMemoryDriver`），`useKV` / `createKV` 的语义、
 * TTL 过期、mount 的最长前缀匹配、KV 前缀剥离全部零覆盖；L2 的
 * `examples/ubean-test/test/storage.test.ts` 走的是 HTTP 端点。
 *
 * 这里覆盖的是存储层自己的契约。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearGlobalStorage, createKV, createMemoryDriver, createStorage, useKV, useStorage } from '../src/storage';

beforeEach(() => {
  clearGlobalStorage();
});

afterEach(() => {
  clearGlobalStorage();
  vi.useRealTimers();
});

describe('TS-34 · storage · createMemoryDriver', () => {
  it('未写入的键返回 undefined，写入后可读、删除后回到 undefined', async () => {
    const driver = createMemoryDriver();

    expect(await driver.getItemRaw('missing')).toBeUndefined();
    await driver.setItemRaw('a', { v: 1 });
    expect(await driver.getItemRaw('a')).toEqual({ v: 1 });
    await driver.removeItem('a');
    expect(await driver.getItemRaw('a')).toBeUndefined();
  });

  it('hasItem 反映存在性', async () => {
    const driver = createMemoryDriver();
    expect(await driver.hasItem('a')).toBe(false);
    await driver.setItemRaw('a', 1);
    expect(await driver.hasItem('a')).toBe(true);
  });

  it('getKeys(base) 按前缀过滤，base 为空时返回全部', async () => {
    const driver = createMemoryDriver();
    await driver.setItemRaw('users:1', 1);
    await driver.setItemRaw('users:2', 2);
    await driver.setItemRaw('posts:1', 3);

    expect((await driver.getKeys('users:')).sort()).toEqual(['users:1', 'users:2']);
    expect((await driver.getKeys(''))!.sort()).toEqual(['posts:1', 'users:1', 'users:2']);
    expect(await driver.getKeys('nope:')).toEqual([]);
  });

  it('clear(base) 只删前缀命中的键，无 base 时清空', async () => {
    const driver = createMemoryDriver();
    await driver.setItemRaw('users:1', 1);
    await driver.setItemRaw('posts:1', 3);

    await driver.clear('users:');
    expect(await driver.getItemRaw('users:1')).toBeUndefined();
    expect(await driver.getItemRaw('posts:1')).toBe(3);

    await driver.clear();
    expect(await driver.getKeys('')).toEqual([]);
  });

  it('存 undefined 与存 null 在 getItemRaw 层可区分（驱动本身不做空值归一）', async () => {
    const driver = createMemoryDriver();
    await driver.setItemRaw('n', null);
    await driver.setItemRaw('u', undefined);

    expect(await driver.getItemRaw('n')).toBeNull();
    expect(await driver.getItemRaw('u')).toBeUndefined();
    expect(await driver.hasItem('u')).toBe(true); // Map 里确实有这个键
  });
});

describe('TS-34 · storage · createStorage 基本读写', () => {
  it('set/get 往返任意 JSON 可序列化值', async () => {
    const storage = createStorage();

    await storage.set('obj', { a: 1, nested: { b: [1, 2] } });
    await storage.set('str', 'hello');
    await storage.set('num', 42);
    await storage.set('bool', false);
    await storage.set('arr', [1, 'two', null]);

    expect(await storage.get('obj')).toEqual({ a: 1, nested: { b: [1, 2] } });
    expect(await storage.get('str')).toBe('hello');
    expect(await storage.get('num')).toBe(42);
    expect(await storage.get('bool')).toBe(false);
    expect(await storage.get('arr')).toEqual([1, 'two', null]);
  });

  it('未写入的键 get 返回 null（不是 undefined）', async () => {
    const storage = createStorage();
    expect(await storage.get('missing')).toBeNull();
  });

  it('has 反映存在性，remove 后回到 false', async () => {
    const storage = createStorage();
    expect(await storage.has('a')).toBe(false);

    await storage.set('a', 1);
    expect(await storage.has('a')).toBe(true);

    await storage.remove('a');
    expect(await storage.has('a')).toBe(false);
  });

  it('keys() 返回全部键；keys(base) 按前缀过滤', async () => {
    const storage = createStorage();
    await storage.set('users:1', 1);
    await storage.set('users:2', 2);
    await storage.set('posts:1', 3);

    expect((await storage.keys()).sort()).toEqual(['posts:1', 'users:1', 'users:2']);
    expect((await storage.keys('users:')).sort()).toEqual(['users:1', 'users:2']);
    expect(await storage.keys('nope:')).toEqual([]);
  });

  it('clear() 清空全部；clear(base) 只清前缀命中', async () => {
    const storage = createStorage();
    await storage.set('users:1', 1);
    await storage.set('posts:1', 3);

    await storage.clear('users:');
    expect(await storage.get('users:1')).toBeNull();
    expect(await storage.get('posts:1')).toBe(3);

    await storage.clear();
    expect(await storage.keys()).toEqual([]);
  });

  it('用外部驱动的实例与传入的驱动共享数据', async () => {
    const driver = createMemoryDriver();
    const a = createStorage({ driver });
    const b = createStorage({ driver });

    await a.set('shared', 'value');

    expect(await b.get('shared')).toBe('value');
  });
});

describe('TS-34 · storage · createStorage TTL 与元信息', () => {
  it('未设 ttl 时 getMeta 只有 createdAt，没有 expiresAt/ttl', async () => {
    const storage = createStorage();
    await storage.set('k', 'v');

    const meta = (await storage.getMeta('k'))!;
    expect(meta.createdAt).toBeTypeOf('number');
    expect(meta.expiresAt).toBeUndefined();
    expect(meta.ttl).toBeUndefined();
  });

  it('设 ttl 后 getMeta 给出剩余秒数（向下取整）', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const storage = createStorage();
    await storage.set('k', 'v', 60);

    const meta = (await storage.getMeta('k'))!;
    expect(meta.ttl).toBe(60);
    expect(meta.expiresAt).toBe(Date.now() + 60_000);
  });

  it('ttl 未到期时仍可读，剩余 ttl 随时间减少', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const storage = createStorage();
    await storage.set('k', 'v', 60);

    vi.advanceTimersByTime(30_000);

    expect(await storage.get('k')).toBe('v');
    expect((await storage.getMeta('k'))!.ttl).toBe(30);
  });

  it('ttl 到期后 get 返回 null，has 返回 false，getMeta 返回 null', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const storage = createStorage();
    await storage.set('k', 'v', 10);

    vi.advanceTimersByTime(10_000); // 到点即算过期（用 >= 比较）

    expect(await storage.get('k')).toBeNull();
    expect(await storage.has('k')).toBe(false);
    expect(await storage.getMeta('k')).toBeNull();
  });

  it('过期项在首次读取时被物理删除（惰性清除），键不再出现在 keys() 里', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const storage = createStorage();
    await storage.set('stale', 'v', 1);
    await storage.set('fresh', 'v', 600);

    vi.advanceTimersByTime(2000);
    expect((await storage.keys()).sort()).toEqual(['fresh', 'stale']); // 尚未读取，物理上还在

    expect(await storage.get('stale')).toBeNull(); // 触发惰性清除
    expect(await storage.keys()).toEqual(['fresh']);
  });

  it('ttl 为 0 / falsy 时视为不过期（不会立即过期）', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const storage = createStorage();
    await storage.set('k', 'v', 0);

    vi.advanceTimersByTime(1_000_000);

    expect(await storage.get('k')).toBe('v');
    expect((await storage.getMeta('k'))!.expiresAt).toBeUndefined();
  });

  it('重新 set 会刷新 createdAt 与过期时间', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const storage = createStorage();
    await storage.set('k', 'v1', 10);
    const first = (await storage.getMeta('k'))!;

    vi.advanceTimersByTime(5000);
    await storage.set('k', 'v2', 10);
    const second = (await storage.getMeta('k'))!;

    expect(second.createdAt).toBeGreaterThan(first.createdAt!);
    expect(second.expiresAt).toBe(Date.now() + 10_000);
    expect(await storage.get('k')).toBe('v2');
  });
});

describe('TS-34 · storage · createStorage base 与 mount', () => {
  it('base 选项给所有键加统一前缀（存储层对外仍是裸键）', async () => {
    const driver = createMemoryDriver();
    const storage = createStorage({ driver, base: 'app' });

    await storage.set('k', 'v');

    expect(await storage.get('k')).toBe('v');
    expect(await storage.keys()).toEqual(['k']);
    expect(await driver.getKeys('')).toEqual(['app:k']);
  });

  it('base 末尾斜杠被归一（不会产生 `app/:k`）', async () => {
    const driver = createMemoryDriver();
    const storage = createStorage({ driver, base: 'app/' });
    await storage.set('k', 'v');
    expect(await driver.getKeys('')).toEqual(['app:k']);
  });

  it('mount 的驱动接管匹配前缀的键，其它键仍走根驱动', async () => {
    const root = createMemoryDriver();
    const mounted = createMemoryDriver();
    const storage = createStorage({ driver: root });
    storage.mount('cache', mounted);

    await storage.set('cache:page', 'html');
    await storage.set('other', 'plain');

    expect(await root.getKeys('')).toEqual(['other']);
    expect(await mounted.getKeys('')).toEqual(['page']);
    expect(await storage.get('cache:page')).toBe('html');
    expect(await storage.get('other')).toBe('plain');
  });

  it('mount 按最长前缀匹配（users:admin 优先于 users）', async () => {
    const root = createMemoryDriver();
    const users = createMemoryDriver();
    const admins = createMemoryDriver();
    const storage = createStorage({ driver: root });
    storage.mount('users', users);
    storage.mount('users:admin', admins);

    await storage.set('users:u1', 'normal');
    await storage.set('users:admin:a1', 'admin');

    expect(await users.getKeys('')).toEqual(['u1']);
    expect(await admins.getKeys('')).toEqual(['a1']);
  });

  it('mount 的前缀是**整段**匹配：`users` 不会接管 `users2:x`', async () => {
    const root = createMemoryDriver();
    const users = createMemoryDriver();
    const storage = createStorage({ driver: root });
    storage.mount('users', users);

    await storage.set('users2:x', 'v');

    expect(await users.getKeys('')).toEqual([]);
    expect(await root.getKeys('')).toEqual(['users2:x']);
  });

  it('mount 与 base 组合时前缀叠加', async () => {
    const root = createMemoryDriver();
    const mounted = createMemoryDriver();
    const storage = createStorage({ driver: root, base: 'app' });
    storage.mount('cache', mounted);

    await storage.set('cache:page', 'html');

    expect(await mounted.getKeys('')).toEqual(['page']);
    expect(await storage.get('cache:page')).toBe('html');
  });

  it('已知边界：keys()/clear() 只看根驱动，不列/不清挂载驱动的键', async () => {
    const root = createMemoryDriver();
    const mounted = createMemoryDriver();
    const storage = createStorage({ driver: root });
    storage.mount('cache', mounted);

    await storage.set('cache:page', 'html');
    await storage.set('other', 'plain');

    // 这是一个真实边界（不是期望行为）：mounted 上的键对 keys() 不可见
    expect(await storage.keys()).toEqual(['other']);
    expect(await storage.keys('cache:')).toEqual([]);

    await storage.clear();
    expect(await storage.get('cache:page')).toBe('html'); // mounted 未被清
  });

  it('getMeta 对挂载键同样有效（经 mount 解析到对应驱动）', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const mounted = createMemoryDriver();
    const storage = createStorage();
    storage.mount('cache', mounted);

    await storage.set('cache:page', 'html', 30);

    expect((await storage.getMeta('cache:page'))!.ttl).toBe(30);
    expect(await mounted.getKeys('')).toEqual(['page']);
  });
});

describe('TS-34 · storage · useStorage / clearGlobalStorage 单例', () => {
  it('无参调用返回同一个全局实例', () => {
    const a = useStorage();
    const b = useStorage();
    expect(a).toBe(b);
  });

  it('传入实例时切换全局单例并返回它', () => {
    const custom = createStorage();
    expect(useStorage(custom)).toBe(custom);
    expect(useStorage()).toBe(custom);
  });

  it('clearGlobalStorage 之后重新无参调用会得到新实例', () => {
    const first = useStorage();
    clearGlobalStorage();
    const second = useStorage();
    expect(second).not.toBe(first);
  });

  it('旧全局实例上的数据不会泄漏到新实例', async () => {
    const first = useStorage();
    await first.set('k', 'v');
    clearGlobalStorage();
    const second = useStorage();

    expect(await second.get('k')).toBeNull();
  });
});

describe('TS-34 · storage · createKV', () => {
  it('默认前缀为 kv:default，值经 JSON 序列化后存入 storage 层', async () => {
    const storage = createStorage();
    useStorage(storage);
    const kv = createKV();

    await kv.set('user', { id: 1 });

    expect(await kv.get<{ id: number }>('user')).toEqual({ id: 1 });
    expect(await storage.get('kv:default:user')).toBe(JSON.stringify({ id: 1 }));
  });

  it('自定义 prefix 生效', async () => {
    const storage = createStorage();
    useStorage(storage);
    const kv = createKV({ prefix: 'session' });

    await kv.set('a', 1);

    expect(await storage.get('session:a')).toBe('1');
  });

  it('自定义 serialize / deserialize 被使用', async () => {
    const storage = createStorage();
    useStorage(storage);
    const kv = createKV<number>({ serialize: v => `v=${v}`, deserialize: raw => Number(raw.slice(2)) });

    await kv.set('n', 7);

    expect(await storage.get('kv:default:n')).toBe('v=7');
    expect(await kv.get('n')).toBe(7);
  });

  it('options.ttl 作为 set 的默认过期时间，显式 ttl 覆盖它', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const storage = createStorage();
    useStorage(storage);
    const kv = createKV<number>({ ttl: 60 });

    await kv.set('default-ttl', 1);
    await kv.set('explicit-ttl', 2, 5);

    expect((await storage.getMeta('kv:default:default-ttl'))!.ttl).toBe(60);
    expect((await storage.getMeta('kv:default:explicit-ttl'))!.ttl).toBe(5);
  });

  it('get 未写入的键返回 null；has 反映存在性；remove 后回到 false', async () => {
    useStorage(createStorage());
    const kv = createKV();

    expect(await kv.get('missing')).toBeNull();
    expect(await kv.has('missing')).toBe(false);

    await kv.set('k', 'v');
    expect(await kv.has('k')).toBe(true);

    await kv.remove('k');
    expect(await kv.has('k')).toBe(false);
  });

  it('keys() 剥掉前缀，只留逻辑键名', async () => {
    useStorage(createStorage());
    const kv = createKV();
    await kv.set('a', 1);
    await kv.set('b', 2);

    expect((await kv.keys()).sort()).toEqual(['a', 'b']);
  });

  it('clear() 只清掉本前缀下的键，不影响其它前缀', async () => {
    const storage = createStorage();
    useStorage(storage);
    const kvA = createKV({ prefix: 'kv:a' });
    const kvB = createKV({ prefix: 'kv:b' });

    await kvA.set('x', 1);
    await kvB.set('x', 2);

    await kvA.clear();

    expect(await kvA.get('x')).toBeNull();
    expect(await kvB.get('x')).toBe(2);
  });

  it('反序列化失败会向上抛（不静默返回 null）', async () => {
    const storage = createStorage();
    useStorage(storage);
    const kv = createKV();

    await storage.set('kv:default:bad', 'not json{');

    await expect(kv.get('bad')).rejects.toThrow();
  });

  it('已知边界：keys() 用前缀匹配，`kv:defaultX:foo` 也会被算进来', async () => {
    const storage = createStorage();
    useStorage(storage);
    const kv = createKV();

    await kv.set('real', 1);
    await storage.set('kv:defaultX:extra', '1');

    // 这是真实行为（前缀不是整段匹配）：`kv:defaultX:extra` 命中了 `kv:default` 前缀，
    // 再被 slice(prefix.length + 1) 切掉多一个字符 → 得到 `:extra`
    expect((await kv.keys()).sort()).toEqual([':extra', 'real']);
  });
});

describe('TS-34 · storage · useKV 命名空间单例', () => {
  it('同名调用返回同一实例', () => {
    useStorage(createStorage());
    expect(useKV('cache')).toBe(useKV('cache'));
  });

  it('不同名得到不同实例，且前缀按名隔离', async () => {
    const storage = createStorage();
    useStorage(storage);
    const a = useKV<number>('a');
    const b = useKV<number>('b');

    await a.set('k', 1);
    await b.set('k', 2);

    expect(await storage.get('kv:a:k')).toBe('1');
    expect(await storage.get('kv:b:k')).toBe('2');
    expect(await a.get('k')).toBe(1);
  });

  it('默认名字为 default', async () => {
    const storage = createStorage();
    useStorage(storage);

    await useKV<number>().set('k', 9);

    expect(await storage.get('kv:default:k')).toBe('9');
  });

  it('第二次调用传入的 options 被忽略（单例已存在）', async () => {
    useStorage(createStorage());
    const first = useKV<number>('cache', { ttl: 10 });
    await first.set('k', 1);

    const second = useKV<number>('cache', { ttl: 9999 });

    expect(second).toBe(first);
    expect(await first.get('k')).toBe(1);
  });
});
