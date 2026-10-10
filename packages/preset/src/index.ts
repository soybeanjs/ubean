import { awsPreset } from './aws';
import { azurePreset } from './azure';
import { bunPreset } from './bun';
import { cloudflarePreset, cloudflareDevPreset } from './cloudflare';
import { denoPreset } from './deno';
import { netlifyPreset } from './netlify';
import { nodePreset } from './node';
import { registerPreset, resolvePreset, getPresetAliases, getPresetNames } from './registry';
import type { Preset, ResolvedPreset } from './registry';
import { standardPreset } from './standard';
import { vercelPreset, vercelEdgePreset } from './vercel';

export * from './capabilities';
export { detectPreset, resolvePresetWithDetection, listDetectablePresets } from './detect';
export type { PresetDetectionHints, PresetDetectionResult } from './detect';
export { resolveProductionCacheStore, isEphemeralCachePreset } from './cache-default';
export type { CacheStoreKind, CacheStoreConfig, ResolvedCacheStoreConfig } from './cache-default';

const builtinPresets: Preset[] = [
  standardPreset,
  nodePreset,
  cloudflarePreset,
  cloudflareDevPreset,
  // P9-10: 平台预设补全
  vercelPreset,
  vercelEdgePreset,
  netlifyPreset,
  bunPreset,
  denoPreset,
  // Task 16: AWS/Azure 平台预设
  awsPreset,
  azurePreset
];

export function registerBuiltinPresets(): void {
  for (const preset of builtinPresets) {
    registerPreset(preset);
  }
}

registerBuiltinPresets();

/**
 * 按名称/别名解析预设，未命中时回退到 `standard`。
 *
 * 回退本身是刻意的（`standard` 在任意运行时都可用，避免配置里一个 typo 直接炸构建），
 * 但**静默**回退会让 `preset: 'vercle'` 表现为「一切正常」—— 产物按 Node 预设产出，
 * 直到部署到目标平台才失败。因此回退路径打印一次 `console.warn`。
 *
 * 用 `console.warn` 而非 `@ubean/shared/logger`：本包是零 workspace 依赖的叶子包
 * （见 package.json），同 `@ubean/vue` / `@ubean/content` 的既有做法。
 */
export function resolvePresetByName(name: string): ResolvedPreset {
  const aliases = getPresetAliases();
  const resolvedName = aliases.get(name) || name;
  const preset = resolvePreset(resolvedName);
  if (preset) return preset;

  const known = getPresetNames().join(', ');
  console.warn(`[ubean/preset] Unknown preset "${name}", falling back to "standard". Known presets: ${known}.`);

  const standardResolved = resolvePreset('standard');
  if (standardResolved) return standardResolved;

  return {
    name: 'standard',
    _meta: { name: 'standard' },
    serve: { host: 'localhost', port: 9527 },
    build: { outputDir: 'dist', format: 'esm', externals: [] },
    runtime: { entry: 'server' },
    capabilities: {},
    hooks: {},
    commands: {}
  } as ResolvedPreset;
}

export { standardPreset, nodePreset, cloudflarePreset, cloudflareDevPreset };
export { vercelPreset, vercelEdgePreset };
export { netlifyPreset };
export { bunPreset };
export { denoPreset };
export { awsPreset };
export { azurePreset };
export { generateWranglerConfig, serializeWranglerToml } from './cloudflare';
export type { WranglerConfig } from './cloudflare';
export { generateVercelConfig, serializeVercelConfig } from './vercel';
export type { VercelConfig } from './vercel';
export { generateNetlifyConfig, serializeNetlifyConfig } from './netlify';
export type { NetlifyConfig } from './netlify';
export { generateBunfigConfig, serializeBunfigConfig } from './bun';
export type { BunfigConfig } from './bun';
export { generateDenoConfig, serializeDenoConfig } from './deno';
export type { DenoConfig } from './deno';
export { generateAwsSamConfig, serializeAwsSamConfig } from './aws';
export type { AwsSamTemplate, AwsSamResource } from './aws';
export { generateStaticWebAppConfig, serializeStaticWebAppConfig } from './azure';
export type { StaticWebAppConfig } from './azure';
export type {
  Preset,
  ResolvedPreset,
  PresetMeta,
  PresetHooks,
  PresetBuildContext,
  PresetDevContext,
  PresetDefinition
} from './registry';
export {
  definePreset,
  registerPreset,
  resolvePreset,
  getRegisteredPresets,
  getPresetNames,
  getPresetAliases
} from './registry';
