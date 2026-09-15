/**
 * `experimental.viteBuilder` 灰度开关（RM-V07，docs/vite-plugin-migration.md Phase 1 第一步）。
 *
 * 开关关闭（默认）时插件不得注册任何额外环境 —— 旧路径（CLI 自建编排 + 两次 `viteBuild`）
 * 必须逐字节保持现状；打开时以插件身份注册 `client` / `ubean` 两个环境，且产物目录沿用
 * `dist/public` + `dist/server`（RM-V36 收敛前不得更换）。
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBuilder } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import { loadUbeanConfig } from '@ubean/config';
import { ubeanPlugin } from '../src/vite';

let roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots = [];
});

async function createProject(viteBuilder?: boolean) {
  const root = mkdtempSync(join(tmpdir(), 'ubean-vite-builder-switch-'));
  roots.push(root);
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'switch-fixture', type: 'module' }));
  writeFileSync(join(root, 'index.html'), '<div id="app"></div>');
  writeFileSync(
    join(root, 'ubean.config.ts'),
    `export default {${viteBuilder === undefined ? '' : ` experimental: { viteBuilder: ${viteBuilder} },`}};\n`
  );

  const config = await loadUbeanConfig(root);
  const builder = await createBuilder({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [ubeanPlugin({ config })]
  });
  return { builder, config };
}

describe('experimental.viteBuilder 灰度开关（RM-V07）', () => {
  it('默认关闭：配置归一化为 false，插件不注册额外环境', async () => {
    const { builder, config } = await createProject();

    expect(config.experimental).toEqual({ viteBuilder: false });
    // 不显式传 environments 时 Vite 只给一个 client 环境；旧路径因此完全不受影响
    expect(Object.keys(builder.environments)).toEqual(['client']);
  }, 60_000);

  it('打开时注册 client 与 ubean 环境，产物目录保持 dist/public + dist/server', async () => {
    const { builder, config } = await createProject(true);

    expect(config.experimental.viteBuilder).toBe(true);
    expect(Object.keys(builder.environments).sort()).toEqual(['client', 'ubean']);
    expect(builder.environments.client.config.build.outDir).toContain('dist/public');
    expect(builder.environments.ubean.config.build.outDir).toContain('dist/server');
  }, 60_000);
});
