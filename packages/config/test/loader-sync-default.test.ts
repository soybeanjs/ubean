/**
 * `loadUbeanConfigSync()` 必须真正读到用户的配置文件（RM-V21 期间发现的缺陷）。
 *
 * 缺陷形态：jiti 对 `export default {...}` 的 .ts 配置仍可能返回模块命名空间（`{ default: cfg }`），
 * 于是 `config.content` / `i18n` 等全是 undefined，`resolveUbeanConfig` 回落到**全默认值**。
 * CLI 路径因为先异步加载并写入缓存（同步加载器第一段直接命中缓存）而掩盖了它 —— 只有
 * `vite dev` / `vite build`（插件自举、没有 CLI 预加载）会整份跑在默认配置上。
 * 实测症状：`vite build` 比 `ubean build` 少一个内容集合页与一个服务端 chunk。
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadUbeanConfigSync } from '../src/loader';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs.length = 0;
});

function projectWithConfig(configSource: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'ubean-config-sync-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'ubean.config.ts'), configSource);
  return dir;
}

describe('loadUbeanConfigSync 读取用户配置', () => {
  it('export default 的配置字段不会丢（含 content / i18n）', () => {
    // 不 import `ubean`：fixture 在 tmpdir 下解析不到包（RM-V14 记过的 fixture 陷阱），
    // 而本测试只关心「配置对象是否被读到」，普通 default 导出即可
    const dir = projectWithConfig(`
export default {
  srcDir: 'app',
  content: { sources: { blog: { dir: 'content/blog', prefix: '/blog' } } },
  i18n: { defaultLocale: 'zh', locales: [{ code: 'zh' }], strategy: 'prefix_except_default' }
};
`);
    const config = loadUbeanConfigSync(dir);

    // 以前这三个都回落成默认值：srcDir 解析成 `<dir>/src`、content=false、i18n 未配置。
    // 注意 `srcDir` 在解析后是**绝对路径**（loader 会 resolve(cwd, srcDir)）。
    expect(config.srcDir.endsWith('/app')).toBe(true);
    expect(config.content).toMatchObject({ sources: { blog: expect.anything() } });
    expect(config.i18n?.defaultLocale).toBe('zh');
  });

  // 注：`loadUbeanConfigSync` 会把结果写入模块级缓存（进程内单例），因此本文件只保留
  // 一个用例 —— 多例之间会互相读到对方的缓存，断言「回落默认值」会假失败（实测踩过）。
});
