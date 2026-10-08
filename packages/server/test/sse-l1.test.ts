/**
 * TS-34 · L2 → L1 下沉（域 3/6：sse）
 *
 * `packages/server/src/sse.ts` 的纯逻辑层此前零覆盖：连接注册表、帧格式化、
 * keep-alive、广播过滤、关闭清理只被 `examples/ubean-test/test/sse.test.ts`
 * 从 HTTP 层间接走到。
 *
 * 这里通过**真实读 body 流**来断言「写进管道里的字节」，而不是 mock writer ——
 * 帧格式（`: comment` / `id:` / `event:` / `retry:` / 多行 data）是这个协议唯一
 * 的对外契约，值得用最接近真实的方式钉住。红证见 docs/test.md 的 TS-34 台账。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  broadcastSSE,
  clearSSEState,
  closeAllSSE,
  createSSEStream,
  defineSSE,
  formatSSEMessage,
  getSSEConnections,
  sseHeaders
} from '../src/sse';
import type { SSEConnection } from '../src/sse';
import { expectNoUnhandledRejection } from './helpers/unhandled-rejection';

afterEach(() => {
  clearSSEState();
  vi.restoreAllMocks();
});

const createContext = () => ({ req: { method: 'GET' } });

/**
 * 建一条 SSE 流并等待 `onConnect` 微任务跑完，返回连接与「读累计文本」工具。
 * 每次 read 前先把 pending 的微任务/定时器机会让出去，避免读到半截帧。
 */
async function openStream(options: Parameters<typeof createSSEStream>[2] = {}) {
  let connection: SSEConnection | undefined;
  const response = createSSEStream(createContext() as never, { onConnect: conn => void (connection = conn) }, options);

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffered = '';

  await drain();

  async function drain() {
    await Promise.resolve();
    await Promise.resolve();
  }

  async function readAvailable(): Promise<string> {
    await drain();
    const result = await Promise.race([
      reader.read(),
      new Promise<{ value?: undefined; done: true }>(resolve => setTimeout(() => resolve({ done: true }), 20))
    ]);
    if (result.done) return buffered;
    buffered += decoder.decode(result.value as Uint8Array);
    return buffered;
  }

  /** 已知管道里一定有数据（或 writer 已 close）时用这个 —— 不依赖真实定时器，可与 fake timers 共存。 */
  async function readNext(): Promise<string> {
    await drain();
    const result = await reader.read();
    if (!result.done) buffered += decoder.decode(result.value as Uint8Array);
    return buffered;
  }

  return {
    response,
    reader,
    get connection() {
      return connection!;
    },
    readAvailable,
    readNext
  };
}

describe('TS-34 · sse · formatSSEMessage 帧格式', () => {
  it('空消息产出空行终止符（没有字段时就是 \\n\\n）', () => {
    expect(formatSSEMessage({})).toBe('\n\n');
  });

  it('data 字符串 → 单行 data 帧', () => {
    expect(formatSSEMessage({ data: 'hello' })).toBe('data: hello\n\n');
  });

  it('data 对象被 JSON 序列化', () => {
    expect(formatSSEMessage({ data: { a: 1 } })).toBe('data: {"a":1}\n\n');
  });

  it('data 里的换行被拆成多个 data 行（SSE 规范要求）', () => {
    expect(formatSSEMessage({ data: 'a\nb' })).toBe('data: a\ndata: b\n\n');
  });

  it('字段顺序固定为 comment → id → event → retry → data', () => {
    const frame = formatSSEMessage({ data: 'd', event: 'e', id: 'i', retry: 100, comment: 'c' });
    expect(frame).toBe(': c\nid: i\nevent: e\nretry: 100\ndata: d\n\n');
  });

  it('comment 里的换行被拆成多个注释行', () => {
    expect(formatSSEMessage({ comment: 'line1\nline2' })).toBe(': line1\n: line2\n\n');
  });

  it('id 为 0 / retry 为 0 这类 falsy 值仍被写出（只排除 null/undefined）', () => {
    expect(formatSSEMessage({ id: '0' })).toBe('id: 0\n\n');
    expect(formatSSEMessage({ retry: 0 })).toBe('retry: 0\n\n');
  });

  it('data 为 null / undefined / 空串时行为各异（null 不写、空串写空行）', () => {
    expect(formatSSEMessage({ data: null as unknown as string })).toBe('\n\n');
    expect(formatSSEMessage({ data: undefined })).toBe('\n\n');
    expect(formatSSEMessage({ data: '' })).toBe('data: \n\n');
  });

  it('多行 data 与 event 同时出现时各行都带前缀', () => {
    expect(formatSSEMessage({ data: 'x\ny\nz', event: 'tick' })).toBe('event: tick\ndata: x\ndata: y\ndata: z\n\n');
  });
});

