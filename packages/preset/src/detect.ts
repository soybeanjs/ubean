import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bunPreset } from './bun';
import { cloudflarePreset, cloudflareDevPreset } from './cloudflare';
import { denoPreset } from './deno';
import { netlifyPreset } from './netlify';
import { nodePreset } from './node';
import { resolvePreset, getPresetAliases } from './registry';
import type { Preset, ResolvedPreset, PresetDefinition } from './registry';
import { standardPreset } from './standard';
import { vercelPreset, vercelEdgePreset } from './vercel';

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
  // Cloudflare
  if (existsSync(join(cwd, 'wrangler.toml')) || existsSync(join(cwd, 'wrangler.json'))) {
    return 'cloudflare';
  }

  // Vercel
  if (existsSync(join(cwd, 'vercel.json'))) {
    return 'vercel';
  }

  // Netlify
  if (existsSync(join(cwd, 'netlify.toml'))) {
    return 'netlify';
  }

  // Deno
  if (existsSync(join(cwd, 'deno.json')) || existsSync(join(cwd, 'deno.jsonc'))) {
    return 'deno';
  }

  if (existsSync(join(cwd, 'package.json'))) {
    try {
      const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      // Cloudflare
      if ('wrangler' in deps || '@cloudflare/workers-types' in deps) {
        return 'cloudflare';
      }
      // Vercel
      if ('vercel' in deps || '@vercel/node' in deps || '@vercel/edge' in deps) {
        return 'vercel';
      }
      // Netlify
      if ('netlify-cli' in deps || 'netlify-lambda' in deps) {
        return 'netlify';
      }
    } catch {}
  }

  return null;
}

function detectByEnvironment(env: Record<string, string | undefined>, g: Record<string, unknown>): string | null {
  const gRecord = g as Record<string, unknown>;

  // Cloudflare Workers
  if (env.CF_WORKERS || env.WRANGLER || env.CLOUDFLARE_WORKER) {
    return 'cloudflare';
  }

  // Vercel
  if (env.VERCEL || env.VERCEL_ENV || env.NOW_ID) {
    return 'vercel';
  }

  // Netlify
  if (env.NETLIFY || env.NETLIFY_DEV || env.NETLIFY_IMAGES_CDN_DOMAIN !== undefined) {
    return 'netlify';
  }

  // Deno (检测 globalThis.Deno)
  if (gRecord.Deno !== undefined) {
    return 'deno';
  }

  // Bun (检测 globalThis.Bun 或 process.versions.bun)
  if (gRecord.Bun !== undefined) {
    return 'bun';
  }
  if (gRecord.process !== undefined) {
    const processObj = gRecord.process as { versions?: { bun?: string; node?: string } };
    if (processObj.versions?.bun) {
      return 'bun';
    }
  }

  // Cloudflare (通过 CacheStorage 检测)
  if (gRecord.CacheStorage !== undefined && gRecord.Deno === undefined && gRecord.process === undefined) {
    return 'cloudflare';
  }

  // Node.js
  if (env.NODE_ENV === undefined && 'process' in g) {
    return 'node';
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
      const reasons: Record<string, string> = {
        cloudflare: 'detected wrangler.toml or Cloudflare dependencies',
        vercel: 'detected vercel.json or Vercel dependencies',
        netlify: 'detected netlify.toml or Netlify dependencies',
        deno: 'detected deno.json'
      };
      return {
        preset,
        source: 'config-file',
        reason: reasons[configDetected] || `detected ${configDetected} configuration`
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
    getPresetDef(cloudflareDevPreset),
    // P9-10: 新增平台预设
    getPresetDef(vercelPreset),
    getPresetDef(vercelEdgePreset),
    getPresetDef(netlifyPreset),
    getPresetDef(bunPreset),
    getPresetDef(denoPreset)
  ];
}
