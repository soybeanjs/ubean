/**
 * dev 扫描协调器（RM-V13）。
 *
 * 整改前三套监听并存且各自扫盘（core 插件 / vue 插件 / CLI 的 fs.watch），过滤规则与重载时机
 * 还各不相同 —— 浏览器重载与 app 重建会抢跑。这里用假 watcher 把协调器的契约钉住：
 * 一套监听、一次扫描、一个重载顺序。
 */
import { describe, expect, it, vi } from 'vitest';
import { createDevScanCoordinator, DEV_SCAN_DIRS } from '@ubean/build/vite';
import type { DevScanSource } from '@ubean/build/vite';
import type { ScanResult } from '@ubean/scan';

const ROOT = '/proj';
const SRC = '/proj/src';

function scanResult(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    apiRoutes: [],
    pages: [],
    layouts: [],
    middlewares: [],
    plugins: [],
    crons: [],
    appEntry: { shared: { exists: false }, server: { exists: false }, client: { exists: false } },
    serverEntry: { shared: { exists: false }, dev: { exists: false }, prod: { exists: false } },
    ...overrides
  } as unknown as ScanResult;
}

/** 假 watcher：记录 `add` 的目标，并可手动投递事件。 */
function fakeSource() {
  const added: string[] = [];
  const handlers: Record<string, Set<(file: string) => void>> = {
    add: new Set(),
    unlink: new Set(),
    change: new Set()
  };
  const source: DevScanSource = {
    add: target => void added.push(target),
    on: (event, handler) => void handlers[event].add(handler),
    off: (event, handler) => void handlers[event].delete(handler)
  };
  const emit = (event: 'add' | 'unlink' | 'change', file: string) => {
    for (const handler of handlers[event]) handler(file);
  };
  return { source, added, emit, listenerCount: () => handlers.add.size + handlers.unlink.size + handlers.change.size };
}

const tick = (ms = 40) => new Promise(resolve => setTimeout(resolve, ms));

function setup(
  options: {
    scan?: () => Promise<ScanResult>;
    debounceMs?: number;
    onError?: (error: unknown) => void;
  } = {}
) {
  const { source, added, emit, listenerCount } = fakeSource();
  const scan = vi.fn(options.scan ?? (async () => scanResult()));
  const reload = vi.fn();
  const coordinator = createDevScanCoordinator({
    rootDir: ROOT,
    srcDir: SRC,
    source,
    scan,
    reload,
    debounceMs: options.debounceMs ?? 5,
    onError: options.onError ?? (() => {})
  });
  return { coordinator, source, added, emit, scan, reload, listenerCount };
}

