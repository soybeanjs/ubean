import { bunPreset } from './bun';
import { cloudflarePreset, cloudflareDevPreset } from './cloudflare';
import { denoPreset } from './deno';
import { netlifyPreset } from './netlify';
import { nodePreset } from './node';
import { registerPreset, resolvePreset, getPresetAliases } from './registry';
import type { Preset, ResolvedPreset } from './registry';
import { standardPreset } from './standard';
import { vercelPreset, vercelEdgePreset } from './vercel';

export * from './capabilities';
export { detectPreset, resolvePresetWithDetection, listDetectablePresets } from './detect';
export type { PresetDetectionHints, PresetDetectionResult } from './detect';

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
  denoPreset
];

export function registerBuiltinPresets(): void {
  for (const preset of builtinPresets) {
    registerPreset(preset);
  }
}

registerBuiltinPresets();

export function resolvePresetByName(name: string): ResolvedPreset {
  const aliases = getPresetAliases();
  const resolvedName = aliases.get(name) || name;
  const preset = resolvePreset(resolvedName);
  if (preset) return preset;

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
