/**
 * TS-30 · `useRpc.ts` 纯逻辑层加固。
 *
 * §7 明确「不做 devtools 组件测试」，所以这里只用**注入假 client** 的方式覆盖请求构造与错误处理，
 * 不渲染任何组件。`useRpc({ client })` 这个注入口是为此加的（生产走 DTK dock 的默认工厂）。
 *
 * 覆盖的重点是**错误路径的返回值形状**：这个 composable 的 catch 分支决定 SPA 在连不上 dock 时
 * 显示什么，之前完全没有断言。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DevframeRpcClient } from 'devframe/client';
import { useRpc, fmtUptime, fmtVal, fileName, filePath, methodClass } from '../client/app/composables/useRpc';
import type { AiStreamChunk, DevToolsInfo } from '../client/app/composables/useRpc';

// ---------------------------------------------------------------------------
// 假 client：记录每次调用，并按需返回 / 抛出
// ---------------------------------------------------------------------------

interface FakeClientOptions {
  /** `call` 的实现；返回 `undefined` 表示走默认的「按 method 查表」。 */
  onCall?: (method: string, args: unknown[]) => unknown;
  /** `sharedState.get(key)` 的返回值（`{ value, on }` 形状）。 */
  sharedState?: Record<string, unknown>;
}

function createFakeClient(options: FakeClientOptions = {}) {
  const calls: Array<{ method: string; args: unknown[] }> = [];

  const client = {
    call: async (method: string, ...args: unknown[]) => {
      calls.push({ method, args });
      if (options.onCall) return options.onCall(method, args);
      return undefined;
    },
    sharedState: {
      get: async (key: string) =>
        options.sharedState?.[key] ?? {
          value: () => undefined,
          on: () => () => {}
        }
    }
  } as unknown as DevframeRpcClient;

  return { client, calls };
}

/** 构造一个可手动推送 `updated` 事件的 sharedState 句柄。 */
function createManualState(initial?: unknown) {
  let current = initial;
  const listeners = new Set<(value: unknown) => void>();
  return {
    handle: {
      value: () => current,
      on: (_event: string, listener: (value: unknown) => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }
    },
    push(value: unknown) {
      current = value;
      for (const listener of listeners) listener(value);
    },
    listenerCount: () => listeners.size
  };
}

/** 只取断言关心的字段，避免噪声。 */
const rpcMethods = (calls: Array<{ method: string; args: unknown[] }>) => calls.map(c => c.method);

// ---------------------------------------------------------------------------
// 纯格式化函数（无 client 依赖）
// ---------------------------------------------------------------------------

describe('useRpc 纯格式化函数', () => {
  it('fmtUptime 按 秒 / 分 / 时 三档降级，且向下取整', () => {
    expect(fmtUptime(0)).toBe('0s');
    expect(fmtUptime(999)).toBe('0s');
    expect(fmtUptime(1000)).toBe('1s');
    expect(fmtUptime(59_999)).toBe('59s');
    expect(fmtUptime(61_000)).toBe('1m 1s');
    expect(fmtUptime(3_600_000)).toBe('1h 0m');
    expect(fmtUptime(3_661_000)).toBe('1h 1m');
  });

  it('fmtVal 对每种值类型给出稳定的字符串', () => {
    expect(fmtVal(null)).toBe('—');
    expect(fmtVal(undefined)).toBe('—');
    expect(fmtVal(true)).toBe('true');
    expect(fmtVal(false)).toBe('false');
    expect(fmtVal(0)).toBe('0');
    expect(fmtVal('')).toBe('');
    expect(fmtVal('plain')).toBe('plain');
    // 数组不展开内容，只给长度 —— 环境变量值可能很长。
    expect(fmtVal([1, 2, 3])).toBe('[3 items]');
    expect(fmtVal({ a: 1 })).toBe('{"a":1}');
  });

  it('fileName 取末段，空输入返回空串', () => {
    expect(fileName('a/b/c.vue')).toBe('c.vue');
    expect(fileName('c.vue')).toBe('c.vue');
    expect(fileName('')).toBe('');
    expect(fileName(undefined)).toBe('');
  });

  it('filePath 只在超过 5 段时省略中段', () => {
    expect(filePath(undefined)).toBe('');
    expect(filePath('a/b/c.vue')).toBe('a/b/c.vue');
    // 恰好 5 段仍原样返回。
    expect(filePath('a/b/c/d/e.vue')).toBe('a/b/c/d/e.vue');
    expect(filePath('a/b/c/d/e/f.vue')).toBe('a/b/c/…/e/f.vue');
  });

  it('methodClass 覆盖 5 个已知方法，未知方法回退到中性样式', () => {
    expect(methodClass('GET')).toBe('bg-success/12 text-success');
    expect(methodClass('POST')).toBe('bg-info/12 text-info');
    expect(methodClass('PUT')).toBe('bg-warning/12 text-warning');
    expect(methodClass('DELETE')).toBe('bg-destructive/12 text-destructive');
    expect(methodClass('PATCH')).toBe('bg-purple-500/12 text-purple-400');
    // 不是空串：按钮仍需要有可见底色。
    expect(methodClass('OPTIONS')).toBe('bg-secondary text-muted-foreground');
    expect(methodClass('')).toBe('bg-secondary text-muted-foreground');
  });
});

