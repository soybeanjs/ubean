import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
/**
 * OPT-04 4c — @ubean/cli scaffold 集成 smoke 测试
 *
 * 用临时目录跑真实文件写入，覆盖 scaffold / deleteScaffold / recoverScaffold /
 * listScaffoldableFiles 的主路径与边界（dry / force / 已存在跳过 / 不存在删除）。
 *
 * 不启动 Vite/HTTP，聚焦 scaffold 文件操作契约（ADR-0002 测试边界）。
 * 临时目录 + afterEach 清理，不污染 process.cwd()。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { scaffold, deleteScaffold, recoverScaffold } from '../src/page';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ubean-cli-scaffold-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

async function expectFileExists(relPath: string, exists: boolean): Promise<void> {
  const abs = join(tmpDir, relPath);
  expect(existsSync(abs)).toBe(exists);
}

describe('scaffold() — 创建', () => {
  it('page：创建 src/pages/about.vue', async () => {
    const result = await scaffold({ cwd: tmpDir, type: 'page', path: 'about' });
    expect(result.created).toContain('src/pages/about.vue');
    expect(result.errors).toHaveLength(0);
    await expectFileExists('src/pages/about.vue', true);
    const content = readFileSync(join(tmpDir, 'src/pages/about.vue'), 'utf-8');
    expect(content).toContain('definePage');
    expect(content).toContain('About');
  });

  it('api：创建 src/routes/users.ts', async () => {
    const result = await scaffold({ cwd: tmpDir, type: 'api', path: 'users' });
    expect(result.created).toContain('src/routes/users.ts');
    await expectFileExists('src/routes/users.ts', true);
    const content = readFileSync(join(tmpDir, 'src/routes/users.ts'), 'utf-8');
    expect(content).toContain('defineHandler');
  });

  it('layout：创建 src/layouts/default.vue', async () => {
    const result = await scaffold({ cwd: tmpDir, type: 'layout', path: 'default' });
    expect(result.created).toContain('src/layouts/default.vue');
    await expectFileExists('src/layouts/default.vue', true);
    const content = readFileSync(join(tmpDir, 'src/layouts/default.vue'), 'utf-8');
    expect(content).toContain('<slot />');
  });

  it('middleware：创建 src/middleware/auth.ts', async () => {
    const result = await scaffold({ cwd: tmpDir, type: 'middleware', path: 'auth' });
    expect(result.created).toContain('src/middleware/auth.ts');
    await expectFileExists('src/middleware/auth.ts', true);
  });

  it('cron：创建 src/server/crons/cleanup.ts', async () => {
    const result = await scaffold({
      cwd: tmpDir,
      type: 'cron',
      path: 'cleanup',
      schedule: '0 * * * *'
    });
    expect(result.created).toContain('src/server/crons/cleanup.ts');
    await expectFileExists('src/server/crons/cleanup.ts', true);
    const content = readFileSync(join(tmpDir, 'src/server/crons/cleanup.ts'), 'utf-8');
    expect(content).toContain('0 * * * *');
  });

  it('plugin：创建 src/plugins/analytics.ts', async () => {
    const result = await scaffold({ cwd: tmpDir, type: 'plugin', path: 'analytics' });
    expect(result.created).toContain('src/plugins/analytics.ts');
    await expectFileExists('src/plugins/analytics.ts', true);
  });

  it('嵌套路径：page user/profile → src/pages/user/profile.vue', async () => {
    const result = await scaffold({ cwd: tmpDir, type: 'page', path: 'user/profile' });
    expect(result.created).toContain('src/pages/user/profile.vue');
    await expectFileExists('src/pages/user/profile.vue', true);
  });

  it('index 路径：page 空字符串 → src/pages/index.vue', async () => {
    const result = await scaffold({ cwd: tmpDir, type: 'page', path: '' });
    expect(result.created).toContain('src/pages/index.vue');
    await expectFileExists('src/pages/index.vue', true);
  });
});

describe('scaffold() — dry run', () => {
  it('dry=true 不写文件，但记入 created', async () => {
    const result = await scaffold({ cwd: tmpDir, type: 'page', path: 'about', dry: true });
    expect(result.created).toContain('src/pages/about.vue');
    await expectFileExists('src/pages/about.vue', false);
  });
});

describe('scaffold() — 已存在跳过 / force 覆盖', () => {
  it('已存在且 force=false → skipped', async () => {
    await scaffold({ cwd: tmpDir, type: 'page', path: 'about' });
    const result = await scaffold({ cwd: tmpDir, type: 'page', path: 'about' });
    expect(result.skipped).toContain('src/pages/about.vue');
    expect(result.created).toHaveLength(0);
  });

  it('已存在且 force=true → 覆盖并创建备份', async () => {
    await scaffold({ cwd: tmpDir, type: 'page', path: 'about' });
    const result = await scaffold({ cwd: tmpDir, type: 'page', path: 'about', force: true });
    expect(result.created).toContain('src/pages/about.vue');
    // 备份文件存在
    await expectFileExists('src/pages/about.vue.bak', true);
  });
});

describe('deleteScaffold() — 删除', () => {
  it('删除已存在文件（force=true 直接删）', async () => {
    await scaffold({ cwd: tmpDir, type: 'page', path: 'about' });
    const result = await deleteScaffold({ cwd: tmpDir, type: 'page', path: 'about', force: true });
    expect(result.deleted).toContain('src/pages/about.vue');
    await expectFileExists('src/pages/about.vue', false);
  });

  it('删除已存在文件（force=false → 备份后删）', async () => {
    await scaffold({ cwd: tmpDir, type: 'page', path: 'about' });
    const result = await deleteScaffold({ cwd: tmpDir, type: 'page', path: 'about' });
    expect(result.deleted).toContain('src/pages/about.vue');
    await expectFileExists('src/pages/about.vue', false);
    await expectFileExists('src/pages/about.vue.bak', true);
  });

  it('删除不存在文件 → errors', async () => {
    const result = await deleteScaffold({ cwd: tmpDir, type: 'page', path: 'nope' });
    expect(result.deleted).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('dry=true 不实际删除', async () => {
    await scaffold({ cwd: tmpDir, type: 'page', path: 'about' });
    const result = await deleteScaffold({ cwd: tmpDir, type: 'page', path: 'about', dry: true });
    expect(result.deleted).toContain('src/pages/about.vue');
    await expectFileExists('src/pages/about.vue', true);
  });
});

describe('recoverScaffold() — 恢复', () => {
  it('从备份恢复已删除文件', async () => {
    await scaffold({ cwd: tmpDir, type: 'page', path: 'about' });
    await deleteScaffold({ cwd: tmpDir, type: 'page', path: 'about' });
    // 此时 .bak 存在，原文件不存在
    await expectFileExists('src/pages/about.vue', false);
    await expectFileExists('src/pages/about.vue.bak', true);

    const result = await recoverScaffold({ cwd: tmpDir, type: 'page', path: 'about' });
    expect(result.restored).toContain('src/pages/about.vue');
    await expectFileExists('src/pages/about.vue', true);
  });

  it('无备份时 dry → errors', async () => {
    const result = await recoverScaffold({ cwd: tmpDir, type: 'page', path: 'about', dry: true });
    expect(result.restored).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('scaffold() — 自定义 baseDir', () => {
  it('相对 baseDir 覆盖默认目录', async () => {
    const result = await scaffold({
      cwd: tmpDir,
      type: 'page',
      path: 'about',
      baseDir: 'custom/pages'
    });
    expect(result.created).toContain('custom/pages/about.vue');
    await expectFileExists('custom/pages/about.vue', true);
  });

  it('绝对 baseDir', async () => {
    const absBase = join(tmpDir, 'abs/pages');
    const result = await scaffold({
      cwd: tmpDir,
      type: 'page',
      path: 'about',
      baseDir: absBase
    });
    expect(result.created).toContain('abs/pages/about.vue');
    await expectFileExists('abs/pages/about.vue', true);
  });
});
