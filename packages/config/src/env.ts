/**
 * `env` 配置的解析层。
 *
 * 与 `routing` / `i18n` / `prerender` 同一模式：`defu` 只做浅合并，派生字段必须自己重算，
 * 否则用户写 `env: undefined` 时 `ResolvedConfig.env` 会是 `undefined` 而不是空对象。
 *
 * 这里**只做归一化，不碰取值**。取值（读 `process.env` vs `import.meta.env`）与校验发生在
 * 构建期（`packages/builder/src/env/`），因为两侧的来源不同：
 * - 服务端运行时：`process.env`（或平台 binding）
 * - 客户端构建期：Vite 已静态替换的 `import.meta.env`
 *
 * 另注：`loadUbeanConfigSync` 会把用户配置编译成 CJS 后求值，**顶层 await 在配置里不可用**
 * （见 `packages/ubean/src/vite.ts` 的说明）—— `env.schema` 里的 `envField.*()` 是纯同步
 * 调用，不受这个限制。
 */

import type { EnvConfig, ResolvedEnvConfig } from './types';

export const envConfigDefaults: ResolvedEnvConfig = { schema: {} };

export type { ResolvedEnvConfig };

export function resolveEnvConfig(config?: EnvConfig): ResolvedEnvConfig {
  if (!config) return { ...envConfigDefaults };

  const flat = { ...(config.public ?? {}), ...(config.server ?? {}), ...(config.schema ?? {}) };
  return { schema: flat, mode: config.mode };
}
