/**
 * vite-plus 实验性 API 契约测试（RM-V06，docs/vite-plugin-migration.md Phase 0）。
 *
 * ADR-0012 把 dev / build / preview 生命周期交给 Vite，依赖 vite-plus-core 的一批
 * `@experimental` API。它们没有稳定性承诺，升级时可能静默改签名 —— 本文件把 ADR 实际
 * 依赖的**形状与行为**钉住，漂移时在这里先红，而不是等到迁移中途。
 *
 * 只断言「ADR 会用到的东西」：
 * - 符号存在性与运行时可继承性（Builder / DevEnvironment / hot 通道 / module-runner）
 * - `config` 钩子注册的 `environments` 出现在 builder 上，且顺序稳定
 * - `buildApp` 钩子把编排权交给调用方（ADR-0012 §4 的全部依据）
 * - `build(env)` 的返回形态，以及 client 与 server 环境真的产出产物
 * - `BuilderOptions.sharedConfigBuild` / `sharedPlugins` 被接受
 *
 * 刻意**不**断言：两个 shared* 标志的可观测差异。实测（2026-09-15，0.3.1）在本文件的
 * 配置下，开关前后 `env.config` 身份与插件实例身份都没有变化，因此不能把它们写成
 * 「开启后 X === Y」——那会是假契约。RM-V09 / RM-V17 真正依赖其语义时，需另行用
 * 能观测到的信号（如跨环境共享的模块状态）验证。
 */
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBuilder, DevEnvironment, createServerHotChannel } from 'vite';
import type { Plugin } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
/** ADR-0012 / RM-V09 记的 specifier；vite-plus-core 与 vite-plus 两个入口都暴露它。 */
import { ESModulesEvaluator, ModuleRunner } from 'vite/module-runner';

const require = createRequire(import.meta.url);

/** ADR-0012 依赖的版本，升级需同步改这里并跑 RM-V23 验收矩阵。 */
const PINNED_VITE_PLUS = '0.3.3';

let projectDir: string;

afterEach(() => {
  if (projectDir) rmSync(projectDir, { recursive: true, force: true });
});

/** 最小可构建项目：client 走 index.html，server 走显式 ssr 入口。 */
function createProject(): string {
  projectDir = mkdtempSync(join(tmpdir(), 'ubean-vite-plus-contract-'));
  writeFileSync(join(projectDir, 'index.html'), '<div id="app"></div><script type="module" src="/main.js"></script>\n');
  writeFileSync(join(projectDir, 'main.js'), 'document.querySelector("#app").textContent = "contract";\n');
  writeFileSync(join(projectDir, 'server-entry.js'), 'export const handler = () => new Response("ok");\n');
  return projectDir;
}

function baseConfig(root: string, extra: Record<string, unknown> = {}) {
  return {
    root,
    configFile: false as const,
    logLevel: 'silent' as const,
    ...extra
  };
}

describe('依赖版本锁', () => {
  it('vite-plus 与 vite（catalog 别名 → vite-plus-core）都在锁定版本上', () => {
    const vitePlus = require('vite-plus/package.json') as { name: string; version: string };
    const coreEntry = require.resolve('vite');
    const corePkg = require(coreEntry.replace(/dist\/vite\/node\/index\.(js|mjs)$/, 'package.json')) as {
      name: string;
      version: string;
    };
    expect(vitePlus.version).toBe(PINNED_VITE_PLUS);
    expect(corePkg.version).toBe(PINNED_VITE_PLUS);
    // catalog 把 `vite` 指向 vite-plus-core：ADR-0012 的全部 Vite API 都来自这里
    expect(corePkg.name).toBe('@voidzero-dev/vite-plus-core');
  });
});

