/**
 * `@ubean/integrations/electron` 占位 `index.html` 清理测试
 *
 * 起因：`ubean dev` 会在项目根目录留一个 `index.html`。
 * `vite-plugin-electron` 的 `resolveInput(config)` 只认 `build.rollupOptions.input` /
 * `build.lib` / 根目录已存在的 `index.html`，ubean 三者都不给（入口按环境声明、dev 走虚拟模块
 * `virtual:ubean-client-entry`），于是它写下自己那份占位 HTML。文件从未被访问
 * （`GET /index.html` → 404），但会污染 `git status`，且被 SIGKILL 时不会被清理。
 *
 * 这里锁住两件事：
 * 1. 只有**内容等于官方 mock** 时才删 —— 用户手写的根 `index.html` 不能被误删；
 * 2. 清理插件在 ubeanElectronPlugin 返回数组的**末尾** —— `configResolved` 同批按注册顺序
 *    执行，排在前面会在插件写文件之前就查一次，然后什么也删不掉。
 */

import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  VITE_PLUGIN_ELECTRON_MOCK_INDEX_HTML,
  ELECTRON_INDEX_CLEANUP_PLUGIN_NAME,
  isVitePluginElectronMock,
  createElectronIndexHtmlCleanupPlugin
} from '../src/electron/index-html-cleanup';

/** 造一个最小的 `configResolved` 入参：插件只读 `root` 与 `logger`。 */
function fakeConfig(root: string) {
  return {
    root,
    logger: { info: () => {}, warn: () => {}, error: () => {} }
  } as never;
}

/** 跑一次清理插件的 `configResolved`（它是 async 的）。 */
async function runCleanup(root: string) {
  const plugin = createElectronIndexHtmlCleanupPlugin();
  const hook = plugin.configResolved as (config: never) => Promise<void>;
  await hook(fakeConfig(root));
}

