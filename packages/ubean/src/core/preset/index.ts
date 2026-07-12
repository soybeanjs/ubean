import { registerPreset, resolvePreset, getPresetAliases } from './_utils/preset';
import type { Preset, ResolvedPreset } from './_utils/preset';
import { cloudflarePreset, cloudflareDevPreset } from './cloudflare/preset';
import { nodePreset } from './node/preset';
import { standardPreset } from './standard/preset';

export * from './capabilities';
export { detectPreset, resolvePresetWithDetection, listDetectablePresets } from './_resolve';
export type { PresetDetectionHints, PresetDetectionResult } from './_resolve';

const builtinPresets: Preset[] = [standardPreset, nodePreset, cloudflarePreset, cloudflareDevPreset];

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
    serve: { host: 'localhost', port: 3000 },
    build: { outputDir: '.ubean/dist', format: 'esm', externals: [] },
    runtime: { entry: 'server' },
    capabilities: {},
    hooks: {},
    commands: {}
  } as ResolvedPreset;
}

export { standardPreset, nodePreset, cloudflarePreset, cloudflareDevPreset };
export type {
  Preset,
  ResolvedPreset,
  PresetMeta,
  PresetHooks,
  PresetBuildContext,
  PresetDevContext,
  PresetDefinition
} from './_utils/preset';
export { definePreset } from './_utils/preset';
export { generateWranglerConfig, serializeWranglerToml } from './cloudflare/preset';
export type { WranglerConfig } from './cloudflare/preset';
