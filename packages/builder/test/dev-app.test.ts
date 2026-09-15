/**
 * 宿主 dev app 的创建与 ready（RM-V11）。
 *
 * 用**真实的** `UbeanApp`（`createUbeanApp`）配一个桩 `loadModule`，这样断言的是真链路：
 * `applyServerConfig` 真的把用户 `defineServer` 配置（含 P9-09 `globalHooks`）挂到了 app 上，
 * `init()` 真的跑过（否则 `handle` hook 对应的中间件不存在），`onServerReady` 真的只调一次。
 * 端到端（子进程 dev server + 纯 HTTP）在 `packages/cli/test/dev-topology.test.ts`。
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getGlobalHooks } from '@ubean/app';
import { createDevApp, createDevAppReady } from '@ubean/build/vite';
import type { ScanResult, ScannedLayout } from '@ubean/scan';

let cleanup: string[] = [];
afterEach(() => {
  for (const dir of cleanup) rmSync(dir, { recursive: true, force: true });
  cleanup = [];
});

const LAYOUTS = [
  { name: 'default', relativePath: 'layouts/default.vue', fullPath: '/abs/layouts/default.vue', isDefault: true }
] as ScannedLayout[];

function scanResult(): ScanResult {
  return {
    apiRoutes: [],
    pages: [],
    layouts: LAYOUTS,
    middlewares: [],
    plugins: [],
    crons: [],
    notFoundPage: undefined
  } as unknown as ScanResult;
}

/** 只提供 `createDevApp` 读到的字段；其余留 undefined 走默认。 */
function appConfig(rootDir: string) {
  return {
    rootDir,
    srcDir: join(rootDir, 'src'),
    mode: 'fullstack',
    dir: { public: join(rootDir, 'public') },
    ssr: { exclude: [], streaming: false },
    security: undefined,
    cache: { store: 'auto' },
    dataCache: undefined,
    routeRules: {},
    i18n: undefined,
    favicon: undefined,
    scanOptions: undefined
  } as never;
}

function tempRoot() {
  const root = mkdtempSync(join(tmpdir(), 'ubean-dev-app-'));
  cleanup.push(root);
  return root;
}

describe('createDevApp', () => {
  it('用传入的扫描结果建 app，并把 layouts 交回调用方', async () => {
    const root = tempRoot();
    const scan = scanResult();
    const configureApp = vi.fn();

    const result = await createDevApp({ rootDir: root, config: appConfig(root), scanResult: scan, configureApp });

    expect(result.app.options.pages).toEqual(scan.pages);
    expect(result.layouts).toBe(LAYOUTS);
    expect(configureApp).toHaveBeenCalledWith(result.app);
  });

  it('未提供扫描结果时自行扫盘', async () => {
    const root = tempRoot();
    const result = await createDevApp({ rootDir: root, config: appConfig(root) });
    // 空项目：没有页面/路由，也不该抛错
    expect(result.scanResult.pages).toEqual([]);
    expect(result.layouts).toEqual([]);
  });
});

describe('createDevAppReady', () => {
  /** 桩 `virtual:ubean-server`：返回用户 server 配置（含 P9-09 handle hook 与 onServerReady）。 */
  function serverModules(onServerReady = vi.fn()) {
    const handle = vi.fn(async () => new Response('ok'));
    const loadModule = vi.fn(async (id: string) => {
      if (id === 'virtual:ubean-server') {
        return {
          resolveServerConfig: (mode: string) => ({
            mode,
            plugins: [],
            hooks: {},
            globalHooks: { handle },
            onServerReady
          })
        };
      }
      return {};
    });
    return { loadModule, handle, onServerReady };
  }

  it('依次加载 locales、应用 defineServer 配置、init、并只调一次 onServerReady', async () => {
    const root = tempRoot();
    const { app } = await createDevApp({ rootDir: root, config: appConfig(root), scanResult: scanResult() });
    const { loadModule, handle, onServerReady } = serverModules();

    const ready = createDevAppReady({ app, loadModule });
    await ready();

    // locales 先于 server 配置加载（顺序即契约：本地化消息要在路由中间件同一份模块图里）
    expect(loadModule.mock.calls.map(c => c[0])).toEqual(['ubean:locales', 'virtual:ubean-server']);
    // 配置确实被应用：P9-09 globalHooks 已注册
    expect(getGlobalHooks().handle).toBe(handle);
    expect(onServerReady).toHaveBeenCalledTimes(1);
    expect(ready.serverConfig()?.onServerReady).toBe(onServerReady);

    // 幂等：同一实例内重复 ready 不再重复初始化
    await ready();
    expect(loadModule).toHaveBeenCalledTimes(2);
    expect(onServerReady).toHaveBeenCalledTimes(1);
  });

  it('locales 或 server 配置加载失败只告警，不阻断 ready', async () => {
    const root = tempRoot();
    const { app } = await createDevApp({ rootDir: root, config: appConfig(root), scanResult: scanResult() });
    const warn = vi.fn();
    const loadModule = vi.fn(async () => {
      throw new Error('module boom');
    });

    const ready = createDevAppReady({ app, loadModule, logger: { warn, error: vi.fn() } });
    await expect(ready()).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0][0])).toContain('locales');
    expect(String(warn.mock.calls[1][0])).toContain('server config');
  });

  it('onServerReady 抛错只告警（不把首个请求变成 500）', async () => {
    const root = tempRoot();
    const { app } = await createDevApp({ rootDir: root, config: appConfig(root), scanResult: scanResult() });
    const warn = vi.fn();
    const onServerReady = vi.fn(async () => {
      throw new Error('onServerReady boom');
    });
    const loadModule = vi.fn(async (id: string) =>
      id === 'virtual:ubean-server' ? { resolveServerConfig: () => ({ plugins: [], hooks: {}, onServerReady }) } : {}
    );

    const ready = createDevAppReady({ app, loadModule, logger: { warn, error: vi.fn() } });
    await expect(ready()).resolves.toBeUndefined();

    expect(String(warn.mock.calls.at(-1)?.[0])).toContain('onServerReady');
  });
});
