/**
 * TS-12：preset 行为矩阵入口。
 *
 * 9 个 preset 各跑**同一套**行为断言族（`harness.ts` 的 `testPreset`），
 * 外加产物契约（`artifact-contracts.ts`）。平台差异在断言内用 `ctx` 分支表达，不整条 skip。
 *
 * 关于 deno：本机没装 deno **运行时**，但 deno preset 与 node/bun 共用
 * `getPresetBuildConfig()` 的 `entryType: 'node'` 分支（三个 case 逐字相同），产物是同一份
 * ESM bundle，因此仍在 Node 里进程内执行并断言。真正**缺席**的运行时是 workerd 之外的
 * 平台（vercel/netlify/aws/azure 只能进程内执行，见 harness 顶部的保真度说明）。
 */
import { artifactContracts } from './artifact-contracts';
import { getPresetHandler, PRESET_MATRIX, testPreset } from './harness';

for (const ctx of PRESET_MATRIX) {
  testPreset(ctx, getPresetHandler, artifactContracts);
}