describe('@ubean/integrations/electron 占位 index.html 清理', () => {
  it('mock 常量与 vite-plugin-electron 的 MOCK_INDEX_HTML 逐字节一致', () => {
    // 内容比对是唯一的判据，常量漂了就等于整套防护失效。这里把字节写死。
    expect(VITE_PLUGIN_ELECTRON_MOCK_INDEX_HTML).toBe(
      `<!doctype html>
<html lang="en">
  <head>
    <title>vite-plugin-electron</title>
  </head>
  <body>
    <div>An entry file for electron renderer process.</div>
  </body>
</html>`
    );
    expect(Buffer.byteLength(VITE_PLUGIN_ELECTRON_MOCK_INDEX_HTML)).toBe(178);
  });

  describe('isVitePluginElectronMock', () => {
    it('完全相等时为真', () => {
      expect(isVitePluginElectronMock(VITE_PLUGIN_ELECTRON_MOCK_INDEX_HTML)).toBe(true);
    });

    it('尾随空白差异仍判为 mock', () => {
      expect(isVitePluginElectronMock(`${VITE_PLUGIN_ELECTRON_MOCK_INDEX_HTML}\n`)).toBe(true);
    });

    it('真实的应用入口不是 mock', () => {
      const real = `<!doctype html>
<html lang="zh">
  <head><title>soybean-agent</title></head>
  <body><div id="app"></div></body>
</html>`;
      expect(isVitePluginElectronMock(real)).toBe(false);
    });

    it('空串不是 mock', () => {
      expect(isVitePluginElectronMock('')).toBe(false);
    });
  });

  describe('清理行为', () => {
    let dir: string;

    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), 'ubean-electron-mock-'));
    });

    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it('删掉插件写的占位文件', async () => {
      const target = join(dir, 'index.html');
      await writeFile(target, VITE_PLUGIN_ELECTRON_MOCK_INDEX_HTML);

      await runCleanup(dir);

      expect(existsSync(target)).toBe(false);
    });

    it('保留用户自己的 index.html（内容不同）', async () => {
      const target = join(dir, 'index.html');
      const real = '<!doctype html><html><body><div id="app"></div></body></html>';
      await writeFile(target, real);

      await runCleanup(dir);

      // 这一条是整个修复里最要紧的判据：宁可不删，也不能删错
      expect(existsSync(target)).toBe(true);
      expect(await readFile(target, 'utf-8')).toBe(real);
    });

    it('文件不存在时不报错', async () => {
      await expect(runCleanup(dir)).resolves.toBeUndefined();
    });

    it('root 里有别的文件时不受影响', async () => {
      await mkdir(join(dir, 'src'), { recursive: true });
      await writeFile(join(dir, 'package.json'), '{}\n');
      await writeFile(join(dir, 'index.html'), VITE_PLUGIN_ELECTRON_MOCK_INDEX_HTML);

      await runCleanup(dir);

      expect(existsSync(join(dir, 'index.html'))).toBe(false);
      expect(existsSync(join(dir, 'package.json'))).toBe(true);
      expect(existsSync(join(dir, 'src'))).toBe(true);
    });
  });

  describe('插件形状', () => {
    it('name 稳定且只在 serve 下生效', () => {
      const plugin = createElectronIndexHtmlCleanupPlugin();
      expect(plugin.name).toBe(ELECTRON_INDEX_CLEANUP_PLUGIN_NAME);
      // build 路径没有这个 mock，不该跟着跑
      expect(plugin.apply).toBe('serve');
    });
  });

  describe('与 ubeanElectronPlugin 的装配顺序', () => {
    it('清理插件排在 vite-plugin-electron 产出的插件之后', async () => {
      // 顺序是行为的一部分：`configResolved` 同批按注册顺序执行，清理排在写文件之前就什么也删不掉。
      const mod = (await import('../src/electron/index')) as unknown as {
        ubeanElectronPlugin: (o?: unknown) => Promise<{ name?: string }[]>;
      };
      const plugins = await mod.ubeanElectronPlugin();

      expect(plugins).toHaveLength(3); // main / preload 各一个 + 清理
      expect(plugins.at(-1)?.name).toBe(ELECTRON_INDEX_CLEANUP_PLUGIN_NAME);
      expect(plugins.slice(0, -1).every(p => p.name?.startsWith('ubean:electron('))).toBe(true);
    });

    it('真 Vite dev server 下：带清理插件不留 index.html，不带会留', async () => {
      // 这是唯一能证明修复真的生效的用例 —— A/B 用真 `createServer`（跑 configResolved 但
      // 不 listen，因此不会启动 Electron）。
      const { createServer } = await import('vite');
      const dir = await mkdtemp(join(tmpdir(), 'ubean-electron-ab-'));
      const noop = { info: () => {} };

      try {
        await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'ab-probe', type: 'module' }));
        await mkdir(join(dir, 'electron'), { recursive: true });
        await writeFile(join(dir, 'electron/main.ts'), 'console.log(1)');
        await writeFile(join(dir, 'electron/preload.ts'), 'console.log(2)');

        const mod = (await import('../src/electron/index')) as unknown as {
          ubeanElectronPlugin: (o?: unknown) => Promise<{ name?: string }[]>;
        };
        const all = await mod.ubeanElectronPlugin();
        const options = { root: dir, logLevel: 'silent' as const, configFile: false, customLogger: noop as never };

        // A：拿掉清理插件 —— vite-plugin-electron 的 mock 留在盘上
        const without = await createServer({ ...options, plugins: all.slice(0, -1) as never });
        const existsWithout = existsSync(join(dir, 'index.html'));
        await rm(join(dir, 'index.html'), { force: true });
        await without.close();

        // B：带清理插件 —— 盘上干净
        const with_ = await createServer({ ...options, plugins: all as never });
        const existsWith = existsSync(join(dir, 'index.html'));
        await with_.close();

        expect(existsWithout).toBe(true);
        expect(existsWith).toBe(false);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }, 60000);

    it('enabled: false 时不注册清理插件', async () => {
      const mod = (await import('../src/electron/index')) as unknown as {
        ubeanElectronPlugin: (o?: unknown) => Promise<{ name?: string }[]>;
      };
      const plugins = await mod.ubeanElectronPlugin({ enabled: false });

      expect(plugins).toHaveLength(1);
      expect(plugins[0]?.name).toBe('ubean:electron:noop');
    });
  });
});
