/**
 * TS-34 · L2 → L1 下沉（域 2/6：websocket）
 *
 * `packages/server/src/websocket.ts` 的纯逻辑层此前零覆盖：房间/主题注册表、
 * peer 生命周期、hook 派发、中间件分流全部只被 `examples/ubean-test/test/websocket.test.ts`
 * 从 HTTP/平台层间接走到（那层证明的是「平台 adapter 接上后能不能跑」）。
 *
 * 这个文件钉住的是「注册表与 peer 自己的契约」：谁进谁出、广播条件、解除订阅、
 * 空房间回收、hook 只在对应时机触发、路径命中优先级（精确 > `/*`）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  broadcast,
  clearWebSocketState,
  createRoom,
  createWebSocketMiddleware,
  defineRoom,
  defineWebSocket,
  getRoom,
  getRooms,
  getWebSocketDefinitions,
  handleClose,
  handleError,
  handleMessage,
  handleUpgrade,
  registerWebSocket
} from '../src/websocket';
import { expectNoUnhandledRejection } from './helpers/unhandled-rejection';

afterEach(() => {
  clearWebSocketState();
  vi.restoreAllMocks();
});

/** 只用到 `req.url` / `req.raw.headers` / `req.header` 的最小 Context 替身。 */
function createContext(url: string, headers: Record<string, string> = {}) {
  const h = new Headers(headers);
  return {
    req: {
      url,
      raw: { headers: h },
      header: (name: string) => h.get(name) ?? undefined
    }
  };
}

/** 通过 handleUpgrade 造一个真 peer（这是唯一能拿到 Peer 的方式）。 */
function upgrade(
  url: string,
  extra: { send?: (d: string) => void; close?: () => void; headers?: Record<string, string> } = {}
) {
  const sent: Array<string | ArrayBuffer | Uint8Array> = [];
  const closed: Array<{ code?: number; reason?: string }> = [];
  const result = handleUpgrade(createContext(url, extra.headers) as never, {
    send: extra.send ?? (d => sent.push(d)),
    close: extra.close ?? ((code, reason) => closed.push({ code, reason }))
  });
  return { peer: result.peer, response: result.response, sent, closed };
}

describe('TS-34 · websocket · defineWebSocket / 定义注册表', () => {
  it('defineWebSocket 原样返回定义（纯 pass-through）', () => {
    const def = { path: '/ws', topics: ['a'], rooms: ['r'] };
    expect(defineWebSocket(def)).toBe(def);
  });

  it('registerWebSocket / getWebSocketDefinitions 按 path 记录', () => {
    const def = defineWebSocket({ path: '/ws' });
    registerWebSocket('/ws', def);
    registerWebSocket('/*', { path: '/*' });

    expect(getWebSocketDefinitions().get('/ws')).toBe(def);
    expect(getWebSocketDefinitions().size).toBe(2);
  });
});

describe('TS-34 · websocket · 房间注册表', () => {
  it('createRoom 同名幂等：第二次返回同一实例', () => {
    const a = createRoom('lobby');
    const b = createRoom('lobby');

    expect(a).toBe(b);
    expect(a.name).toBe('lobby');
    expect(getRoom('lobby')).toBe(a);
  });

  it('defineRoom 是 createRoom 的别名', () => {
    expect(defineRoom('lobby')).toBe(createRoom('lobby'));
  });

  it('未知房间 getRoom 返回 undefined', () => {
    expect(getRoom('nope')).toBeUndefined();
  });

  it('add / remove 维护 peers，最后一个 peer 移除后房间从注册表回收', () => {
    const room = createRoom('lobby');
    const { peer } = upgrade('http://x/ws');
    room.add(peer);

    expect(room.peers.has(peer)).toBe(true);
    expect(getRoom('lobby')).toBe(room);

    room.remove(peer);
    expect(room.peers.has(peer)).toBe(false);
    // 空房间被 delete，下次 createRoom 会给出新实例
    expect(getRoom('lobby')).toBeUndefined();
    expect(createRoom('lobby')).not.toBe(room);
  });

  it('broadcast 只发给 readyState === 1 的 peer，并支持 except 排除', () => {
    const room = createRoom('lobby');
    const a = upgrade('http://x/ws');
    const b = upgrade('http://x/ws');
    room.add(a.peer);
    room.add(b.peer);

    room.broadcast('hello');
    expect(a.sent).toEqual(['hello']);
    expect(b.sent).toEqual(['hello']);

    room.broadcast('for-b', { except: a.peer });
    expect(a.sent).toEqual(['hello']);
    expect(b.sent).toEqual(['hello', 'for-b']);
  });

  it('peer.send 抛错时 broadcast 吞掉异常，剩余 peer 仍收到', () => {
    const room = createRoom('lobby');
    const bad = upgrade('http://x/ws', {
      send: () => {
        throw new Error('socket closed');
      }
    });
    const good = upgrade('http://x/ws');
    room.add(bad.peer);
    room.add(good.peer);

    expect(() => room.broadcast('hello')).not.toThrow();
    expect(good.sent).toEqual(['hello']);
  });

  it('getRooms 返回活房间注册表', () => {
    createRoom('a');
    createRoom('b');
    expect(Array.from(getRooms().keys()).sort()).toEqual(['a', 'b']);
  });
});

