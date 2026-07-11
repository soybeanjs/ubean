import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { standardPreset } from './standard/preset';
import { nodePreset } from './node/preset';
import { cloudflarePreset } from './cloudflare/preset';
import type { Preset } from './_utils/preset';

export interface PresetDetectionHints {
  cwd?: string;
  explicitPreset?: string;
  environment?: Record<string, string | undefined>;
  globalThis?: Record<string, unknown>;
}

export interface PresetDetectionResult {
  preset: Preset;
  source: 'explicit' | 'config-file' | 'environment' | 'default';
  reason?: string;
}

function detectByConfigFiles(cwd: string): Preset | null {
  if (existsSync(join(cwd, 'wrangler.toml')) || existsSync(join(cwd, 'wrangler.json'))) {
    return cloudflarePreset;
  }

  if (existsSync(join(cwd, 'package.json'))) {
    try {
      const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      if ('wrangler' in deps || '@cloudflare/workers-types' in deps) {
        return cloudflarePreset;
      }
    } catch {
    }
  }

  return null;
}

function detectByEnvironment(env: Record<string, string | undefined>, g: Record<string, unknown>): Preset | null {
  if (env.CF_WORKERS || env.WRANGLER || env.CLOUDFLARE_WORKER) {
    return cloudflarePreset;
  }

  if (env.NODE_ENV === undefined && 'process' in g) {
    return nodePreset;
  }

  const gRecord = g as Record<string, unknown>;
  if (gRecord.CacheStorage !== undefined && gRecord.Deno === undefined && gRecord.process === undefined) {
    return cloudflarePreset;
  }

  if (gRecord.process !== undefined) {
    const processObj = gRecord.process as { versions?: { node?: string } };
    if (processObj.versions?.node) {
      return nodePreset;
    }
  }

  return null;
}

export function detectPreset(hints: PresetDetectionHints = {}): PresetDetectionResult {
  const cwd = hints.cwd || process.cwd();
  const env = hints.environment || (typeof process !== 'undefined' ? process.env : {});
  const g = hints.globalThis || (typeof globalThis !== 'undefined' ? globalThis as unknown as Record<string, unknown> : {});

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
    return {
      preset: configDetected,
      source: 'config-file',
      reason: configDetected.name === 'cloudflare'
        ? 'detected wrangler.toml or Cloudflare dependencies'
        : `detected ${configDetected.name} configuration`
    };
  }

  const envDetected = detectByEnvironment(env, g);
  if (envDetected) {
    return {
      preset: envDetected,
      source: 'environment',
      reason: `detected ${envDetected.name} runtime environment`
    };
  }

  return {
    preset: standardPreset,
    source: 'default',
    reason: 'no specific platform detected, using standard preset'
  };
}

function resolvePresetByNameSafe(name: string): Preset | null {
  const presetMap: Record<string, Preset> = {
    standard: standardPreset,
    node: nodePreset,
    cloudflare: cloudflarePreset
  };
  return presetMap[name] || null;
}

export function resolvePresetWithDetection(
  explicitPreset?: string,
  cwd?: string
): PresetDetectionResult {
  return detectPreset({ explicitPreset, cwd });
}

export function listDetectablePresets(): Preset[] {
  return [standardPreset, nodePreset, cloudflarePreset];
}
