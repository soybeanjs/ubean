/**
 * `experimental.viteBuilder` 开关（RM-V07 引入，RM-V36 起**默认打开**）。
 *
 * 默认打开时插件注册 `client` / `ubean` 两个环境，产物目录沿用 `dist/public` + `dist/server`；
 * 显式 `false` 仍能回到旧编排（双轨共存期的逃生口，收敛完成后连同旧编排一起删除）。
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

describe('experimental.viteBuilder 开关（RM-V07 / RM-V36）', () => {
  it('默认打开（RM-V36）：不写配置即注册 client 与 ubean 两个环境', async () => {
    const { builder, config } = await createProject();

    expect(config.experimental).toEqual({ viteBuilder: true });
    expect(Object.keys(builder.environments).sort()).toEqual(['client', 'ubean']);
    expect(builder.environments.client.config.build.outDir).toContain('dist/public');
    expect(builder.environments.ubean.config.build.outDir).toContain('dist/server');
  }, 60_000);

  it('显式 false 时回到旧编排：只注册一个 client 环境', async () => {
    const { builder, config } = await createProject(false);

    expect(config.experimental).toEqual({ viteBuilder: false });
    // 不显式传 environments 时 Vite 只给一个 client 环境；旧路径因此完全不受影响
    expect(Object.keys(builder.environments)).toEqual(['client']);
  }, 60_000);

  it('显式 true 与默认行为一致', async () => {
    const { builder, config } = await createProject(true);

    expect(config.experimental).toEqual({ viteBuilder: true });
    expect(Object.keys(builder.environments).sort()).toEqual(['client', 'ubean']);
  }, 60_000);
});
