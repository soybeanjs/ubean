import { registerPreset, resolvePreset } from './_utils/preset';
import type { Preset } from './_utils/preset';
import { nodePreset } from './node/preset';
import { standardPreset } from './standard/preset';
import { cloudflarePreset } from './cloudflare/preset';
export * from './capabilities';
export { detectPreset, resolvePresetWithDetection, listDetectablePresets } from './_resolve';
export type { PresetDetectionHints, PresetDetectionResult } from './_resolve';

const builtinPresets: Preset[] = [standardPreset, nodePreset, cloudflarePreset];

export function registerBuiltinPresets(): void {
  for (const preset of builtinPresets) {
    registerPreset(preset);
  }
}

export function resolvePresetByName(name: string): Preset {
  const preset = resolvePreset(name);
  if (preset) return preset;

  for (const p of builtinPresets) {
    if (p.name === name) return p;
  }

  return standardPreset;
}

export { standardPreset, nodePreset, cloudflarePreset };
export type { Preset } from './_utils/preset';
export { generateWranglerConfig, serializeWranglerToml } from './cloudflare/preset';
export type { WranglerConfig } from './cloudflare/preset';
