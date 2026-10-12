import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
/**
 * 项目依赖提醒（`ensurePackages` 式的主动提示）单测。
 *
 * 覆盖三层清单的选取与去重、探测（含 pnpm isolated node_modules 下的
 * `ERR_PACKAGE_PATH_NOT_EXPORTED` 语义）、安装计划构造、以及交互判据
 * （CI / 非 TTY → 只提示不提问）。
 *
 * 用临时目录 + afterEach 清理，不污染 process.cwd()（ADR-0002 测试边界）。
 */
import {
  checkProjectDependencies,
  buildInstallPlan,
  detectPackageManager,
  findMissingProjectDependencies,
  formatCommand,
  resolveConfigDependencies,
  resolveSelectedCapabilities,
  clearProjectDependencyProbeCache
} from '../src';
import type { ProjectDependencyCheckResult } from '../src';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ubean-project-deps-'));
  clearProjectDependencyProbeCache();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  clearProjectDependencyProbeCache();
});

/** 造一个能解析 `name` 的最小 node_modules。 */
function stubPackage(name: string, version = '1.0.0'): void {
  const dir = join(tmpDir, 'node_modules', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version, main: 'index.js' }));
  writeFileSync(join(dir, 'index.js'), 'module.exports = {};');
}

function writeProjectPackageJson(deps: Record<string, string> = {}): void {
  writeFileSync(
    join(tmpDir, 'package.json'),
    JSON.stringify({ name: 'fixture', version: '0.0.0', dependencies: deps })
  );
}