describe('TS-34 · sse · sseHeaders', () => {
  it('返回完整的事件流响应头集合', () => {
    expect(sseHeaders()).toEqual({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
  });

  it('每次调用返回新对象（调用方可以安全改写）', () => {
    const a = sseHeaders();
    const b = sseHeaders();
    expect(a).not.toBe(b);

    a['Content-Type'] = 'changed';
    expect(b['Content-Type']).toBe('text/event-stream');
  });
});

describe('TS-34 · sse · createSSEStream / SSEConnection', () => {
  it('响应头是事件流约定，且无自定义 headers 时不串味', () => {
    const response = createSSEStream(createContext() as never, {});

    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    expect(response.headers.get('Cache-Control')).toBe('no-cache, no-transform');
    expect(response.headers.get('X-Accel-Buffering')).toBe('no');
    expect(response.body).not.toBeNull();
  });

  it('options.headers 覆盖默认头', () => {
    const response = createSSEStream(createContext() as never, {}, { headers: { 'X-Accel-Buffering': 'yes' } });
    expect(response.headers.get('X-Accel-Buffering')).toBe('yes');
  });

  it('连接创建后进入全局注册表，close() 后移出', async () => {
    const stream = await openStream();
    const conn = stream.connection;

    expect(getSSEConnections().get(conn.id)).toBe(conn);
    expect(conn.closed).toBe(false);

    conn.close();
    expect(conn.closed).toBe(true);
    expect(getSSEConnections().has(conn.id)).toBe(false);
  });

  it('id 前缀为 sse_ 且互不相同', async () => {
    const a = await openStream();
    const b = await openStream();

    expect(a.connection.id).toMatch(/^sse_[a-z0-9]+_[a-z0-9]+$/u);
    expect(a.connection.id).not.toBe(b.connection.id);
  });

  it('send 把格式化后的帧写进 body 流', async () => {
    const stream = await openStream();
    stream.connection.send({ data: 'payload', event: 'tick' });

    expect(await stream.readAvailable()).toBe('event: tick\ndata: payload\n\n');
  });

  it('sendData 是 { data, event } 的语法糖', async () => {
    const stream = await openStream();
    stream.connection.sendData('x', 'ev');

    expect(await stream.readAvailable()).toBe('event: ev\ndata: x\n\n');
  });

  it('comment 写出注释帧', async () => {
    const stream = await openStream();
    stream.connection.comment('ping');

    expect(await stream.readAvailable()).toBe(': ping\n\n');
  });

  it('options.retry 在流建立时立刻写进管道', async () => {
    const stream = await openStream({ retry: 3000 });

    expect(await stream.readAvailable()).toBe('retry: 3000\n\n');
  });

  it('未设 retry 时不写任何初始帧', async () => {
    const stream = await openStream();
    expect(await stream.readAvailable()).toBe('');
  });

  it('close() 之后再 send / comment 都是空操作', async () => {
    const stream = await openStream();
    stream.connection.close();
    stream.connection.send({ data: 'after-close' });
    stream.connection.comment('after-close');

    expect(await stream.readAvailable()).toBe('');
  });

  it('close() 幂等：onClose 只调用一次', async () => {
    const onClose = vi.fn();
    const response = createSSEStream(createContext() as never, { onClose });
    response.body!.getReader();

    // 通过注册表拿到唯一连接
    const [conn] = Array.from(getSSEConnections().values());
    conn.close();
    conn.close();
    await Promise.resolve();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith(conn);
  });

  it('onConnect 在微任务里被调用（不是同步）', async () => {
    const onConnect = vi.fn();
    createSSEStream(createContext() as never, { onConnect });
    expect(onConnect).not.toHaveBeenCalled();

    await Promise.resolve();
    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it('onConnect 同步抛错被吞掉，不产生未处理拒绝、连接仍可用', async () => {
    await expectNoUnhandledRejection(() => {
      createSSEStream(createContext() as never, {
        onConnect: () => {
          throw new Error('connect failed');
        }
      });
    });

    const conn = Array.from(getSSEConnections().values())[0];
    expect(conn.closed).toBe(false);
  });

  it('onConnect 返回 rejected promise 同样被吞掉', async () => {
    await expectNoUnhandledRejection(() => {
      createSSEStream(createContext() as never, {
        onConnect: () => Promise.reject(new Error('async fail'))
      });
    });

    expect(Array.from(getSSEConnections().values())).toHaveLength(1);
  });
});

describe('TS-34 · sse · keep-alive', () => {
  it('默认 keepAlive 为 30000ms，定时写注释帧', async () => {
    vi.useFakeTimers();
    try {
      const stream = await openStream();

      await vi.advanceTimersByTimeAsync(30_000);
      expect(await stream.readNext()).toBe(': keep-alive\n\n');

      await vi.advanceTimersByTimeAsync(30_000);
      expect(await stream.readNext()).toBe(': keep-alive\n\n: keep-alive\n\n');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keepAlive 传数字时用作间隔', async () => {
    vi.useFakeTimers();
    try {
      const stream = await openStream({ keepAlive: 1000 });

      await vi.advanceTimersByTimeAsync(999);
      stream.connection.close();
      // 没触发过 keep-alive，所以 close 后立刻读到流结束、缓冲区为空
      expect(await stream.readNext()).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keepAlive 传数字：跨过间隔后写出 keep-alive', async () => {
    vi.useFakeTimers();
    try {
      const stream = await openStream({ keepAlive: 1000 });

      await vi.advanceTimersByTimeAsync(1000);
      expect(await stream.readNext()).toBe(': keep-alive\n\n');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keepAlive: false 关闭定时器', async () => {
    vi.useFakeTimers();
    try {
      const stream = await openStream({ keepAlive: false });

      await vi.advanceTimersByTimeAsync(120_000);
      stream.connection.close();
      expect(await stream.readNext()).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('close() 后 keep-alive 定时器被清掉', async () => {
    vi.useFakeTimers();
    try {
      const stream = await openStream();
      stream.connection.close();

      await vi.advanceTimersByTimeAsync(120_000);
      expect(await stream.readNext()).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('TS-34 · sse · broadcastSSE', () => {
  it('把事件发给所有未关闭的连接', async () => {
    const a = await openStream();
    const b = await openStream();

    broadcastSSE('news', { id: 1 });

    expect(await a.readAvailable()).toBe('event: news\ndata: {"id":1}\n\n');
    expect(await b.readAvailable()).toBe('event: news\ndata: {"id":1}\n\n');
  });

  it('filter 命中的才收到', async () => {
    const a = await openStream();
    const b = await openStream();

    broadcastSSE('news', 'x', conn => conn === a.connection);

    expect(await a.readAvailable()).toBe('event: news\ndata: x\n\n');
    expect(await b.readAvailable()).toBe('');
  });

  it('已关闭的连接被跳过', async () => {
    const a = await openStream();
    const b = await openStream();
    a.connection.close();

    broadcastSSE('news', 'x');

    expect(await a.readAvailable()).toBe('');
    expect(await b.readAvailable()).toBe('event: news\ndata: x\n\n');
  });

  it('无连接时是空操作', () => {
    expect(() => broadcastSSE('news', 'x')).not.toThrow();
  });
});

describe('TS-34 · sse · closeAllSSE / clearSSEState', () => {
  it('closeAllSSE 关闭并清空注册表', async () => {
    const a = await openStream();
    const b = await openStream();

    closeAllSSE();

    expect(a.connection.closed).toBe(true);
    expect(b.connection.closed).toBe(true);
    expect(getSSEConnections().size).toBe(0);
  });

  it('clearSSEState 关闭全部连接并重置 id 序号', async () => {
    const first = await openStream();
    const firstId = first.connection.id;
    first.connection.close();

    clearSSEState();

    const second = await openStream();
    // idSeed 归零后，同一毫秒内的序号会重现为 _1
    expect(second.connection.id).toMatch(/^sse_[a-z0-9]+_1$/u);
    expect(firstId).toMatch(/^sse_[a-z0-9]+_1$/u);
  });
});

describe('TS-34 · sse · defineSSE', () => {
  it('defineSSE 直接把 handler 包成返回流响应的中间件', async () => {
    const onConnect = vi.fn();
    const middleware = defineSSE({ onConnect });

    const response = await (middleware as unknown as (c: unknown) => Promise<Response>)(createContext());

    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    await Promise.resolve();
    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it('defineSSE 透传 options（retry 立刻写进流）', async () => {
    const middleware = defineSSE({}, { retry: 500 });
    const response = await (middleware as unknown as (c: unknown) => Promise<Response>)(createContext());

    const reader = response.body!.getReader();
    await Promise.resolve();
    const chunk = await reader.read();
    expect(new TextDecoder().decode(chunk.value as Uint8Array)).toBe('retry: 500\n\n');
  });

  it('defineSSE 的 onClose 在连接关闭时触发', async () => {
    const onClose = vi.fn();
    const middleware = defineSSE({ onClose });
    await (middleware as unknown as (c: unknown) => Promise<Response>)(createContext());

    const [conn] = Array.from(getSSEConnections().values());
    conn.close();
    await Promise.resolve();

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