// ---------------------------------------------------------------------------
// 请求构造：方法名与参数形状
// ---------------------------------------------------------------------------

describe('useRpc 请求构造', () => {
  it('CRUD 系列用 `ubean:crud:*` 方法名，create/update/delete 合并成单个对象参数', async () => {
    const fake = createFakeClient({
      onCall: method => (method === 'ubean:crud:read' ? { success: true, content: 'x' } : { success: true })
    });
    const api = useRpc({ client: async () => fake.client });

    await api.crudRead('page', 'src/pages/a.vue');
    await api.crudCreate('page', 'src/pages/b.vue', { method: 'GET', force: true });
    await api.crudUpdate('env', { key: 'A', value: '1' });
    await api.crudDelete('cron', { path: 'x', force: true });
    await api.crudRestore('src/pages/old.vue');

    // 只看 CRUD 调用；refresh 会穿插 `ubean:get-env`（创建/更新/删除/恢复成功后各一次）。
    expect(fake.calls.filter(c => c.method.startsWith('ubean:crud:'))).toEqual([
      { method: 'ubean:crud:read', args: [{ type: 'page', path: 'src/pages/a.vue' }] },
      { method: 'ubean:crud:create', args: [{ type: 'page', path: 'src/pages/b.vue', method: 'GET', force: true }] },
      { method: 'ubean:crud:update', args: [{ type: 'env', key: 'A', value: '1' }] },
      { method: 'ubean:crud:delete', args: [{ type: 'cron', path: 'x', force: true }] },
      { method: 'ubean:crud:restore', args: ['src/pages/old.vue'] }
    ]);
    // create / update / delete / restore 各自成功后都会 refresh（重新拉 env）；read 不会。
    expect(rpcMethods(fake.calls).filter(m => m === 'ubean:get-env')).toHaveLength(4);
  });

  it('AI 调用透传 messages 与 provider 选项', async () => {
    const fake = createFakeClient({
      onCall: method =>
        method === 'ubean:ai:tools' ? [] : { message: { role: 'assistant', content: 'ok', timestamp: 1 } }
    });
    const api = useRpc({ client: async () => fake.client });

    await api.aiChat([{ role: 'user', content: 'hi' }], { model: 'm', apiKey: 'k', apiBase: 'b' });
    await api.aiGetTools();

    expect(fake.calls[0].method).toBe('ubean:ai:chat');
    expect(fake.calls[0].args).toEqual([
      {
        messages: [{ role: 'user', content: 'hi' }],
        model: 'm',
        apiKey: 'k',
        apiBase: 'b'
      }
    ]);
    expect(fake.calls[1]).toEqual({ method: 'ubean:ai:tools', args: [] });
  });

  it('terminal 系列参数形状', async () => {
    const fake = createFakeClient({
      onCall: method =>
        method === 'ubean:terminal:start'
          ? { sessionId: 's1' }
          : method === 'ubean:terminal:poll'
            ? { data: '', exited: false, exitCode: null }
            : true
    });
    const api = useRpc({ client: async () => fake.client });

    await api.terminalStart({ cwd: '/tmp', cols: 80, rows: 24 });
    await api.terminalInput('s1', 'ls\n');
    await api.terminalResize('s1', 120, 40);
    await api.terminalPoll('s1');
    await api.terminalKill('s1');

    expect(fake.calls).toEqual([
      { method: 'ubean:terminal:start', args: [{ cwd: '/tmp', cols: 80, rows: 24 }] },
      { method: 'ubean:terminal:input', args: [{ sessionId: 's1', data: 'ls\n' }] },
      { method: 'ubean:terminal:resize', args: [{ sessionId: 's1', cols: 120, rows: 40 }] },
      { method: 'ubean:terminal:poll', args: [{ sessionId: 's1' }] },
      { method: 'ubean:terminal:kill', args: [{ sessionId: 's1' }] }
    ]);
  });
});

// ---------------------------------------------------------------------------
// 错误路径：每个 wrapper 都有明确的降级返回值（不是 undefined / 不是抛）
// ---------------------------------------------------------------------------

