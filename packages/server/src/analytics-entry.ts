/**
 * @ubean/server/analytics — 分析与实验聚合入口 (ADR-0003 OPT-06)
 *
 * 聚合 analytics (analytics.ts) + feature-flags (feature-flags.ts)。
 * 文件名带 `-entry` 后缀以避免与现有 `analytics.ts` 冲突；子路径 `./analytics` 在
 * `package.json` `exports` 中映射到此文件。
 *
 * 主入口 `@ubean/server` 仍 re-export 全部符号（便利入口）。
 */
export * from './analytics';
export type * from './analytics';
export * from './feature-flags';
export type * from './feature-flags';