describe('resolveConfigDependencies() 清单选取', () => {
  it('核心依赖始终在（vue / vue-router / vue-i18n）', () => {
    const { all } = resolveConfigDependencies({});
    const names = all.map(s => s.name);
    expect(names).toContain('vue');
    expect(names).toContain('vue-router');
    expect(names).toContain('vue-i18n');
  });

  it('core: false 时不检查核心依赖', () => {
    const { all } = resolveConfigDependencies({}, { core: false });
    expect(all.map(s => s.name)).not.toContain('vue');
  });

  it('ui: true → 模块包 @ubean/integrations + 必需 peer @vean/ui', () => {
    const { all } = resolveConfigDependencies({ ui: true });
    const byName = new Map(all.map(s => [s.name, s]));
    expect(byName.get('@ubean/integrations')).toMatchObject({
      kind: 'required',
      installAs: 'prod',
      versionFromUbean: true
    });
    expect(byName.get('@vean/ui')).toMatchObject({ kind: 'required', installAs: 'prod' });
  });

  it('未启用 ui 时不要求 @vean/ui', () => {
    const { all } = resolveConfigDependencies({});
    expect(all.map(s => s.name)).not.toContain('@vean/ui');
  });

  it('electron 是构建期依赖 → devDependencies', () => {
    const { all } = resolveConfigDependencies({ electron: true });
    expect(all.find(s => s.name === 'electron')).toMatchObject({ kind: 'required', installAs: 'dev' });
  });

  it('pinia / better-auth 是运行期依赖 → dependencies', () => {
    const { all } = resolveConfigDependencies({ pinia: true, auth: true });
    expect(all.find(s => s.name === 'pinia')).toMatchObject({ installAs: 'prod' });
    expect(all.find(s => s.name === 'better-auth')).toMatchObject({ installAs: 'prod' });
  });

  it('{ disabled: true } 视为未启用', () => {
    const { all } = resolveConfigDependencies({ ui: { disabled: true } });
    expect(all.map(s => s.name)).not.toContain('@vean/ui');
  });

  it('可选依赖：satori 只在 ogImage 探测为真时进入清单', () => {
    expect(resolveConfigDependencies({}).all.map(s => s.name)).not.toContain('satori');
    const withOg = resolveConfigDependencies({}, { ogImage: true });
    expect(withOg.optional.map(s => s.name)).toContain('satori');
    expect(withOg.optional.map(s => s.name)).toContain('@resvg/resvg-js');
  });

  it('pagefind 由 search 开关触发，且是 devDependencies', () => {
    const { all } = resolveConfigDependencies({ search: true });
    expect(all.find(s => s.name === 'pagefind')).toMatchObject({ kind: 'optional', installAs: 'dev' });
    expect(resolveConfigDependencies({ search: false }).all.map(s => s.name)).not.toContain('pagefind');
  });

  it('@mdx-js/mdx 由 markdown.mdx 触发', () => {
    const { all } = resolveConfigDependencies({ markdown: { mdx: true } });
    expect(all.find(s => s.name === '@mdx-js/mdx')).toMatchObject({ kind: 'optional', installAs: 'dev' });
    expect(resolveConfigDependencies({ markdown: { enabled: false, mdx: true } }).all.map(s => s.name)).not.toContain(
      '@mdx-js/mdx'
    );
  });

  it('cloudflare 预设触发 miniflare', () => {
    const { all } = resolveConfigDependencies({ build: { preset: 'cloudflare' } });
    expect(all.find(s => s.name === 'miniflare')).toMatchObject({ kind: 'optional', installAs: 'dev' });
  });

  it('modules 数组写法也算启用（与 resolveModules 去重规则一致）', () => {
    const selected = resolveSelectedCapabilities({ modules: ['@ubean/icon/vite'] });
    expect(selected.has('icon')).toBe(true);
  });

  it('同一包被多个能力要求时去重且必需优先', () => {
    const { all } = resolveConfigDependencies({ ui: true, pinia: true });
    const names = all.map(s => s.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('findMissingProjectDependencies() 探测', () => {
  it('未安装的包进入缺失列表，已安装的不进', () => {
    writeProjectPackageJson();
    stubPackage('vue');
    const resolved = resolveConfigDependencies({ ui: true });
    const missing = findMissingProjectDependencies(tmpDir, resolved).map(s => s.name);
    expect(missing).toContain('@vean/ui');
    expect(missing).not.toContain('vue');
  });

  it('必需项排在可选项之前', () => {
    writeProjectPackageJson();
    const resolved = resolveConfigDependencies({ ui: true }, { ogImage: true });
    const missing = findMissingProjectDependencies(tmpDir, resolved);
    const kinds = missing.map(s => s.kind);
    expect(kinds.indexOf('optional')).toBeGreaterThan(kinds.lastIndexOf('required'));
  });

  it('pnpm isolated node_modules：包存在但根入口不导出也算已安装', () => {
    writeProjectPackageJson();
    // `@ubean/integrations` 的 `exports` 没有 `.` 条件 —— 探测必须按「能否解析包名」而不是
    // 「能否 import 根入口」，否则装了也被判缺失（实测 `ERR_PACKAGE_PATH_NOT_EXPORTED`）。
    const dir = join(tmpDir, 'node_modules', '@ubean', 'integrations');
    mkdirSync(join(dir, 'dist'), { recursive: true });
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name: '@ubean/integrations',
        version: '0.6.2',
        exports: { './pwa': './dist/pwa.js' }
      })
    );
    const resolved = resolveConfigDependencies({ pwa: true }, { core: false });
    const missing = findMissingProjectDependencies(tmpDir, resolved).map(s => s.name);
    expect(missing).not.toContain('@ubean/integrations');
  });
});

describe('buildInstallPlan() 安装计划', () => {
  it('按 installAs 分组并生成可直接执行的命令', () => {
    const resolved = resolveConfigDependencies({ ui: true, electron: true }, { core: false });
    const missing = findMissingProjectDependencies(tmpDir, resolved);
    const plan = buildInstallPlan(missing, 'pnpm', '0.6.2');
    expect(plan.commands).toHaveLength(2);
    expect(plan.commands[0]).toContain('pnpm add');
    expect(plan.commands[0]).toContain('@ubean/integrations@^0.6.2');
    expect(plan.commands[1]).toContain('-D');
    expect(plan.commands[1]).toContain('electron');
  });

  it('清单自带 range 优先于 ubean 版本', () => {
    const resolved = resolveConfigDependencies({ auth: true }, { core: false });
    const missing = findMissingProjectDependencies(tmpDir, resolved);
    const plan = buildInstallPlan(missing, 'pnpm', '0.6.2');
    expect(plan.prod).toContain('better-auth@^1.7.7');
    expect(plan.prod).toContain('@ubean/auth@^0.6.2');
  });

  it('含 shell 元字符的 range 不拼进命令（`>` 会被当重定向、`|` 当管道）', () => {
    const resolved = resolveConfigDependencies({ ui: true, electron: true }, { core: false });
    const missing = findMissingProjectDependencies(tmpDir, resolved);
    const plan = buildInstallPlan(missing, 'pnpm', '0.6.2');
    // @vean/ui 的 `>=0.50.0-0` 与 electron 的长 `||` 链都丢掉，只留包名
    expect(plan.prod).toContain('@vean/ui');
    expect(plan.dev).toContain('electron');
    for (const command of plan.commands) {
      expect(command).not.toMatch(/[>|]/);
    }
  });

  it('无 ubean 版本时不钉 @ubean 包版本', () => {
    const resolved = resolveConfigDependencies({ auth: true }, { core: false });
    const missing = findMissingProjectDependencies(tmpDir, resolved);
    const plan = buildInstallPlan(missing, 'pnpm', null);
    expect(plan.prod).toContain('@ubean/auth');
  });

  it('bun 用 -d 表示 devDependencies', () => {
    const resolved = resolveConfigDependencies({ electron: true }, { core: false });
    const missing = findMissingProjectDependencies(tmpDir, resolved);
    const plan = buildInstallPlan(missing, 'bun');
    // prod 组（@ubean/integrations）在前，dev 组（electron）在后
    expect(plan.commands[0]).toContain('bun add @ubean/integrations');
    expect(plan.commands[1]).toBe('bun add -d electron');
  });

  it('npm 用 install 子命令', () => {
    const resolved = resolveConfigDependencies({ pinia: true }, { core: false });
    const missing = findMissingProjectDependencies(tmpDir, resolved);
    const plan = buildInstallPlan(missing, 'npm');
    expect(plan.commands[0]).toBe('npm install @ubean/integrations pinia');
  });

  it('formatCommand 拼接成一行', () => {
    expect(formatCommand({ cmd: 'pnpm', args: ['add', 'vue'] })).toBe('pnpm add vue');
  });
});

describe('checkProjectDependencies() 交互', () => {
  const logs: string[] = [];
  const logger = {
    info: (m: string) => logs.push(`info:${m}`),
    warn: (m: string) => logs.push(`warn:${m}`)
  };

  beforeEach(() => {
    logs.length = 0;
  });

  function run(
    overrides: Partial<Parameters<typeof checkProjectDependencies>[0]> = {}
  ): Promise<ProjectDependencyCheckResult> {
    return checkProjectDependencies({
      cwd: tmpDir,
      config: { ui: true, pinia: true },
      core: false,
      logger,
      interactive: false,
      packageManager: 'pnpm',
      ...overrides
    });
  }

  it('全部已安装 → 无缺失、无提示', async () => {
    writeProjectPackageJson();
    stubPackage('@ubean/integrations');
    stubPackage('@vean/ui');
    stubPackage('pinia');
    const result = await run();
    expect(result.missing).toHaveLength(0);
    expect(logs).toHaveLength(0);
  });

  it('非交互（CI / 非 TTY）→ 只提示不提问、不安装', async () => {
    writeProjectPackageJson();
    let installCalled = false;
    const result = await run({
      mode: 'prompt',
      install: () => {
        installCalled = true;
      }
    });
    expect(installCalled).toBe(false);
    expect(result.prompted).toBe(false);
    expect(result.installed).toBe(false);
    expect(logs.some(l => l.includes('@vean/ui'))).toBe(true);
    expect(logs.some(l => l.includes('install with: pnpm add'))).toBe(true);
  });

  it('mode: warn 时即使可交互也不提问', async () => {
    writeProjectPackageJson();
    let confirmCalled = false;
    const result = await run({
      mode: 'warn',
      interactive: true,
      confirm: async () => {
        confirmCalled = true;
        return true;
      }
    });
    expect(confirmCalled).toBe(false);
    expect(result.prompted).toBe(false);
  });

  it('交互 + 用户同意 → 执行安装', async () => {
    writeProjectPackageJson();
    let installedPlan: unknown;
    const result = await run({
      mode: 'prompt',
      interactive: true,
      confirm: async () => true,
      install: plan => {
        installedPlan = plan;
      }
    });
    expect(result.installed).toBe(true);
    expect(result.prompted).toBe(true);
    expect(installedPlan).toBeTruthy();
    expect(logs.some(l => l.startsWith('info:Installed:'))).toBe(true);
  });

  it('交互 + 用户拒绝 → 不安装但保留提示', async () => {
    writeProjectPackageJson();
    const result = await run({
      mode: 'prompt',
      interactive: true,
      confirm: async () => false,
      install: () => {
        throw new Error('should not install');
      }
    });
    expect(result.installed).toBe(false);
    expect(result.prompted).toBe(true);
  });

  it('安装失败 → 降级为 warning 并给出手动命令，不抛错', async () => {
    writeProjectPackageJson();
    const result = await run({
      mode: 'prompt',
      interactive: true,
      confirm: async () => true,
      install: () => {
        throw new Error('boom');
      }
    });
    expect(result.installed).toBe(false);
    expect(logs.some(l => l.includes('Failed to install project dependencies: boom'))).toBe(true);
    expect(logs.some(l => l.includes('Please install manually: pnpm add'))).toBe(true);
  });

  it('提示文本区分必需与可选，并说明谁要求它', async () => {
    writeProjectPackageJson();
    await run({ config: { ui: true }, ogImage: true });
    expect(logs.some(l => l.includes('Missing required project dependencies'))).toBe(true);
    expect(logs.some(l => l.includes('required by `ui`'))).toBe(true);
    expect(logs.some(l => l.includes('Missing optional project dependencies'))).toBe(true);
    expect(logs.some(l => l.includes('`seo.og-image`'))).toBe(true);
  });

  it('OG 图约定文件存在时才要求 satori', async () => {
    writeProjectPackageJson();
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'og-image.ts'), 'export default {}');
    const result = await run({ config: {} });
    expect(result.optional.map(s => s.name)).toContain('satori');
  });
});

describe('detectPackageManager() 锁文件探测', () => {
  it('pnpm 优先于其它锁文件', () => {
    writeFileSync(join(tmpDir, 'pnpm-lock.yaml'), '');
    writeFileSync(join(tmpDir, 'yarn.lock'), '');
    expect(detectPackageManager(tmpDir)).toBe('pnpm');
  });

  it('无锁文件回退 npm', () => {
    expect(detectPackageManager(tmpDir)).toBe('npm');
  });
});