describe('useRpc 错误路径', () => {
  const boom = new Error('Failed to get connection meta from ./');

  /** 所有 RPC 都失败。 */
  function failing() {
    const fake = createFakeClient({
      onCall: () => {
        throw boom;
      }
    });
    return { fake, api: useRpc({ client: async () => fake.client }) };
  }

  it('crudRead 返回 {success:false, error}，crudCreate/Update/Delete/Restore 返回 {success:false, errors:[…]}', async () => {
    const { api } = failing();

    expect(await api.crudRead('page')).toEqual({ success: false, error: boom.message });
    for (const result of [
      await api.crudCreate('page', 'a.vue'),
      await api.crudUpdate('page', { path: 'a.vue' }),
      await api.crudDelete('page', { path: 'a.vue' }),
      await api.crudRestore('a.vue')
    ]) {
      expect(result).toEqual({ success: false, errors: [boom.message] });
    }
  });

  it('aiChat 降级为一条 assistant 错误消息（形状仍合法，调用方不用判空）', async () => {
    const { api } = failing();
    const response = await api.aiChat([{ role: 'user', content: 'hi' }]);

    expect(response.message.role).toBe('assistant');
    expect(response.message.content).toBe(`Error: ${boom.message}`);
    expect(typeof response.message.timestamp).toBe('number');
  });

  it('aiGetTools 降级为空数组', async () => {
    const { api } = failing();
    expect(await api.aiGetTools()).toEqual([]);
  });

  it('aiChatStream 降级为 assistant 错误消息，且不注册残留订阅', async () => {
    const streamState = createManualState();
    const fake = createFakeClient({
      onCall: () => {
        throw boom;
      },
      sharedState: { 'ubean:ai:stream': streamState.handle }
    });
    const api = useRpc({ client: async () => fake.client });

    const response = await api.aiChatStream([{ role: 'user', content: 'hi' }], {}, () => {});

    expect(response.message.content).toBe(`Error: ${boom.message}`);
    expect(streamState.listenerCount()).toBe(0);
  });

  it('terminal* 降级为 null / false / exitCode -1', async () => {
    const { api } = failing();

    expect(await api.terminalStart({ cwd: '/tmp' })).toBeNull();
    expect(await api.terminalInput('s1', 'x')).toBe(false);
    expect(await api.terminalResize('s1', 1, 2)).toBe(false);
    expect(await api.terminalKill('s1')).toBe(false);
    // `exited: true` 让轮询循环停下，而不是无限重试。
    expect(await api.terminalPoll('s1')).toEqual({ data: '', exited: true, exitCode: -1 });
  });

  it('非 Error 抛出物也降级（不是 `e.message` 变 undefined）', async () => {
    // 用变量而不是字面量：既让 `no-throw-literal` 闭嘴，也确保抛的确实不是 Error。
    const nonError: unknown = 'plain string failure';
    const fake = createFakeClient({
      onCall: () => {
        throw nonError;
      }
    });
    const api = useRpc({ client: async () => fake.client });

    expect(await api.crudRead('page')).toEqual({ success: false, error: 'Read failed' });
    expect((await api.aiChat([])).message.content).toBe('Error: AI request failed');
  });

  it('refresh 失败被吞掉（不影响已有的 info/env）', async () => {
    const fake = createFakeClient({
      onCall: () => {
        throw boom;
      }
    });
    const api = useRpc({ client: async () => fake.client });
    api.env.value = { KEPT: 'yes' };

    await expect(api.refresh()).resolves.toBeUndefined();
    // env 保持旧值，不会被打成空对象。
    expect(api.env.value).toEqual({ KEPT: 'yes' });
  });

  it('client 工厂本身失败时 init 把消息写进 error 并结束 loading', async () => {
    const api = useRpc({
      client: async () => {
        throw boom;
      }
    });

    await api.init();

    expect(api.error.value).toBe(boom.message);
    expect(api.loading.value).toBe(false);
    expect(api.info.value).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// init / dispose：sharedState 订阅与 uptime 计时器
// ---------------------------------------------------------------------------

describe('useRpc init 与 dispose', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function connectedApi(info: DevToolsInfo) {
    const state = createManualState(info);
    const fake = createFakeClient({
      onCall: method => (method === 'ubean:get-env' ? { NODE_ENV: 'test' } : undefined),
      sharedState: { 'ubean:info': state.handle }
    });
    return { state, fake, api: useRpc({ client: async () => fake.client }) };
  }

  const INFO: DevToolsInfo = {
    version: '0.0.0',
    pages: 1,
    apiRoutes: 2,
    middleware: 3,
    layouts: 4,
    crons: 5,
    startTime: Date.now(),
    presets: ['node'],
    config: {},
    routes: [],
    pagesList: [],
    middlewaresList: [],
    layoutsList: [],
    cronsList: []
  };

  it('init 取 sharedState 初值 + env，并结束 loading', async () => {
    const { api, fake } = connectedApi(INFO);
    await api.init();

    expect(api.loading.value).toBe(false);
    expect(api.error.value).toBeNull();
    expect(api.info.value).toEqual(INFO);
    expect(api.env.value).toEqual({ NODE_ENV: 'test' });
    expect(rpcMethods(fake.calls)).toEqual(['ubean:get-env']);
  });

  it('init 后 sharedState 的 updated 事件同步到 info（取代 3s 轮询）', async () => {
    const { api, state } = connectedApi(INFO);
    await api.init();

    const next = { ...INFO, pages: 99 };
    // Vue 的 `ref` 会把对象包成响应式代理，所以身份比较（`toBe`）不成立，只能做值比较。
    state.push(next);
    expect(api.info.value).toEqual(next);
  });

  it('uptime 由 info.startTime 驱动，每秒 tick 一次', async () => {
    const { api } = connectedApi(INFO);
    await api.init();

    expect(api.uptime.value).toBe(0);
    vi.advanceTimersByTime(3000);
    expect(api.uptime.value).toBeGreaterThanOrEqual(3000);
  });

  it('dispose 退订 sharedState 并停掉计时器，且可重复调用', async () => {
    const { api, state } = connectedApi(INFO);
    await api.init();

    api.dispose();
    api.dispose();

    expect(state.listenerCount()).toBe(0);
    // 退订后事件不再写入 info。
    const before = api.info.value;
    state.push({ ...INFO, pages: 123 });
    expect(api.info.value).toEqual(before);

    // 计时器已停：再推进时间 uptime 不变。
    const uptimeBefore = api.uptime.value;
    vi.advanceTimersByTime(5000);
    expect(api.uptime.value).toBe(uptimeBefore);
  });

  it('init 幂等：重复调用不产生第二个订阅', async () => {
    const { api, state } = connectedApi(INFO);
    await api.init();
    await api.init();

    expect(state.listenerCount()).toBe(1);
    api.dispose();
  });

  it('dispose 之后 init 不再生效（避免 unmount 后回写已销毁实例）', async () => {
    const { api, state } = connectedApi(INFO);
    api.dispose();

    await api.init();

    expect(state.listenerCount()).toBe(0);
    expect(api.loading.value).toBe(true);
  });

  it('无需组件实例也能调用（不产生 Vue 生命周期警告）', async () => {
    // 在 vitest 的 node 环境里没有活动组件实例；旧实现直接调 `onMounted` 会打警告。
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { api } = connectedApi(INFO);

    await api.init();

    expect(warn.mock.calls.flat().join(' ')).not.toContain(
      'onMounted is called when there is no active component instance'
    );
    expect(api.loading.value).toBe(false);
    warn.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// aiChatStream：并发流按 requestId 隔离
// ---------------------------------------------------------------------------

describe('useRpc aiChatStream', () => {
  it('只把同一 requestId 的 chunk 交给回调，结束后退订', async () => {
    const streamState = createManualState();
    let captured: { requestId: string } | null = null;
    const fake = createFakeClient({
      onCall: (method, args) => {
        if (method === 'ubean:ai:chat-stream') {
          captured = args[0] as { requestId: string };
          // 同一条 streamState 上混入别人（另一个流）的 chunk。
          streamState.push({ requestId: 'other-request', text: 'WRONG', done: false } as AiStreamChunk);
          streamState.push({ requestId: captured.requestId, text: 'mine', done: false } as AiStreamChunk);
          return { message: { role: 'assistant', content: 'mine', timestamp: 1 } };
        }
        return undefined;
      },
      sharedState: { 'ubean:ai:stream': streamState.handle }
    });
    const api = useRpc({ client: async () => fake.client });

    const received: AiStreamChunk[] = [];
    const response = await api.aiChatStream([{ role: 'user', content: 'hi' }], {}, chunk => received.push(chunk));

    expect(response.message.content).toBe('mine');
    expect(captured).not.toBeNull();
    expect(captured!.requestId).toMatch(/^stream_\d+_[a-z0-9]+$/);
    expect(received.map(c => c.text)).toEqual(['mine']);
    // 流结束后必须退订，否则长会话里监听器会累积。
    expect(streamState.listenerCount()).toBe(0);
  });

  it('requestId 每次调用都不同（并发流不会互相串台）', async () => {
    const seen: string[] = [];
    const streamState = createManualState();
    const fake = createFakeClient({
      onCall: (method, args) => {
        if (method === 'ubean:ai:chat-stream') {
          seen.push((args[0] as { requestId: string }).requestId);
          return { message: { role: 'assistant', content: '', timestamp: 1 } };
        }
        return undefined;
      },
      sharedState: { 'ubean:ai:stream': streamState.handle }
    });
    const api = useRpc({ client: async () => fake.client });

    await api.aiChatStream([], {}, () => {});
    await api.aiChatStream([], {}, () => {});

    expect(new Set(seen).size).toBe(2);
    expect(streamState.listenerCount()).toBe(0);
  });
});
