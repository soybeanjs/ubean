/**
 * TS-37：两套浏览器 harness 的边界守卫。
 *
 * 仓里有**两套**真实浏览器 harness，分工是刻意保留的（详见 `helpers/cli-harness.ts` 文件头）：
 * `packages/cli/test/*.test.ts`（裸 Playwright，能改源码 / 管子进程 / 看产物）与
 * `test/browser/**`（vitest browser mode，能跑 POM / `expect.poll` / flaky 门禁）。
 *
 * 判断错了不会报错，只会让某侧慢慢长出第二套重复实现 —— 这个文件把两条硬边界钉住：
 *
 * 1. **`test/browser/` 不得出现裸 Playwright 的进程/端口工具**。它由 `global-setup.ts`
 *    起一个长驻 dev server，spec 里再 spawn 一次就是把「服务来源」变成两个。
 * 2. **`packages/cli/test/` 不得出现自己的页面辅助（POM）**。页面断言归 L3 的
 *    `test/browser/pages/*.page.ts`；CLI 侧只保留「改源码 / HMR / 子进程 / 产物」这类
 *    L3 表达不了的语义。唯一例外是 `dev-dx.test.ts` 里对 `page.locator(...)` 的直接调用
 *    （它必须自己开页面，不可能复用 L3 的 `e2e.open`）。
 * 3. **共用工具只有一份**：端口 / 就绪探测 / 停进程只住在 `helpers/cli-harness.ts`，
 *    任何 `*.test.ts` 里再写 `createServer()`（`node:net`）就是回退。
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const cliTestDir = join(repoRoot, 'packages/cli/test');
const browserDir = join(repoRoot, 'test/browser');

function listFiles(dir: string, extensions: string[]): string[] {
  return readdirSync(dir).filter(name => extensions.some(ext => name.endsWith(ext)));
}

describe('两套浏览器 harness 的边界（TS-37）', () => {
  it('test/browser/ 不自己起进程 / 抢端口（服务来源只有 global-setup）', () => {
    const files = [
      ...listFiles(browserDir, ['.ts']).map(name => join(browserDir, name)),
      ...['specs', 'pages', 'lib'].flatMap(sub =>
        listFiles(join(browserDir, sub), ['.ts']).map(name => join(browserDir, sub, name))
      )
    ];
    // 反向自证：确认真的扫到了文件，否则「零违规」是空集合的假绿
    expect(files.length).toBeGreaterThan(15);

    const offenders = files.filter(file => {
      // `global-setup.ts` 正是**服务来源本身**（它 spawn 长驻 dev server），不在约束范围内
      if (file.endsWith('global-setup.ts')) return false;
      const content = readFileSync(file, 'utf8');
      return (
        /from 'node:child_process'/.test(content) || /from 'node:net'/.test(content) || /createServer\(/.test(content)
      );
    });
    expect(offenders, `这些文件不该自己起进程/抢端口：${offenders.join(', ')}`).toEqual([]);
  });

  it('packages/cli/test/ 的进程 / 端口工具只有 helpers/cli-harness.ts 一份实现', () => {
    // 本文件必须排除：它为了描述约束，字面上就含有那些模式（实测会自匹配）
    const testFiles = listFiles(cliTestDir, ['.test.ts']).filter(name => name !== 'harness-boundary.test.ts');
    expect(testFiles.length).toBeGreaterThan(20);

    // 1) 端口探测不再散落各处
    const portDupes = testFiles.filter(name =>
      /function (findFreePort|isPortFree)/.test(readFileSync(join(cliTestDir, name), 'utf8'))
    );
    expect(
      portDupes,
      `findFreePort/isPortFree 只应住在 helpers/cli-harness.ts，发现重复实现：${portDupes.join(', ')}`
    ).toEqual([]);

    // 2) node:net 不再被任何测试直接 import
    const netImporters = testFiles.filter(name => /from 'node:net'/.test(readFileSync(join(cliTestDir, name), 'utf8')));
    expect(netImporters, `node:net 只应住在 helpers/cli-harness.ts，发现：${netImporters.join(', ')}`).toEqual([]);
  });

  it('packages/cli/test/ 不新增页面辅助（POM 归 L3）', () => {
    // 本文件排除理由同上
    const testFiles = listFiles(cliTestDir, ['.test.ts']).filter(name => name !== 'harness-boundary.test.ts');
    // 例外：dev-dx 必须自己开页面做 HMR / 改源码，且无法复用 L3 的 e2e.open
    const allowed = new Set(['dev-dx.test.ts']);
    const pomLike = testFiles.filter(name => {
      if (allowed.has(name)) return false;
      return /extends BasePage|class \w+Page\b/.test(readFileSync(join(cliTestDir, name), 'utf8'));
    });
    expect(pomLike, `页面辅助应住在 test/browser/pages/，发现：${pomLike.join(', ')}`).toEqual([]);
  });

  it('harness 文件头记载了两套 harness 的职责边界（文档验收）', () => {
    const harness = readFileSync(join(cliTestDir, 'helpers/cli-harness.ts'), 'utf8');
    // 边界说明必须真实存在，而不是只在这条测试里被断言
    expect(harness).toContain('与 L3（`test/browser/`）的职责边界');
    expect(harness).toContain('裸 Playwright');
    expect(harness).toContain('vitest browser mode');
    expect(harness).toContain('无法安全改写宿主仓库源码再重启 dev server');
  });
});
