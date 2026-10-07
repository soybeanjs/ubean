/**
 * TS-12 产物契约断言（作为 `testPreset()` 的 `additionalTests` 注入）。
 *
 * 这两条是**行为断言覆盖不到**的平台差异，只能在产物字节上观测。
 */
import { existsSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { entryPathFor, wrapperPathFor } from './harness';
import type { PresetContext } from './harness';

export function artifactContracts(ctx: PresetContext): void {
  it('⑩ 产物契约：平台包装入口与 server/entry.mjs 都存在', () => {
    expect(existsSync(wrapperPathFor(ctx)), `缺少包装入口 ${ctx.wrapper}`).toBe(true);
    expect(existsSync(entryPathFor(ctx)), '缺少 server/entry.mjs').toBe(true);
  });

  /**
   * 验收③的 cron 半条。
   *
   * **不能**用 `startCronScheduler` 当判据：`@ubean/server/cron` 不是 external，函数体会被
   * 打进每个 preset 的产物，文本恒在（实测 node 4 次 / cloudflare 1 次 / vercel 3 次命中）。
   * 真正的接线信号是 `cronModules` —— 只有开启进程内调度时才会 emit
   * `if (Object.keys(cronModules).length > 0) cronScheduler = startCronScheduler()` 和对应的
   * `import.meta.glob('./crons/**')`。实测 node/bun/deno/standard 有（4 次）、其余 5 个 0 次。
   *
   * workerd 单元格用 `skipIf` **显式跳过**（而不是静默 early-return）：worker 产物被整体压缩，
   * 实测即使把 `enableInProcessCron` 强制改成 true，`cronModules` 文本计数仍是 0（标识符被改写），
   * 该判据在 workerd 上永真。cloudflare 的 serverless 归属改由 ① 的「⑦ cacheStore 步骤缺席」守着。
   */
  it.skipIf(ctx.transport === 'workerd')('⑪ 进程内 cron 调度器接线（验收③）', () => {
    const entry = readFileSync(entryPathFor(ctx), 'utf8');
    if (ctx.inProcessCron) {
      expect(entry).toContain('cronModules');
    } else {
      expect(entry).not.toContain('cronModules');
    }
  });
}
