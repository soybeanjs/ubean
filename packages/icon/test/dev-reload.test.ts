import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'pathe';
import type { IconifyCollection } from '../src/types';
import { ubeanIconPlugin } from '../src/vite';

const TEST_COLLECTION: IconifyCollection = {
  prefix: 'test',
  width: 24,
  height: 24,
  icons: { home: { body: '<path d="M0 0h24v24H0z"/>' } }
};

const VIRTUAL_ID = '\0virtual:ubean-icon';

/** `configureServer` 用到的最小 dev server 面。 */
function createFakeServer() {
  const handlers = new Map<string, Array<(file: string) => void>>();
  const send = vi.fn();
  const invalidateModule = vi.fn();
  const server = {
    watcher: {
      add: vi.fn(),
      on(event: string, handler: (file: string) => void) {
        const list = handlers.get(event) ?? [];
        list.push(handler);
        handlers.set(event, list);
      }
    },
    moduleGraph: {
      getModuleById: () => ({ id: VIRTUAL_ID }),
      invalidateModule
    },
    middlewares: { use: vi.fn() },
    ws: { send }
  };
  return {
    server,
    send,
    invalidateModule,
    emit(event: string, file: string) {
      for (const handler of handlers.get(event) ?? []) handler(file);
    }
  };
}

function setup(collections: Record<string, IconifyCollection>, rootDir: string) {
  const plugin = ubeanIconPlugin({ collections });
  plugin.configResolved!({ root: rootDir, command: 'serve' } as any);
  const fake = createFakeServer();
  plugin.configureServer!(fake.server as any);
  // 先让浏览器拿到一次虚拟模块，`lastVirtualModuleSource` 才有基线
  plugin.load!(VIRTUAL_ID);
  return fake;
}

describe('ubean:icon dev reload', () => {
  let rootDir = '';

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'ubean-icon-dev-'));
    mkdirSync(join(rootDir, 'src'), { recursive: true });
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  it('改源码但图标集合没变时只保留 HMR，不发 full-reload', () => {
    const file = join(rootDir, 'src/page.vue');
    writeFileSync(file, '<template><SIcon name="test:home" /></template>');
    const fake = setup({ test: TEST_COLLECTION }, rootDir);

    fake.emit('change', file);

    expect(fake.send).not.toHaveBeenCalled();
  });

  it('自定义图标集合的 svg 变化时发 full-reload（产物变了）', () => {
    const iconsDir = join(rootDir, 'icons');
    mkdirSync(iconsDir, { recursive: true });
    writeFileSync(join(iconsDir, 'logo.svg'), '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>');

    const plugin = ubeanIconPlugin({
      collections: { test: TEST_COLLECTION },
      customCollections: { custom: iconsDir }
    });
    plugin.configResolved!({ root: rootDir, command: 'serve' } as any);
    const fake = createFakeServer();
    plugin.configureServer!(fake.server as any);
    plugin.load!(VIRTUAL_ID);

    // 新增一个 svg 后触发 change：产物里多了图标，必须整页刷新
    writeFileSync(join(iconsDir, 'next.svg'), '<svg viewBox="0 0 24 24"><path d="M1 1h22v22H1z"/></svg>');
    fake.emit('change', join(iconsDir, 'next.svg'));

    expect(fake.send).toHaveBeenCalledWith({ type: 'full-reload' });
    expect(fake.invalidateModule).toHaveBeenCalled();
  });
});
