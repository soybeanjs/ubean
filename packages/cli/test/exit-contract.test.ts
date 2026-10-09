/**
 * CLI 退出契约（Windows / Node 24 挂住回归网）。
 *
 * 背景（ci run 37954075109，windows-latest / Node 24）：`ubean build` 在配置模块**成功加载**后立刻
 * 报错，`process.exit(1)` 却没能让进程退出 —— 子进程既不退出也不崩溃，spawn 侧只能等满看门狗
 * （120s）才失败，日志里只有「Building ubean application... / Class constructor Foo cannot be
 * invoked without 'new'」。根因是 Windows 上 `process.exit()` 与仍在关闭中的 libuv 句柄竞态
 * （nodejs/node#56645 家族；#61999 只修了断言面）。修复见 `src/shared/exit.ts`。
 *
 * 本文件是**源码级**守卫：`process.exit()` 只在 `shared/exit.ts` 里允许出现一次（宽限期用尽后的
 * 兜底）。其他文件写死 `process.exit()` 会静默把挂住带回来 —— 单测在 macOS/Linux 上复现不了，
 * 只有 CI 的 windows/Node 24 会间歇变红，所以只能靠源码断言来挡。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const cliSrc = resolve(import.meta.dirname, '../src');
const EXIT_HELPER = join(cliSrc, 'shared/exit.ts');

/** 递归收集 src 下的 .ts 文件。 */
function collectSources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...collectSources(full));
      continue;
    }
    if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

/**
 * 去掉注释。源码里解释「为什么不要直接 process.exit」的注释本身包含 `process.exit()` 字样，
 * 把它们算进来会让守卫自我打脸。
 */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('CLI 退出契约（TS-10 挂住回归网）', () => {
  it('`process.exit()` 只允许出现在 shared/exit.ts（宽限期兜底）', () => {
    const offenders: string[] = [];
    for (const file of collectSources(cliSrc)) {
      if (file === EXIT_HELPER) continue;
      const code = stripComments(readFileSync(file, 'utf8'));
      const matches = code.match(/\bprocess\.exit\s*\(/g);
      if (matches) offenders.push(`${relative(cliSrc, file)}（${matches.length} 处）`);
    }
    expect(
      offenders,
      '这些文件直接调用了 process.exit()：Windows / Node 24 上会在 libuv 关闭竞态里挂住。\n' +
        '改用 src/shared/exit.ts 的 exitCli(code)，并让调用路径 `return`/`await` 它。'
    ).toEqual([]);
  });

  it('shared/exit.ts 只在宽限期用尽后兜底调用一次 process.exit()', () => {
    const code = stripComments(readFileSync(EXIT_HELPER, 'utf8'));
    const matches = code.match(/\bprocess\.exit\s*\(/g) ?? [];
    expect(matches.length, 'exit.ts 应当只有一处 process.exit()（兜底），退出码走 process.exitCode').toBe(1);
    // 先设 exitCode 再等宽限期：即使调用方 fire-and-forget，退出码也已是对的。
    expect(code).toContain('process.exitCode = code');
    expect(code.indexOf('process.exitCode = code')).toBeLessThan(code.indexOf('process.exit('));
    // 宽限期的定时器必须 unref，否则它自己会把进程钉活满 1.5s。
    // 源码里是 `timer.unref?.()`：可选调用，`?` 与 `.` 都要显式匹配。
    expect(code, '宽限期定时器必须 unref()，否则成功路径白白变慢').toMatch(/timer\.unref\?\.\(\)/);
  });
});