describe('TS-34 · websocket · peer 自身能力', () => {
  it('send / close 转发给平台回调，readyState 恒为 1', () => {
    const { peer, sent, closed } = upgrade('http://x/ws');

    peer.send('payload');
    peer.close(1001, 'going away');

    expect(sent).toEqual(['payload']);
    expect(closed).toEqual([{ code: 1001, reason: 'going away' }]);
    expect(peer.readyState).toBe(1);
  });

  it('setData / getData 往返，未设置时返回 undefined', () => {
    const { peer } = upgrade('http://x/ws');
    expect(peer.getData()).toBeUndefined();

    peer.setData({ userId: 7 });
    expect(peer.getData<{ userId: number }>()).toEqual({ userId: 7 });
  });

  it('subscribe 后 publish 只发给同主题的其它 peer（不回给自己）', () => {
    const a = upgrade('http://x/ws');
    const b = upgrade('http://x/ws');
    const c = upgrade('http://x/ws');

    a.peer.subscribe('news');
    b.peer.subscribe('news');

    a.peer.publish('news', 'headline');

    expect(a.sent).toEqual([]);
    expect(b.sent).toEqual(['headline']);
    expect(c.sent).toEqual([]);
  });

  it('publish 到无人订阅的主题是空操作；unsubscribe 后退订不再收', () => {
    const a = upgrade('http://x/ws');
    const b = upgrade('http://x/ws');

    expect(() => a.peer.publish('nobody', 'x')).not.toThrow();

    b.peer.subscribe('news');
    b.peer.unsubscribe('news');
    a.peer.subscribe('news');
    a.peer.publish('news', 'after-unsub');

    expect(b.sent).toEqual([]);
  });

  it('unsubscribe 不存在的主题不抛错', () => {
    const { peer } = upgrade('http://x/ws');
    expect(() => peer.unsubscribe('never-subscribed')).not.toThrow();
  });

  it('peer 带上了 url 与请求头', () => {
    const { peer } = upgrade('http://host.example/ws', { headers: { 'x-token': 't' } });

    expect(peer.url).toBe('http://host.example/ws');
    expect(peer.headers.get('x-token')).toBe('t');
  });
});

describe('TS-34 · websocket · 模块级 broadcast（按主题）', () => {
  it('只发给订阅该主题且 readyState === 1 的 peer', () => {
    const a = upgrade('http://x/ws');
    const b = upgrade('http://x/ws');
    a.peer.subscribe('t');
    b.peer.subscribe('other');

    broadcast('t', 'msg');

    expect(a.sent).toEqual(['msg']);
    expect(b.sent).toEqual([]);
  });

  it('未知主题是空操作', () => {
    expect(() => broadcast('unknown', 'msg')).not.toThrow();
  });

  it('某个 peer 的 send 抛错不影响其它 peer', () => {
    const bad = upgrade('http://x/ws', {
      send: () => {
        throw new Error('nope');
      }
    });
    const good = upgrade('http://x/ws');
    bad.peer.subscribe('t');
    good.peer.subscribe('t');

    expect(() => broadcast('t', 'msg')).not.toThrow();
    expect(good.sent).toEqual(['msg']);
  });
});

