import type { CapabilitySet, CapabilityInfo } from '../capabilities';

export interface Preset {
  name: string;
  entry?: string;
  export?: string;
  hooks?: Record<string, (...args: any[]) => any>;
  capabilities?: Partial<CapabilitySet>;
  capabilityInfo?: Partial<CapabilityInfo>;
  serve?: {
    host?: string;
    port?: number;
  };
  build?: {
    outputDir?: string;
    format?: 'esm' | 'cjs';
    externals?: string[];
    rollupConfig?: Record<string, unknown>;
  };
  runtime?: Record<string, unknown>;
  nitro?: Record<string, unknown>;
  commands?: {
    preview?: string;
    deploy?: string;
  };
}

const presets = new Map<string, Preset>();

export function definePreset(preset: Preset): Preset {
  presets.set(preset.name, preset);
  return preset;
}

export function resolvePreset(name: string): Preset | undefined {
  return presets.get(name);
}

export function getRegisteredPresets(): Preset[] {
  return [...presets.values()];
}

export function registerPreset(preset: Preset): void {
  presets.set(preset.name, preset);
}
