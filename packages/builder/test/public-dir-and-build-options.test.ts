import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadUbeanConfig } from '@ubean/config';
import { registerBuiltinPresets, resolvePresetByName } from '@ubean/preset';
import { createBuildContext, runEnvBuilds } from '../src/vite/build-app';

/** 只喂 `createBuildContext` 需要的四个字段，其余用解析后的默认配置补齐。 */
async function contextFor(overrides: {
  build?: Record<string, unknown>;
  dir?: Record<string, unknown>;
}): Promise<ReturnType<typeof createBuildContext>> {
  registerBuiltinPresets();
  const base = await loadUbeanConfig(process.cwd());
  const config = {
    ...base,
    build: { ...base.build, ...overrides.build },
    dir: { ...base.dir, ...overrides.dir }
  };
  return createBuildContext({
    cwd: process.cwd(),
    config,
    preset: resolvePresetByName(config.build.preset),
    scanResult: { pages: [], apiRoutes: [], middlewares: [], layouts: [], crons: [], pluginFiles: [] } as never
  });
}

describe('build.minify / build.sourcemap 从配置回落到构建上下文', () => {
  it('缺省时沿用默认值（minify=true, sourcemap=false）', async () => {
    const ctx = await contextFor({ build: { minify: true, sourcemap: false } });
    expect(ctx.minify).toBe(true);
    expect(ctx.sourcemap).toBe(false);
  });

  it('配置里显式写 minify: false / sourcemap: true 会被采纳', async () => {
    const ctx = await contextFor({ build: { minify: false, sourcemap: true } });
    expect(ctx.minify).toBe(false);
    expect(ctx.sourcemap).toBe(true);
  });

  it('显式传入的 options 优先于配置（CLI flag 的最高优先级由调用方保证）', async () => {
    registerBuiltinPresets();
    const base = await loadUbeanConfig(process.cwd());
    const config = { ...base, build: { ...base.build, minify: false, sourcemap: true } };
    const ctx = createBuildContext({
      cwd: process.cwd(),
      config,
      preset: resolvePresetByName(config.build.preset),
      scanResult: { pages: [], apiRoutes: [], middlewares: [], layouts: [], crons: [], pluginFiles: [] } as never,
      // CLI `--minify` / `--sourcemap`
      minify: true,
      sourcemap: false
    });
    expect(ctx.minify).toBe(true);
    expect(ctx.sourcemap).toBe(false);
  });
});

describe('dir.public 的可解析性', () => {
  it('默认值是 `public`，且允许改成别的目录名', async () => {
    const ctx = await contextFor({});
    expect(ctx.config.dir.public).toBe('public');

    const custom = await contextFor({ dir: { public: 'static' } });
    expect(custom.config.dir.public).toBe('static');
  });

  it('绝对路径也能原样保留（构建侧用 isAbsolute 判断是否拼 cwd）', async () => {
    const ctx = await contextFor({ dir: { public: '/tmp/some-public' } });
    expect(ctx.config.dir.public).toBe('/tmp/some-public');
  });

  /**
   * 真正的断言：`runEnvBuilds` 拷的是 `config.dir.public` 指向的目录。
   *
   * 修之前这里硬编码 `join(cwd, 'public')` —— 把 `dir.public` 改成 `static` 后构建仍然
   * 拷贝 `public/`，于是改配置的人拿到一份**错的**产物，且没有任何报错。
   * builder 与 plugin 都只是转发构建调用，用桩 builder 就能跑完整个 `runEnvBuilds`。
   */
  it('runEnvBuilds 按 config.dir.public 拷贝公共资源（而不是硬编码 public/）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ubean-dir-public-'));
    try {
      writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'dir-public', type: 'module' }));
      mkdirSync(join(root, 'public'), { recursive: true });
      writeFileSync(join(root, 'public', 'from-default.txt'), 'default-dir');
      mkdirSync(join(root, 'static'), { recursive: true });
      writeFileSync(join(root, 'static', 'from-custom.txt'), 'custom-dir');

      registerBuiltinPresets();
      const base = await loadUbeanConfig(root);
      const config = {
        ...base,
        mode: 'spa' as const,
        dir: { ...base.dir, public: 'static' },
        build: { ...base.build, outputDir: 'dist' }
      };
      const ctx = createBuildContext({
        cwd: root,
        config,
        preset: resolvePresetByName(config.build.preset),
        scanResult: {
          pages: [{ path: '/', file: 'src/pages/index.vue' }],
          apiRoutes: [],
          middlewares: [],
          layouts: [],
          crons: [],
          pluginFiles: []
        } as never
      });

      // builder 桩：不真的编译，只让 runEnvBuilds 走完拷贝与写清单的步骤
      const stubBuilder = {
        async build() {},
        environments: { client: {}, ubean: {} }
      };

      await runEnvBuilds(
        stubBuilder as never,
        {
          ...ctx,
          plugins: [],
          presetBuildConfig: { entryType: 'node' } as never,
          manifestRef: { current: null }
        } as never
      );

      const outPublic = join(root, 'dist', 'public');
      expect(existsSync(join(outPublic, 'from-custom.txt')), 'dir.public 指向的目录应被拷贝').toBe(true);
      expect(readFileSync(join(outPublic, 'from-custom.txt'), 'utf-8')).toBe('custom-dir');
      expect(existsSync(join(outPublic, 'from-default.txt')), '硬编码 public/ 的旧行为已移除').toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