describe('实验性 API 形状（ADR-0012 依赖面）', () => {
  it('createBuilder 是函数', () => {
    expect(typeof createBuilder).toBe('function');
  });

  it('DevEnvironment 是可继承的类，带 ADR 要覆盖的生命周期方法', () => {
    expect(typeof DevEnvironment).toBe('function');
    const prototypeMethods = Object.getOwnPropertyNames(DevEnvironment.prototype);
    for (const method of ['init', 'listen', 'close', 'fetchModule', 'transformRequest', 'invalidateModule']) {
      expect(prototypeMethods, `DevEnvironment.${method}`).toContain(method);
    }
  });

  it('FetchableDevEnvironment 仍是仅类型导出（运行时不可用）', async () => {
    // ADR-0012 §3 的约束：能继承的运行时类是 DevEnvironment；`FetchableDevEnvironment`
    // 只提供 dispatchFetch 的类型契约，实现需自己补。
    const viteNamespace = (await import('vite')) as unknown as Record<string, unknown>;
    expect(Object.keys(viteNamespace)).not.toContain('FetchableDevEnvironment');
    expect(viteNamespace.FetchableDevEnvironment).toBeUndefined();
  });

  it('createServerHotChannel 返回可用的 hot 通道', () => {
    const channel = createServerHotChannel();
    expect(channel).toBeTruthy();
    for (const method of ['send', 'on', 'off', 'close', 'listen']) {
      expect(typeof (channel as unknown as Record<string, unknown>)[method], `hot.${method}`).toBe('function');
    }
    channel.close?.();
  });

  it('vite/module-runner 提供 ModuleRunner 与 ESModulesEvaluator', () => {
    expect(typeof ModuleRunner).toBe('function');
    expect(typeof ESModulesEvaluator).toBe('function');
  });
});

describe('environments 注册与 buildApp 编排', () => {
  it('config 钩子注册的 environments 出现在 builder 上且顺序稳定', async () => {
    const root = createProject();
    const builder = await createBuilder(
      baseConfig(root, {
        plugins: [
          {
            name: 'contract-environments',
            config: () => ({
              environments: {
                client: { consumer: 'client' },
                ubean: { consumer: 'server' }
              }
            })
          } satisfies Plugin
        ]
      })
    );

    expect(Object.keys(builder.environments)).toEqual(['client', 'ubean']);
    expect(builder.environments.client.name).toBe('client');
    expect(builder.environments.ubean.name).toBe('ubean');
    expect(builder.config).toBeTruthy();
  });

  it('buildApp 把编排权交给调用方，build(env) 对 client / server 都产出产物', async () => {
    const root = createProject();
    const order: string[] = [];
    const returnedTypes: string[] = [];

    const builder = await createBuilder(
      baseConfig(root, {
        environments: {
          client: { consumer: 'client', build: { outDir: 'out/client', emptyOutDir: false } },
          ubean: { consumer: 'server', build: { outDir: 'out/server', emptyOutDir: false, ssr: 'server-entry.js' } }
        },
        builder: {
          buildApp: async (b: typeof builder) => {
            order.push('buildApp');
            for (const name of Object.keys(b.environments)) {
              order.push(`env:${name}`);
              const output = await b.build(b.environments[name]);
              expect(output, `build(${name}) 应返回产物`).toBeTruthy();
              returnedTypes.push(`${name}:${Array.isArray(output) ? `array(${output.length})` : typeof output}`);
              order.push(`built:${name}`);
            }
          }
        }
      })
    );

    await builder.buildApp();

    // 顺序完全由调用方决定 —— 这正是 ADR-0012 §4「一次 createBuilder + buildApp 编排」的依据
    expect(order).toEqual(['buildApp', 'env:client', 'built:client', 'env:ubean', 'built:ubean']);
    // 实测两种环境都是单个 output 对象（不是数组、不是 watcher）
    expect(returnedTypes).toEqual(['client:object', 'ubean:object']);

    expect(readdirSync(join(root, 'out/client'))).toContain('index.html');
    expect(readdirSync(join(root, 'out/client'))).toContain('assets');
    expect(readdirSync(join(root, 'out/server'))).toContain('server-entry.mjs');
  }, 120_000);

  it('sharedConfigBuild / sharedPlugins 被接受且不改变产物', async () => {
    // 见文件头「刻意不断言」：实测开关前后环境 config 身份与插件实例身份均无变化，
    // 这里只锁定「配置合法、构建照常」，语义差异留给真正依赖它的 RM-V09 / RM-V17 验证。
    const root = createProject();
    const builder = await createBuilder(
      baseConfig(root, {
        environments: {
          client: { consumer: 'client', build: { outDir: 'out/client', emptyOutDir: false } },
          ubean: { consumer: 'server', build: { outDir: 'out/server', emptyOutDir: false, ssr: 'server-entry.js' } }
        },
        builder: { sharedConfigBuild: true, sharedPlugins: true }
      })
    );

    for (const environment of Object.values(builder.environments)) {
      await expect(builder.build(environment)).resolves.toBeTruthy();
    }
    expect(readdirSync(join(root, 'out/server'))).toContain('server-entry.mjs');
  }, 120_000);
});
