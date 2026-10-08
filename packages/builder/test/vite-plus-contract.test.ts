/**
 * vite-plus 实验性 API 契约测试（RM-V06，ADR-0012 的 Phase 0）。
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
 *
 * **版本锁**：期望版本不写死在测试里，而是从 `pnpm-workspace.yaml` 的 catalog
 * （工作区唯一事实来源）读取 —— 升级只改 catalog，测试自动跟随，不会再出现
 * 「catalog 已升到 X、测试还钉着 Y」的假红。catalog 写成精确版本时精确比对自动
 * 生效（于是「升级 → 重跑 RM-V23」的闸门由 catalog 变更触发）；写 dist-tag
 *（`latest`）时版本由安装时解析，断言退化为「两个入口必须同版本」—— 这正是
 * ADR-0012 真正依赖的不变量。
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createBuilder, DevEnvironment, createServerHotChannel } from 'vite';
import type { Plugin } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import { join, normalize } from 'pathe';
/** ADR-0012 / RM-V09 记的 specifier；vite-plus-core 与 vite-plus 两个入口都暴露它。 */
import { ESModulesEvaluator, ModuleRunner } from 'vite/module-runner';

const require = createRequire(import.meta.url);

/** ADR-0012 依赖的版本清单（catalog）所在文件。 */
const WORKSPACE_YAML = fileURLToPath(new URL('../../../pnpm-workspace.yaml', import.meta.url));
const EXACT_VERSION = /^\d+\.\d+\.\d+/;

/**
 * 读取 `pnpm-workspace.yaml` 顶层 `catalog:` 里的 `<name>: <spec>`。
 * 只解析这个扁平映射（不引入 YAML 依赖）；找不到文件/键时返回 undefined，由调用方断言失败。
 */
function readCatalogSpec(name: string): string | undefined {
  const yaml = readFileSync(WORKSPACE_YAML, 'utf8');
  const block = yaml.split(/^catalog:[ \t]*$/m)[1];
  if (!block) return undefined;
  for (const line of block.split('\n').slice(1)) {
    if (/^\S/.test(line)) break; // 回到顶层 key（含空行）→ catalog 块结束
    const match = line.match(/^\s+['"]?([^'":]+)['"]?:[ \t]*(.+?)[ \t]*$/);
    if (match?.[1] === name) return match[2].replace(/^['"]|['"]$/g, '');
  }
  return undefined;
}

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
  it('vite-plus 与 vite（catalog 别名 → vite-plus-core）解析到同一版本', () => {
    const vitePlus = require('vite-plus/package.json') as { name: string; version: string };
    // `require.resolve('vite')` 在 Windows 上是反斜杠形态，而下面的正则只认正斜杠 → 替换不生效，
    // 于是拿 index.js **本身**当 package.json 读（`.name` 为 undefined，断言报得莫名其妙）。
    // pathe 的 normalize 把分隔符统一成正斜杠，两平台走同一条分支。
    const coreEntry = require.resolve('vite');
    const corePkg = require(normalize(coreEntry).replace(/dist\/vite\/node\/index\.(js|mjs)$/, 'package.json')) as {
      name: string;
      version: string;
    };

    // catalog 把 `vite` 指向 vite-plus-core：ADR-0012 的全部 Vite API 都来自这里
    expect(corePkg.name).toBe('@voidzero-dev/vite-plus-core');
    expect(readCatalogSpec('vite'), 'catalog 的 vite 别名必须指向 vite-plus-core').toMatch(
      /^npm:@voidzero-dev\/vite-plus-core@/
    );

    // 真正的锁：CLI 与 core 两条安装路径必须同版本，升级错位时这里先红
    expect(vitePlus.version).toBe(corePkg.version);
    expect(vitePlus.version).toMatch(EXACT_VERSION);

    // catalog 写精确版本 → 精确比对自动生效；写 dist-tag（latest）→ 版本由安装时解析
    const declared = readCatalogSpec('vite-plus');
    expect(declared, 'pnpm-workspace.yaml catalog 应声明 vite-plus').toBeTruthy();
    if (declared && EXACT_VERSION.test(declared)) {
      expect(vitePlus.version).toBe(declared);
    }
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
