import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
/**
 * OPT-04 4c — @ubean/cli prepare 纯函数单测
 *
 * 覆盖 detectPackageManager / buildInstallCommand / extractPackageName /
 * getUbeanVersion。锁定包管理器检测、安装命令构造、包名提取、版本解析的回归。
 *
 * 使用临时目录 + afterEach 清理，不污染 process.cwd()（ADR-0002 测试边界）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectPackageManager, buildInstallCommand, extractPackageName, getUbeanVersion } from '../src/prepare';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ubean-cli-prepare-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('detectPackageManager()', () => {
  it('pnpm-lock.yaml → pnpm', () => {
    writeFileSync(join(tmpDir, 'pnpm-lock.yaml'), '');
    expect(detectPackageManager(tmpDir)).toBe('pnpm');
  });

  it('yarn.lock → yarn', () => {
    writeFileSync(join(tmpDir, 'yarn.lock'), '');
    expect(detectPackageManager(tmpDir)).toBe('yarn');
  });

  it('bun.lockb → bun', () => {
    writeFileSync(join(tmpDir, 'bun.lockb'), '');
    expect(detectPackageManager(tmpDir)).toBe('bun');
  });

  it('bun.lock → bun', () => {
    writeFileSync(join(tmpDir, 'bun.lock'), '');
    expect(detectPackageManager(tmpDir)).toBe('bun');
  });

  it('无锁文件 → npm（默认回退）', () => {
    expect(detectPackageManager(tmpDir)).toBe('npm');
  });

  it('优先级：pnpm > yarn > bun', () => {
    // 同时存在多种锁文件时，pnpm 优先
    writeFileSync(join(tmpDir, 'pnpm-lock.yaml'), '');
    writeFileSync(join(tmpDir, 'yarn.lock'), '');
    writeFileSync(join(tmpDir, 'bun.lock'), '');
    expect(detectPackageManager(tmpDir)).toBe('pnpm');
  });

  it('优先级：yarn > bun（无 pnpm 时）', () => {
    writeFileSync(join(tmpDir, 'yarn.lock'), '');
    writeFileSync(join(tmpDir, 'bun.lock'), '');
    expect(detectPackageManager(tmpDir)).toBe('yarn');
  });
});

describe('buildInstallCommand()', () => {
  it('pnpm → add', () => {
    expect(buildInstallCommand('pnpm', ['@ubean/ui'])).toEqual({
      cmd: 'pnpm',
      args: ['add', '@ubean/ui']
    });
  });

  it('yarn → add', () => {
    expect(buildInstallCommand('yarn', ['@ubean/ui'])).toEqual({
      cmd: 'yarn',
      args: ['add', '@ubean/ui']
    });
  });

  it('bun → add', () => {
    expect(buildInstallCommand('bun', ['@ubean/ui'])).toEqual({
      cmd: 'bun',
      args: ['add', '@ubean/ui']
    });
  });

  it('npm → install', () => {
    expect(buildInstallCommand('npm', ['@ubean/ui'])).toEqual({
      cmd: 'npm',
      args: ['install', '@ubean/ui']
    });
  });

  it('多包列表', () => {
    expect(buildInstallCommand('pnpm', ['@ubean/ui', '@ubean/auth'])).toEqual({
      cmd: 'pnpm',
      args: ['add', '@ubean/ui', '@ubean/auth']
    });
  });

  it('带版本范围', () => {
    expect(buildInstallCommand('pnpm', ['@ubean/ui@^0.1.3'])).toEqual({
      cmd: 'pnpm',
      args: ['add', '@ubean/ui@^0.1.3']
    });
  });

  it('空包列表', () => {
    expect(buildInstallCommand('pnpm', [])).toEqual({
      cmd: 'pnpm',
      args: ['add']
    });
  });
});

describe('extractPackageName()', () => {
  it('scoped 模块路径 → 取前两段', () => {
    expect(extractPackageName('@ubean/ui/vite')).toBe('@ubean/ui');
    expect(extractPackageName('@ubean/electron/vite')).toBe('@ubean/electron');
  });

  it('scoped 模块（无子路径）→ 原样返回', () => {
    expect(extractPackageName('@ubean/ui')).toBe('@ubean/ui');
  });

  it('非 scoped 模块路径 → 取第一段', () => {
    expect(extractPackageName('vue/runtime-dom')).toBe('vue');
    expect(extractPackageName('lodash/get')).toBe('lodash');
  });

  it('非 scoped 模块（无子路径）→ 原样返回', () => {
    expect(extractPackageName('vue')).toBe('vue');
  });
});

describe('getUbeanVersion()', () => {
  it('dependencies 中有 ubean → 返回版本', () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ dependencies: { ubean: '^0.1.3' } }));
    expect(getUbeanVersion(tmpDir)).toBe('0.1.3');
  });

  it('devDependencies 中有 ubean → 返回版本', () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ devDependencies: { ubean: '~0.2.0' } }));
    expect(getUbeanVersion(tmpDir)).toBe('0.2.0');
  });

  it('dependencies 优先于 devDependencies', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({
        dependencies: { ubean: '0.1.3' },
        devDependencies: { ubean: '0.0.1' }
      })
    );
    expect(getUbeanVersion(tmpDir)).toBe('0.1.3');
  });

  it('无 package.json → null', () => {
    expect(getUbeanVersion(tmpDir)).toBeNull();
  });

  it('package.json 无 ubean → null', () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ dependencies: { vue: '^3.0.0' } }));
    expect(getUbeanVersion(tmpDir)).toBeNull();
  });

  it('版本规格无数字 → null', () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ dependencies: { ubean: 'latest' } }));
    expect(getUbeanVersion(tmpDir)).toBeNull();
  });

  it('workspace 协议 → null（无数字版本）', () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ dependencies: { ubean: 'workspace:*' } }));
    expect(getUbeanVersion(tmpDir)).toBeNull();
  });

  it('损坏的 package.json → null（不抛错）', () => {
    writeFileSync(join(tmpDir, 'package.json'), '{ not valid json');
    expect(getUbeanVersion(tmpDir)).toBeNull();
  });
});
