/**
 * 配置加载的两条路径：`loadUbeanConfigSync`（同步）与 `ensureUbeanConfig`（缓存优先的异步）。
 *
 * **背景**：`ubeanPlugin()`（`ubean/vite`）曾经必须**同步**拿到配置（工厂期就要决定注册哪些插件），
 * 而同步加载器把配置编译成 CJS —— `ubean.config.ts` 里的顶层 await 在那里是语法错误。于是同一份
 * 配置在 `ubean dev` 下正常、在 `vp dev` 下崩在 `vite.config.ts` 求值阶段，抛的还是 `node:vm`
 * 内部的 SyntaxError。
 *
 * **现在**：`ubeanPlugin()` 是 async 的，配置在工厂内 `await ensureUbeanConfig()`（Vite 的
 * `PluginOption` 是 `Thenable<…>`，插件数组里的 Promise 会在跑任何钩子之前被 await），两条路径
 * 都用同一条异步加载，顶层 await 不再有限制。真正守住这条不变量的端到端用例在 `packages/cli`
 * （`dev-reload` / `vite-build` / `preview-vite` 都用真实子进程跑裸 `vp` 命令 + 示例项目的 TLA 配置）。
 *
 * 这个文件守的是**加载器自身的语义**，尤其是 `ensureUbeanConfig` 的缓存优先 —— 插件工厂现在依赖
 * 它，一旦变成"重新加载"，CLI 对 resolved 配置的原地修改（`--mode` / `--ssr` / `--verbose`）就会被
 * 静默丢弃。
 *
 * 注意：缓存是**进程内单例**（loader 的模块级变量），所以每个用例都取一份干净模块实例，
 * 否则前一个用例的缓存会让后一个用例的断言假通过（`loader-sync-default.test.ts` 结尾记过这个坑）。
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs.length = 0;
});

/**
 * 写一个含顶层 await 的项目配置。
 *
 * 不 import `ubean`：fixture 在 tmpdir 下解析不到包（RM-V14 记过的 fixture 陷阱），
 * 本测试只关心「配置如何被加载」，普通 default 导出即可。
 */
function projectWithTlaConfig(marker: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'ubean-config-tla-'));
  dirs.push(dir);
  writeFileSync(
    join(dir, 'ubean.config.ts'),
    [
      'async function getPrerender() {',
      `  return ['${marker}'];`,
      '}',
      '',
      'const prerender = await getPrerender();',
      '',
      'export default { prerender: { include: prerender } };'
    ].join('\n')
  );
  return dir;
}

/** loader 的配置是模块级单例，每个用例都要一份没被污染的模块实例。 */
async function freshLoader() {
  vi.resetModules();
  return import('../src/loader');
}

describe('loadUbeanConfigSync：同步加载器无法解析顶层 await', () => {
  it('抛出可操作的错误，而不是 jiti / node:vm 的 SyntaxError', async () => {
    const { loadUbeanConfigSync } = await freshLoader();
    const dir = projectWithTlaConfig('/about');

    expect(() => loadUbeanConfigSync(dir)).toThrowError(/top-level await/i);

    let message = '';
    try {
      loadUbeanConfigSync(dir);
    } catch (error) {
      message = (error as Error).message;
    }

    // 错误本身要指出怎么办（改用异步加载器），并带上配置路径
    expect(message).toContain('loadUbeanConfig');
    expect(message).toContain('ensureUbeanConfig');
    expect(message).toContain(join(dir, 'ubean.config.ts'));
    // 而不是把 vm 求值栈当消息抛给用户
    expect(message).not.toMatch(/runInThisContext|jitiRequire/);
  });

  it('非顶层 await 的错误原样抛出（不被转换掩盖）', async () => {
    const { loadUbeanConfigSync } = await freshLoader();
    const dir = mkdtempSync(join(tmpdir(), 'ubean-config-broken-'));
    dirs.push(dir);
    writeFileSync(join(dir, 'ubean.config.ts'), 'export default { routeRules: { : } };\n');

    expect(() => loadUbeanConfigSync(dir)).toThrowError();
    // 语法错误不该被误判成顶层 await 问题
    expect(() => loadUbeanConfigSync(dir)).not.toThrowError(/top-level await/i);
  });
});

describe('ensureUbeanConfig：插件工厂用的异步入口', () => {
  it('顶层 await 的配置能解析，且随后的同步加载器命中缓存', async () => {
    const { ensureUbeanConfig, loadUbeanConfigSync } = await freshLoader();
    const dir = projectWithTlaConfig('/about');

    const config = await ensureUbeanConfig(dir);
    expect(config.prerender.include).toEqual(['/about']);

    // 缓存已热，同步加载器不再需要（也不会）调用 jiti
    expect(() => loadUbeanConfigSync(dir)).not.toThrow();
    expect(loadUbeanConfigSync(dir).prerender.include).toEqual(['/about']);
  });

  it('缓存优先：不重新加载，也不覆盖 CLI 对 resolved 配置的原地修改', async () => {
    const { ensureUbeanConfig, loadUbeanConfig } = await freshLoader();
    const first = projectWithTlaConfig('/from-first');
    const second = projectWithTlaConfig('/from-second');

    const loaded = await loadUbeanConfig(first);
    // CLI 在加载后原地改配置（`--mode` / `--ssr` / `--verbose` 都这么做）——
    // 若 ensureUbeanConfig 重新加载，这些覆盖会被丢弃
    loaded.mode = 'ssg';

    const again = await ensureUbeanConfig(second);

    expect(again).toBe(loaded);
    expect(again.mode).toBe('ssg');
    expect(again.prerender.include).toEqual(['/from-first']);
  });
});