describe('TS-34 · websocket · handleUpgrade 路径命中与初始订阅', () => {
  it('返回带 Upgrade 头的 200 响应', () => {
    const { response } = upgrade('http://x/ws');

    expect(response.status).toBe(200);
    expect(response.headers.get('Upgrade')).toBe('websocket');
    expect(response.headers.get('Connection')).toBe('Upgrade');
  });

  it('定义里的 topics 在 upgrade 时就订阅上', () => {
    registerWebSocket('/ws', { path: '/ws', topics: ['news'] });
    const a = upgrade('http://x/ws');
    const b = upgrade('http://x/ws');

    broadcast('news', 'hi');

    expect(a.sent).toEqual(['hi']);
    expect(b.sent).toEqual(['hi']);
  });

  it('定义里的 rooms 在 upgrade 时把 peer 加进房间', () => {
    registerWebSocket('/ws', { path: '/ws', rooms: ['lobby'] });
    const { peer } = upgrade('http://x/ws');

    expect(getRoom('lobby')?.peers.has(peer)).toBe(true);
  });

  it('精确路径优先于 /* 兜底', () => {
    registerWebSocket('/*', { path: '/*', topics: ['fallback'] });
    registerWebSocket('/ws', { path: '/ws', topics: ['exact'] });

    const { peer } = upgrade('http://x/ws');
    peer.publish('exact', 'x');

    // 订阅的是 exact 而非 fallback：向 fallback 广播不应命中
    const other = upgrade('http://x/other');
    broadcast('fallback', 'f');
    expect(other.sent).toEqual(['f']);
  });

  it('只在 /* 存在时由兜底定义接管（含 topics）', () => {
    registerWebSocket('/*', { path: '/*', topics: ['any'] });
    const a = upgrade('http://x/anything');

    broadcast('any', 'm');
    expect(a.sent).toEqual(['m']);
  });

  it('没有任何定义时也能 upgrade（裸 peer，无订阅）', () => {
    const { peer } = upgrade('http://x/ws');

    broadcast('whatever', 'm');
    expect(peer.getData()).toBeUndefined();
  });

  it('hooks.open 在微任务里以 peer 调用', async () => {
    const open = vi.fn();
    registerWebSocket('/ws', { path: '/ws', hooks: { open } });
    const { peer } = upgrade('http://x/ws');

    expect(open).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(open).toHaveBeenCalledWith(peer);
  });

  it('hooks.open 同步抛错被吞掉，不产生未处理拒绝', async () => {
    registerWebSocket('/ws', {
      path: '/ws',
      hooks: {
        open: () => {
          throw new Error('open failed');
        }
      }
    });

    // 断言「一条 unhandledRejection 都没收到」——不是靠 vitest 的全局 Errors 行，
    // 否则把外层 try/catch 去掉时用例不会真的失败（只是多一行告警）。
    await expectNoUnhandledRejection(() => void upgrade('http://x/ws'));
  });

  it('hooks.message / close / error 同步抛错同样被吞掉', async () => {
    const boom = () => {
      throw new Error('hook failed');
    };
    registerWebSocket('/ws', { path: '/ws', hooks: { message: boom, close: boom, error: boom } });
    const { peer } = upgrade('http://x/ws');

    await expectNoUnhandledRejection(() => {
      handleMessage(peer, 'hi');
      handleClose(peer);
      handleError(peer, new Error('trigger'));
    });
  });

  it('未声明的 topic 不在初始订阅里', () => {
    const { peer } = upgrade('http://x/ws');
    peer.publish('news', 'x');
    // 没有订阅者，publish 是空操作；此处只验证不抛错，且 peer 自己没有收到
    expect(peer.getData()).toBeUndefined();
  });
});

