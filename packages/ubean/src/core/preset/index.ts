import { registerPreset, resolvePreset } from './_utils/preset';
import type { Preset } from './_utils/preset';
import { nodePreset } from './node/preset';
import { standardPreset } from './standard/preset';
export * from './capabilities';

const builtinPresets: Preset[] = [standardPreset, nodePreset];

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

export { standardPreset, nodePreset };
export type { Preset } from './_utils/preset';
