/**
 * Vite 环境注册（RM-V07 引入、RM-V36 收敛后为唯一形态）。
 *
 * 插件以 `consumer: 'client'` / `consumer: 'server'` 注册 `client` / `ubean` 两个环境，产物目录
 * 沿用 `dist/public` + `dist/server` —— 这两条是「`vite dev|build|preview` 单独可用」的前提：
 * 少了 ubean 环境就没有服务端产物，产物目录换了则所有部署脚本与文档失效。
 *
 * 收敛前这里还测过 `experimental.viteBuilder` 的开关两态；开关已随旧编排删除，因此现在只有
 * 「注册了这两个环境」这一种期望。
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

async function createProject() {
  const root = mkdtempSync(join(tmpdir(), 'ubean-vite-environments-'));
  roots.push(root);
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'env-fixture', type: 'module' }));
  writeFileSync(join(root, 'index.html'), '<div id="app"></div>');
  writeFileSync(join(root, 'ubean.config.ts'), 'export default {};\n');

  const config = await loadUbeanConfig(root);
  const builder = await createBuilder({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [ubeanPlugin({ config })]
  });
  return { builder, config };
}

describe('Vite 环境注册（RM-V36 收敛后）', () => {
  it('插件注册 client 与 ubean 两个环境，产物目录保持 dist/public + dist/server', async () => {
    const { builder } = await createProject();

    expect(Object.keys(builder.environments).sort()).toEqual(['client', 'ubean']);
    expect(builder.environments.client.config.build.outDir).toContain('dist/public');
    expect(builder.environments.ubean.config.build.outDir).toContain('dist/server');
  }, 60_000);

  it('调用方声明「构建由我驱动」时插件不注册环境（避免同一份构建被编排两次）', async () => {
    const previous = process.env.UBEAN_BUILD_DRIVEN_BY_CLI;
    process.env.UBEAN_BUILD_DRIVEN_BY_CLI = '1';
    try {
      const { builder } = await createProject();
      expect(Object.keys(builder.environments)).toEqual(['client']);
    } finally {
      if (previous === undefined) delete process.env.UBEAN_BUILD_DRIVEN_BY_CLI;
      else process.env.UBEAN_BUILD_DRIVEN_BY_CLI = previous;
    }
  }, 60_000);
});