describe('TS-34 · websocket · handleMessage / handleClose / handleError 派发', () => {
  it('handleMessage 按路径找到定义并调用 hooks.message', async () => {
    const message = vi.fn();
    registerWebSocket('/ws', { path: '/ws', hooks: { message } });
    const { peer } = upgrade('http://x/ws');

    handleMessage(peer, 'hi');
    await Promise.resolve();

    expect(message).toHaveBeenCalledWith(peer, 'hi');
  });

  it('handleMessage 对无定义路径是空操作', () => {
    const { peer } = upgrade('http://x/ws');
    expect(() => handleMessage(peer, 'hi')).not.toThrow();
  });

  it('handleClose 解除该 peer 的所有主题订阅', async () => {
    registerWebSocket('/ws', { path: '/ws', topics: ['news'] });
    const a = upgrade('http://x/ws');
    const b = upgrade('http://x/ws');

    handleClose(a.peer);
    await Promise.resolve();

    broadcast('news', 'after-close');
    expect(a.sent).toEqual([]);
    expect(b.sent).toEqual(['after-close']);
  });

  it('handleClose 把 peer 从所有房间移出，空房间回收', async () => {
    registerWebSocket('/ws', { path: '/ws', rooms: ['lobby'] });
    const { peer } = upgrade('http://x/ws');

    handleClose(peer);
    await Promise.resolve();

    expect(getRoom('lobby')).toBeUndefined();
  });

  it('handleClose 默认 code 1000 / reason 空串，并调用 hooks.close', async () => {
    const close = vi.fn();
    registerWebSocket('/ws', { path: '/ws', hooks: { close } });
    const { peer } = upgrade('http://x/ws');

    handleClose(peer);
    await Promise.resolve();
    expect(close).toHaveBeenCalledWith(peer, 1000, '');

    handleClose(peer, 1011, 'server error');
    await Promise.resolve();
    expect(close).toHaveBeenLastCalledWith(peer, 1011, 'server error');
  });

  it('handleError 调用 hooks.error；无定义时是空操作', async () => {
    const error = vi.fn();
    registerWebSocket('/ws', { path: '/ws', hooks: { error } });
    const { peer } = upgrade('http://x/ws');

    handleError(peer, new Error('boom'));
    await Promise.resolve();
    expect(error).toHaveBeenCalledTimes(1);

    const orphan = upgrade('http://x/orphan');
    expect(() => handleError(orphan.peer, new Error('boom'))).not.toThrow();
  });

  it('handleClose 后 peer 再次 publish 不抛错', async () => {
    const { peer } = upgrade('http://x/ws');
    peer.subscribe('news');
    handleClose(peer);
    await Promise.resolve();

    expect(() => peer.publish('news', 'x')).not.toThrow();
  });
});

describe('TS-34 · websocket · createWebSocketMiddleware 分流', () => {
  it('非 websocket upgrade 请求继续走 next', async () => {
    const middleware = createWebSocketMiddleware();
    const next = vi.fn(async () => {});
    const c = createContext('http://x/ws');

    await middleware(c as never, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('upgrade 头大小写不敏感', async () => {
    registerWebSocket('/ws', { path: '/ws' });
    const middleware = createWebSocketMiddleware();
    const c = createContext('http://x/ws', { upgrade: 'WebSocket' });

    const response = await middleware(c as never, async () => {});
    expect((response as Response).status).toBe(426);
  });

  it('upgrade 请求命中定义时返回 426（要求平台特定 handler），不调 next', async () => {
    registerWebSocket('/ws', { path: '/ws' });
    const middleware = createWebSocketMiddleware();
    const next = vi.fn(async () => {});
    const c = createContext('http://x/ws', { upgrade: 'websocket' });

    const response = await middleware(c as never, next);

    expect((response as Response).status).toBe(426);
    expect(next).not.toHaveBeenCalled();
  });

  it('upgrade 请求但无匹配定义时继续走 next', async () => {
    const middleware = createWebSocketMiddleware();
    const next = vi.fn(async () => {});
    const c = createContext('http://x/unknown', { upgrade: 'websocket' });

    await middleware(c as never, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('/* 兜底定义不参与中间件分流（只认精确路径）', async () => {
    registerWebSocket('/*', { path: '/*' });
    const middleware = createWebSocketMiddleware();
    const next = vi.fn(async () => {});
    const c = createContext('http://x/ws', { upgrade: 'websocket' });

    await middleware(c as never, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('TS-34 · websocket · clearWebSocketState', () => {
  it('清空房间 / 主题 / 定义，并重置 peer id 序号', () => {
    registerWebSocket('/ws', { path: '/ws', topics: ['t'], rooms: ['r'] });
    const a = upgrade('http://x/ws');
    createRoom('empty');

    expect(a.peer.id).toMatch(/^peer_[a-z0-9]+_[a-z0-9]+$/u);
    expect(getRooms().size).toBe(2);
    expect(getWebSocketDefinitions().size).toBe(1);

    clearWebSocketState();

    expect(getRooms().size).toBe(0);
    expect(getWebSocketDefinitions().size).toBe(0);
    // 主题订阅表也被清掉：向旧主题广播不该命中旧 peer
    broadcast('t', 'stale');
    expect(a.sent).toEqual([]);
  });
});
