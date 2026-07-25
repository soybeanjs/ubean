import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cloudflarePreset, cloudflareDevPreset } from './cloudflare';
import { nodePreset } from './node';
import { resolvePreset, getPresetAliases } from './registry';
import type { Preset, ResolvedPreset, PresetDefinition } from './registry';
import { standardPreset } from './standard';

export interface PresetDetectionHints {
  cwd?: string;
  explicitPreset?: string;
  environment?: Record<string, string | undefined>;
  globalThis?: Record<string, unknown>;
}

export interface PresetDetectionResult {
  preset: ResolvedPreset;
  source: 'explicit' | 'config-file' | 'environment' | 'default';
  reason?: string;
}

function getPresetDef(preset: Preset): PresetDefinition {
  return typeof preset === 'function' ? preset() : preset;
}

function detectByConfigFiles(cwd: string): string | null {
  if (existsSync(join(cwd, 'wrangler.toml')) || existsSync(join(cwd, 'wrangler.json'))) {
    return 'cloudflare';
  }

  if (existsSync(join(cwd, 'package.json'))) {
    try {
      const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      if ('wrangler' in deps || '@cloudflare/workers-types' in deps) {
        return 'cloudflare';
      }
    } catch {}
  }

  return null;
}

function detectByEnvironment(env: Record<string, string | undefined>, g: Record<string, unknown>): string | null {
  if (env.CF_WORKERS || env.WRANGLER || env.CLOUDFLARE_WORKER) {
    return 'cloudflare';
  }

  if (env.NODE_ENV === undefined && 'process' in g) {
    return 'node';
  }

  const gRecord = g as Record<string, unknown>;
  if (gRecord.CacheStorage !== undefined && gRecord.Deno === undefined && gRecord.process === undefined) {
    return 'cloudflare';
  }

  if (gRecord.process !== undefined) {
    const processObj = gRecord.process as { versions?: { node?: string } };
    if (processObj.versions?.node) {
      return 'node';
    }
  }

  return null;
}

function resolvePresetByNameSafe(name: string): ResolvedPreset | null {
  const aliases = getPresetAliases();
  const resolvedName = aliases.get(name) || name;
  const preset = resolvePreset(resolvedName);
  return preset || null;
}

export function detectPreset(hints: PresetDetectionHints = {}): PresetDetectionResult {
  const cwd = hints.cwd || process.cwd();
  const env = hints.environment || (typeof process !== 'undefined' ? process.env : {});
  const g =
    hints.globalThis || (typeof globalThis !== 'undefined' ? (globalThis as unknown as Record<string, unknown>) : {});

  if (hints.explicitPreset) {
    const explicit = resolvePresetByNameSafe(hints.explicitPreset);
    if (explicit) {
      return {
        preset: explicit,
        source: 'explicit',
        reason: `explicitly set to "${hints.explicitPreset}"`
      };
    }
  }

  const configDetected = detectByConfigFiles(cwd);
  if (configDetected) {
    const preset = resolvePresetByNameSafe(configDetected);
    if (preset) {
      return {
        preset,
        source: 'config-file',
        reason:
          configDetected === 'cloudflare'
            ? 'detected wrangler.toml or Cloudflare dependencies'
            : `detected ${configDetected} configuration`
      };
    }
  }

  const envDetected = detectByEnvironment(env, g);
  if (envDetected) {
    const preset = resolvePresetByNameSafe(envDetected);
    if (preset) {
      return {
        preset,
        source: 'environment',
        reason: `detected ${envDetected} runtime environment`
      };
    }
  }

  const defaultPreset = resolvePresetByNameSafe('standard')!;
  return {
    preset: defaultPreset,
    source: 'default',
    reason: 'no specific platform detected, using standard preset'
  };
}

export function resolvePresetWithDetection(explicitPreset?: string, cwd?: string): PresetDetectionResult {
  return detectPreset({ explicitPreset, cwd });
}

export function listDetectablePresets(): PresetDefinition[] {
  return [
    getPresetDef(standardPreset),
    getPresetDef(nodePreset),
    getPresetDef(cloudflarePreset),
    getPresetDef(cloudflareDevPreset)
  ];
}
