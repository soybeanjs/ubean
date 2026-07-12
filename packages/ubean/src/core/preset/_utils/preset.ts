import type { CapabilitySet, CapabilityInfo } from '../capabilities';

export type PresetHooks = {
  'build:before'?: (ctx: PresetBuildContext) => void | Promise<void>;
  'build:after'?: (ctx: PresetBuildContext) => void | Promise<void>;
  compiled?: (ctx: PresetBuildContext) => void | Promise<void>;
  'dev:setup'?: (ctx: PresetDevContext) => void | Promise<void>;
};

export interface PresetBuildContext {
  cwd: string;
  outputDir: string;
  preset: ResolvedPreset;
  config: Record<string, unknown>;
}

export interface PresetDevContext {
  cwd: string;
  preset: ResolvedPreset;
  config: Record<string, unknown>;
}

export interface PresetOutputConfig {
  dir?: string;
  serverDir?: string;
  publicDir?: string;
}

export interface PresetRollupConfig {
  plugins?: unknown[];
  output?: Record<string, unknown>;
  external?: string[];
}

export interface PresetMeta {
  name: string;
  aliases?: string[];
  stdName?: string;
  static?: boolean;
  dev?: boolean;
  compatibilityDate?: string;
  url?: string;
}

export interface PresetRuntimeConfig {
  entry?: string;
  handler?: string;
  compatibilityDate?: string;
  compatibilityFlags?: string[];
  [key: string]: unknown;
}

export interface PresetDefinition {
  name?: string;
  extends?: string;
  entry?: string;
  exportConditions?: string[];
  serve?: {
    host?: string;
    port?: number;
  };
  build?: {
    outputDir?: string;
    format?: 'esm' | 'cjs';
    externals?: string[];
    minify?: boolean;
    rollupConfig?: PresetRollupConfig;
  };
  output?: PresetOutputConfig;
  runtime?: PresetRuntimeConfig;
  devServer?: {
    runner?: string;
  };
  capabilities?: Partial<CapabilitySet>;
  capabilityInfo?: Partial<CapabilityInfo>;
  hooks?: PresetHooks;
  alias?: Record<string, string>;
  wasm?: {
    lazy?: boolean;
    esmImport?: boolean;
  };
  unenv?: unknown[];
  commands?: {
    preview?: string;
    deploy?: string;
  };
  nitro?: Record<string, unknown>;
}

export type Preset = PresetDefinition | (() => PresetDefinition);

export interface ResolvedPreset extends PresetDefinition {
  name: string;
  _meta: PresetMeta;
}

const presets = new Map<string, PresetDefinition & { _meta: PresetMeta }>();
const presetNames = new Map<string, string>();

export function definePreset<P extends PresetDefinition>(
  preset: P,
  meta?: PresetMeta
): P & { _meta: PresetMeta; name: string } {
  const name = meta?.name || preset.name || 'unknown';
  const finalMeta: PresetMeta = {
    name,
    aliases: [],
    static: false,
    dev: false,
    ...meta
  };

  const presetWithMeta = { ...preset, name, _meta: finalMeta };
  presets.set(name, presetWithMeta);
  presetNames.set(name, name);

  if (finalMeta.aliases) {
    for (const alias of finalMeta.aliases) {
      presetNames.set(alias, name);
    }
  }

  return presetWithMeta as P & { _meta: PresetMeta; name: string };
}

function resolvePresetDefinition(preset: Preset): PresetDefinition {
  return typeof preset === 'function' ? preset() : preset;
}

export function resolvePreset(name: string): ResolvedPreset | undefined {
  const resolvedName = presetNames.get(name);
  if (!resolvedName) return undefined;

  const preset = presets.get(resolvedName);
  if (!preset) return undefined;

  return resolvePresetWithInheritance(resolvedName, new Set());
}

function resolvePresetWithInheritance(name: string, visited: Set<string>): ResolvedPreset | undefined {
  if (visited.has(name)) {
    throw new Error(`Circular preset inheritance detected: ${[...visited, name].join(' -> ')}`);
  }
  visited.add(name);

  const preset = presets.get(name);
  if (!preset) return undefined;

  let base: PresetDefinition = { name };

  if (preset.extends) {
    const parent = resolvePresetWithInheritance(preset.extends, visited);
    if (parent) {
      base = mergePreset(parent, {}) as PresetDefinition;
    }
  }

  const resolved = mergePreset(base, preset) as ResolvedPreset;
  resolved.name = name;
  resolved._meta = preset._meta;

  return resolved;
}

function mergePreset(base: PresetDefinition | ResolvedPreset, override: PresetDefinition): PresetDefinition {
  return {
    name: override.name ?? base.name,
    extends: override.extends ?? base.extends,
    entry: override.entry ?? base.entry,
    exportConditions: override.exportConditions ?? (base as PresetDefinition).exportConditions,
    serve: { ...base.serve, ...override.serve },
    build: { ...base.build, ...override.build },
    output: { ...base.output, ...override.output },
    runtime: { ...base.runtime, ...override.runtime } as PresetRuntimeConfig,
    devServer: { ...(base as PresetDefinition).devServer, ...override.devServer },
    capabilities: { ...base.capabilities, ...override.capabilities },
    capabilityInfo: { ...base.capabilityInfo, ...override.capabilityInfo },
    hooks: { ...base.hooks, ...override.hooks },
    alias: { ...(base as PresetDefinition).alias, ...override.alias },
    wasm: { ...(base as PresetDefinition).wasm, ...override.wasm },
    unenv: [...((base as PresetDefinition).unenv || []), ...(override.unenv || [])],
    commands: { ...base.commands, ...override.commands },
    nitro: { ...(base as PresetDefinition).nitro, ...override.nitro }
  };
}

export function getRegisteredPresets(): Array<PresetDefinition & { _meta: PresetMeta }> {
  return [...presets.values()];
}

export function registerPreset(preset: Preset, meta?: PresetMeta): void {
  const def = resolvePresetDefinition(preset);
  definePreset(def, meta);
}

export function getPresetNames(): string[] {
  return [...presets.keys()];
}

export function getPresetAliases(): Map<string, string> {
  return new Map(presetNames);
}