describe('dev 扫描协调器', () => {
  it('start 后监听扫描目录与三类事件', () => {
    const { coordinator, added, listenerCount } = setup();
    coordinator.start();

    for (const dir of DEV_SCAN_DIRS) expect(added).toContain(`${SRC}/${dir}`);
    expect(listenerCount()).toBe(3);
  });

  it('扫描目录内的文件变更触发一次扫描，订阅者按注册顺序收到结果与变更文件', async () => {
    const { coordinator, emit, scan } = setup();
    coordinator.start();

    const order: string[] = [];
    coordinator.subscribe(() => void order.push('core'));
    coordinator.subscribe(() => void order.push('cli'));

    emit('change', `${SRC}/pages/index.vue`);
    await tick();

    expect(scan).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['core', 'cli']);
  });

  it('连发多个事件只扫一次（去抖）', async () => {
    const { coordinator, emit, scan } = setup({ debounceMs: 20 });
    coordinator.start();

    emit('change', `${SRC}/pages/a.vue`);
    emit('change', `${SRC}/pages/b.vue`);
    emit('add', `${SRC}/routes/api/hello.ts`);
    await tick(60);

    expect(scan).toHaveBeenCalledTimes(1);
  });

  it('扫描目录之外的文件不触发扫描', async () => {
    const { coordinator, emit, scan } = setup();
    coordinator.start();

    emit('change', `${ROOT}/vite.config.ts`);
    emit('change', `${SRC}/components/Button.vue`);
    emit('change', `${ROOT}/README.md`);
    await tick();

    expect(scan).not.toHaveBeenCalled();
  });

  it('入口文件（由扫描结果给出）变更触发扫描，并被加入监听目标', async () => {
    const { coordinator, emit, scan, added } = setup({
      scan: async () =>
        scanResult({
          appEntry: {
            shared: { exists: true, fullPath: `${SRC}/app.ts` },
            server: { exists: false },
            client: { exists: false }
          }
        } as Partial<ScanResult>)
    });
    coordinator.start();

    // 首次扫描（由目录事件触发）后才登记入口文件
    emit('change', `${SRC}/pages/index.vue`);
    await tick();
    expect(added).toContain(`${SRC}/app.ts`);

    emit('change', `${SRC}/app.ts`);
    await tick();
    expect(scan).toHaveBeenCalledTimes(2);
  });

  it('markdown 页面也触发扫描（扩展名白名单）', async () => {
    const { coordinator, emit, scan } = setup();
    coordinator.start();

    emit('change', `${SRC}/pages/guide.md`);
    await tick();

    expect(scan).toHaveBeenCalledTimes(1);
  });

  it('忽略 node_modules / .git / .ubean / .bak', async () => {
    const { coordinator, emit, scan } = setup();
    coordinator.start();

    emit('change', `${SRC}/pages/../node_modules/x/index.vue`.replace('/pages/..', ''));
    emit('change', `${SRC}/.ubean/vue-pages.ts`);
    emit('change', `${SRC}/pages/index.vue.bak`);
    await tick();

    expect(scan).not.toHaveBeenCalled();
  });

  it('扫描期间到达的事件合并为一次补扫（单飞 + 去抖）', async () => {
    let release: (() => void) | null = null;
    const { coordinator, emit, scan } = setup({
      debounceMs: 5,
      scan: () =>
        new Promise<ScanResult>(resolve => {
          release = () => resolve(scanResult());
        })
    });
    coordinator.start();

    emit('change', `${SRC}/pages/a.vue`);
    await tick(20); // 第一次扫描开始并挂起
    expect(scan).toHaveBeenCalledTimes(1);

    emit('change', `${SRC}/pages/b.vue`);
    emit('change', `${SRC}/pages/c.vue`);
    await tick(20); // 事件进入 pending
    release?.();
    await tick(30);

    // 三次事件 = 两次扫描（首扫 + 合并后的一次补扫），而不是三次
    expect(scan).toHaveBeenCalledTimes(2);
  });

  it('reload 在所有订阅者完成之后调用（重载不得抢在 app 重建之前）', async () => {
    const events: string[] = [];
    const { coordinator, emit, reload } = setup();
    reload.mockImplementation(() => void events.push('reload'));
    coordinator.start();

    coordinator.subscribe(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      events.push('cli-rebuild-done');
    });

    emit('change', `${SRC}/pages/index.vue`);
    await tick(40);

    expect(events).toEqual(['cli-rebuild-done', 'reload']);
  });

  it('rescan 可手动触发（DevTools CRUD 后的即时刷新）', async () => {
    const { coordinator, scan } = setup();
    coordinator.start();

    await coordinator.rescan();

    expect(scan).toHaveBeenCalledTimes(1);
  });

  it('扫描失败走 onError，不产生未捕获异常', async () => {
    const onError = vi.fn();
    const { coordinator, emit } = setup({
      onError,
      scan: async () => {
        throw new Error('scan boom');
      }
    });
    coordinator.start();

    emit('change', `${SRC}/pages/index.vue`);
    await tick();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(String(onError.mock.calls[0][0])).toContain('scan boom');
  });

  it('stop 后不再响应事件', async () => {
    const { coordinator, emit, scan, listenerCount } = setup();
    coordinator.start();
    coordinator.stop();

    emit('change', `${SRC}/pages/index.vue`);
    await tick();

    expect(scan).not.toHaveBeenCalled();
    // fake watcher 支持 off
    expect(listenerCount()).toBe(0);
  });

  it('取消订阅后不再收到通知', async () => {
    const { coordinator, emit } = setup();
    coordinator.start();
    const seen = vi.fn();
    const unsubscribe = coordinator.subscribe(seen);

    unsubscribe();
    emit('change', `${SRC}/pages/index.vue`);
    await tick();

    expect(seen).not.toHaveBeenCalled();
    expect(coordinator.subscriberCount()).toBe(0);
  });
});
