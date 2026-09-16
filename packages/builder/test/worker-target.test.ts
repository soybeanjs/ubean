import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
/**
 * worker 目标的产物卫生（缺陷 D 的回归网）。
 *
 * 背景：Cloudflare preset 的产物曾**在 workerd 里起不来**，一串原因逐个实测出来：
 *
 * 1. `ubean/server` 的 barrel 重导出了 `@ubean/shared/node`（端口探测 / 网卡枚举）→ 每个服务端图
 *    都带 `node:net` / `node:os`；
 * 2. `node:fs` 来自 `serveStatic`、fs 缓存存储与 SEO 约定扫描 —— 运行时的 `isNodeRuntime()` 守卫
 *    救不了它们，因为打包器会把**静态 import 的 node 内建**留在产物里，workerd 在**模块实例化**
 *    阶段就失败；
 * 3. SSR 构建默认把依赖外部化（`hono` / `vue` 留成 bare specifier），worker 运行时解析不到；
 * 4. 打包器为 CJS 依赖生成的垫片用 `createRequire(import.meta.url)`，而 workerd 里
 *    `import.meta.url` 是 **undefined**；
 * 5. `nodejs_compat` 的 v2 语义（`process` / `Buffer` 全局）要求 compatibility_date ≥ 2024-09-23。
 *
 * 这里锁住**配置面**的判据（谁都不用去起一个 worker 就能守住）：worker 目标必须全量打包、无
 * 外部依赖、带全局垫片，且 node:fs 被换成桩。真机验收见 `cloudflare-preview.test.ts` 里那条
 * 「built artifact boots in workerd」用例（需要 `miniflare`，缺依赖时跳过）。
 */
import { describe, expect, it } from 'vitest';
import { registerBuiltinPresets, resolvePresetByName } from '@ubean/preset';
import { getPresetBuildConfig } from '../src/production';
import { createBuildEnvironments, getBuildOutDirsForConfig, serverExternal } from '../src/vite/build-configs';
import { findUnsupportedNodeImports } from '../src/vite/cloudflare-preview';
import { loadWorkerNodeStub, resolveWorkerNodeStub, WORKER_NODE_STUB_IDS } from '../src/vite/shims';

registerBuiltinPresets();
const workerPresetBuildConfig = getPresetBuildConfig(resolvePresetByName('cloudflare'));
const nodePresetBuildConfig = getPresetBuildConfig(resolvePresetByName('node'));

function envs(presetBuildConfig: typeof workerPresetBuildConfig) {
  return createBuildEnvironments({
    outDirs: getBuildOutDirsForConfig({ rootDir: '/tmp/x', build: { outputDir: 'dist' } } as never),
    clientInput: '/tmp/x/.ubean/virtual/client-entry.mjs',
    minify: true,
    sourcemap: false,
    presetBuildConfig,
    ssrNoExternal: ['ubean']
  }) as Record<string, { resolve?: Record<string, unknown>; define?: Record<string, string> }>;
}

describe('worker 目标的构建配置', () => {
  it('全量打包、零外部依赖（worker 运行时解析不到任何 bare specifier）', () => {
    const worker = envs(workerPresetBuildConfig).ubean;
    // `hono` / `vue` 这类运行时依赖必须内联，否则 workerd 实例化就失败
    expect(serverExternal(workerPresetBuildConfig)).toEqual([]);
    // noExternal 用「匹配一切」的正则表达 true 的语义（输入类型不接受 true）
    const noExternal = worker.resolve?.noExternal as RegExp[];
    expect(noExternal.some(r => r instanceof RegExp && r.test('hono'))).toBe(true);
    const external = worker.resolve?.external as unknown[];
    expect(external).toEqual([]);
  });

  it('注入 process.env.NODE_ENV 与 global 垫片（顶层引用会让 worker 实例化失败）', () => {
    const worker = envs(workerPresetBuildConfig).ubean;
    expect(worker.define).toMatchObject({
      'process.env.NODE_ENV': '"production"',
      global: 'globalThis'
    });
  });

  it('node 目标不受影响：依赖仍外部化、不加 worker 垫片', () => {
    const node = envs(nodePresetBuildConfig).ubean;
    expect(serverExternal(nodePresetBuildConfig).length).toBeGreaterThan(0);
    expect(node.define).toBeUndefined();
    expect(node.resolve?.noExternal).toEqual(['ubean']);
  });
});

describe('node 内建桩', () => {
  it('只桩 node:fs 系列（crypto / async_hooks / path 由 nodejs_compat 支持）', () => {
    expect([...WORKER_NODE_STUB_IDS].sort()).toEqual(['fs', 'fs/promises', 'node:fs', 'node:fs/promises']);
    expect(resolveWorkerNodeStub('node:crypto')).toBeUndefined();
    expect(resolveWorkerNodeStub('node:async_hooks')).toBeUndefined();
    expect(resolveWorkerNodeStub('node:path')).toBeUndefined();
  });

  it('桩源码覆盖 Node 的完整导出面，且不含非法标识符（`default` 之类）', () => {
    const fsStub = loadWorkerNodeStub(resolveWorkerNodeStub('node:fs')!)!;
    // 生成而非手写：第三方依赖会 import 任意 fs 名字（实测 tinyglobby 用 realpathSync / stat）
    expect(fsStub).toContain('export function readdirSync()');
    expect(fsStub).toContain('export function realpathSync()');
    expect(fsStub).toContain('export function stat()');
    // 非函数导出（fs.promises / fs.constants）也要有，否则构建期报 MISSING_EXPORT
    expect(fsStub).toContain('export const promises');
    expect(fsStub).toContain('export const constants');
    // `default` 是保留字：生成时必须过滤（实测 PARSE_ERROR）
    expect(fsStub).not.toMatch(/export function default\b/);
    expect(fsStub).not.toMatch(/export const default\b/);

    const promisesStub = loadWorkerNodeStub(resolveWorkerNodeStub('node:fs/promises')!)!;
    expect(promisesStub).toContain('export function mkdir()');
    expect(promisesStub).toContain('export function readFile()');
  });

  it('桩调用时报错且说清替代方案（不是静默返回空值）', () => {
    const stub = loadWorkerNodeStub(resolveWorkerNodeStub('node:fs')!)!;
    expect(stub).toContain('需要 Node 系运行时');
    expect(stub).toContain('assets.directory');
  });
});

describe('worker 产物审计（findUnsupportedNodeImports）', () => {
  it('识别 workerd 不支持的内建导入，并与桩清单互补', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ubean-worker-audit-'));
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'entry.mjs'), "import net from 'node:net';\nimport os from 'node:os';\n");
      const found = findUnsupportedNodeImports(dir);
      expect(found).toContain('node:net');
      expect(found).toContain('node:os');
      // node:fs 被构建期换成桩，不该出现在产物里；审计仍把它算作「不支持」，作为兜底
      expect(found).not.toContain('node:crypto');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
