/**
 * P9-10 平台预设补全 —— 单元测试
 *
 * 覆盖:
 * - Vercel / Vercel Edge preset 配置与能力矩阵
 * - Netlify preset 配置与能力矩阵
 * - Bun preset 配置与能力矩阵
 * - Deno preset 配置与能力矩阵
 * - 配置文件生成与序列化
 * - preset 继承 (extends) 链
 * - 自动检测 (config-file / environment)
 * - 注册表与别名解析
 */
import { describe, it, expect } from 'vitest';
import {
  vercelPreset,
  vercelEdgePreset,
  netlifyPreset,
  bunPreset,
  denoPreset,
  resolvePresetByName,
  resolvePreset,
  detectPreset,
  listDetectablePresets,
  getRegisteredPresets,
  getPresetAliases,
  generateVercelConfig,
  serializeVercelConfig,
  generateNetlifyConfig,
  serializeNetlifyConfig,
  generateBunfigConfig,
  serializeBunfigConfig,
  generateDenoConfig,
  serializeDenoConfig
} from '../src';

/* -------------------------------------------------------------------------- */
/* Vercel preset                                                              */
/* -------------------------------------------------------------------------- */

describe('vercelPreset', () => {
  it('has correct name', () => {
    expect(vercelPreset.name).toBe('vercel');
  });

  it('extends node preset', () => {
    expect(vercelPreset.extends).toBe('node');
  });

  it('has correct aliases', () => {
    expect(vercelPreset._meta.aliases).toContain('vercel-serverless');
    expect(vercelPreset._meta.aliases).toContain('vercel-node');
  });

  it('has serverless capabilities (no websocket)', () => {
    expect(vercelPreset.capabilities?.websocket).toBe(false);
    expect(vercelPreset.capabilities?.nodeCompat).toBe(true);
    expect(vercelPreset.capabilities?.streaming).toBe(true);
  });

  it('has vercel dev/deploy commands', () => {
    expect(vercelPreset.commands?.preview).toContain('vercel');
    expect(vercelPreset.commands?.deploy).toContain('vercel');
  });

  it('resolves by name and aliases', () => {
    expect(resolvePresetByName('vercel').name).toBe('vercel');
    expect(resolvePresetByName('vercel-serverless').name).toBe('vercel');
  });
});

describe('vercelEdgePreset', () => {
  it('has correct name', () => {
    expect(vercelEdgePreset.name).toBe('vercel-edge');
  });

  it('extends standard preset (not node)', () => {
    expect(vercelEdgePreset.extends).toBe('standard');
  });

  it('has edge capabilities (no nodeCompat)', () => {
    expect(vercelEdgePreset.capabilities?.nodeCompat).toBe(false);
    expect(vercelEdgePreset.capabilities?.streaming).toBe(true);
  });

  it('resolves by name', () => {
    expect(resolvePresetByName('vercel-edge').name).toBe('vercel-edge');
  });
});

/* -------------------------------------------------------------------------- */
/* Netlify preset                                                             */
/* -------------------------------------------------------------------------- */

describe('netlifyPreset', () => {
  it('has correct name', () => {
    expect(netlifyPreset.name).toBe('netlify');
  });

  it('extends node preset', () => {
    expect(netlifyPreset.extends).toBe('node');
  });

  it('has correct aliases', () => {
    expect(netlifyPreset._meta.aliases).toContain('netlify-functions');
  });

  it('has serverless capabilities (no websocket)', () => {
    expect(netlifyPreset.capabilities?.websocket).toBe(false);
    expect(netlifyPreset.capabilities?.cronTriggers).toBe(true);
  });

  it('has netlify dev/deploy commands', () => {
    expect(netlifyPreset.commands?.preview).toContain('netlify');
    expect(netlifyPreset.commands?.deploy).toContain('netlify');
  });

  it('uses port 8888 (Netlify default)', () => {
    expect(netlifyPreset.serve?.port).toBe(8888);
  });

  it('resolves by name and aliases', () => {
    expect(resolvePresetByName('netlify').name).toBe('netlify');
    expect(resolvePresetByName('netlify-functions').name).toBe('netlify');
  });
});

/* -------------------------------------------------------------------------- */
/* Bun preset                                                                 */
/* -------------------------------------------------------------------------- */

describe('bunPreset', () => {
  it('has correct name', () => {
    expect(bunPreset.name).toBe('bun');
  });

  it('extends node preset', () => {
    expect(bunPreset.extends).toBe('node');
  });

  it('has bun-specific capabilities (websocket, no kv)', () => {
    expect(bunPreset.capabilities?.websocket).toBe(true);
    expect(bunPreset.capabilities?.kv).toBe(false);
    expect(bunPreset.capabilities?.database).toBe(true);
    expect(bunPreset.capabilities?.nodeCompat).toBe(true);
  });

  it('has bun run commands', () => {
    expect(bunPreset.commands?.preview).toContain('bun run');
    expect(bunPreset.commands?.deploy).toContain('bun run');
  });

  it('includes bun:sqlite in externals', () => {
    expect(bunPreset.build?.externals).toContain('bun:sqlite');
  });

  it('resolves by name and aliases', () => {
    expect(resolvePresetByName('bun').name).toBe('bun');
    expect(resolvePresetByName('bun-runtime').name).toBe('bun');
  });
});

/* -------------------------------------------------------------------------- */
/* Deno preset                                                                */
/* -------------------------------------------------------------------------- */

describe('denoPreset', () => {
  it('has correct name', () => {
    expect(denoPreset.name).toBe('deno');
  });

  it('extends node preset', () => {
    expect(denoPreset.extends).toBe('node');
  });

  it('has deno-specific capabilities (kv, cron, queues)', () => {
    expect(denoPreset.capabilities?.websocket).toBe(true);
    expect(denoPreset.capabilities?.kv).toBe(true);
    expect(denoPreset.capabilities?.cronTriggers).toBe(true);
    expect(denoPreset.capabilities?.queues).toBe(true);
  });

  it('has deno run commands with permissions', () => {
    expect(denoPreset.commands?.preview).toContain('deno run');
    expect(denoPreset.commands?.preview).toContain('--allow-net');
    expect(denoPreset.commands?.deploy).toContain('--allow-env');
  });

  it('uses port 8000 (Deno default)', () => {
    expect(denoPreset.serve?.port).toBe(8000);
  });

  it('resolves by name and aliases', () => {
    expect(resolvePresetByName('deno').name).toBe('deno');
    expect(resolvePresetByName('deno-deploy').name).toBe('deno');
  });
});

/* -------------------------------------------------------------------------- */
/* Preset inheritance                                                         */
/* -------------------------------------------------------------------------- */

describe('preset inheritance', () => {
  it('vercel inherits node capabilities', () => {
    const resolved = resolvePreset('vercel');
    expect(resolved).toBeDefined();
    // Node preset extends standard, vercel extends node
    expect(resolved?.extends).toBe('node');
  });

  it('bun inherits node externals', () => {
    const resolved = resolvePreset('bun');
    expect(resolved).toBeDefined();
    // Should have hono in externals (inherited from node)
    expect(resolved?.build?.externals).toContain('hono');
  });

  it('deno inherits node serve config but overrides port', () => {
    const resolved = resolvePreset('deno');
    expect(resolved).toBeDefined();
    expect(resolved?.serve?.port).toBe(8000); // Deno overrides
    expect(resolved?.serve?.host).toBe('localhost'); // Inherited
  });
});

/* -------------------------------------------------------------------------- */
/* Config file generation                                                     */
/* -------------------------------------------------------------------------- */

describe('generateVercelConfig', () => {
  it('generates a valid vercel.json config', () => {
    const config = generateVercelConfig({
      entry: 'dist/vercel/server/index.mjs'
    });
    expect(config.version).toBe(2);
    expect(config.functions).toBeDefined();
    expect(config.functions!['dist/vercel/server/index.mjs']).toBeDefined();
  });

  it('includes rewrites and redirects', () => {
    const config = generateVercelConfig({
      rewrites: [{ source: '/old', destination: '/new' }],
      redirects: [{ source: '/gone', destination: '/new', permanent: true }]
    });
    expect(config.rewrites).toHaveLength(1);
    expect(config.redirects).toHaveLength(1);
  });

  it('includes cron schedules', () => {
    const config = generateVercelConfig({
      cron: [{ path: '/api/cron', schedule: '0 * * * *' }]
    });
    expect(config.cron).toHaveLength(1);
    expect(config.cron![0].schedule).toBe('0 * * * *');
  });
});

describe('serializeVercelConfig', () => {
  it('serializes to JSON string', () => {
    const config = generateVercelConfig({ entry: 'index.mjs' });
    const json = serializeVercelConfig(config);
    expect(typeof json).toBe('string');
    expect(json).toContain('"version"');
    expect(json).toContain('"functions"');
  });
});

describe('generateNetlifyConfig', () => {
  it('generates a valid netlify.toml config', () => {
    const config = generateNetlifyConfig({});
    expect(config.build).toBeDefined();
    expect(config.build!.functions).toContain('dist/netlify/functions');
    expect(config.functions?.node_bundler).toBe('esbuild');
  });

  it('includes redirects', () => {
    const config = generateNetlifyConfig({
      redirects: [{ from: '/old', to: '/new', status: 301 }]
    });
    expect(config.redirects).toHaveLength(1);
    expect(config.redirects![0].status).toBe(301);
  });
});

describe('serializeNetlifyConfig', () => {
  it('serializes to TOML string', () => {
    const config = generateNetlifyConfig({});
    const toml = serializeNetlifyConfig(config);
    expect(typeof toml).toBe('string');
    expect(toml).toContain('[build]');
    expect(toml).toContain('[functions]');
  });

  it('includes redirects in TOML', () => {
    const config = generateNetlifyConfig({
      redirects: [{ from: '/old', to: '/new', status: 301 }]
    });
    const toml = serializeNetlifyConfig(config);
    expect(toml).toContain('[[redirects]]');
    expect(toml).toContain('from = "/old"');
  });
});

describe('generateBunfigConfig', () => {
  it('generates empty config by default', () => {
    const config = generateBunfigConfig({});
    expect(config).toEqual({});
  });

  it('includes install config', () => {
    const config = generateBunfigConfig({
      registry: 'https://registry.npmjs.org',
      lockfile: false
    });
    expect(config.install?.registry).toBe('https://registry.npmjs.org');
    expect(config.install?.lockfile).toBe(false);
  });

  it('includes test preload', () => {
    const config = generateBunfigConfig({
      preload: ['./setup.ts']
    });
    expect(config.test?.preload).toContain('./setup.ts');
  });
});

describe('serializeBunfigConfig', () => {
  it('serializes to TOML string', () => {
    const config = generateBunfigConfig({
      registry: 'https://registry.npmjs.org',
      lockfile: false
    });
    const toml = serializeBunfigConfig(config);
    expect(typeof toml).toBe('string');
    expect(toml).toContain('[install]');
    expect(toml).toContain('registry = "https://registry.npmjs.org"');
  });
});

describe('generateDenoConfig', () => {
  it('generates config with tasks', () => {
    const config = generateDenoConfig({
      tasks: { dev: 'deno run --allow-net main.ts' }
    });
    expect(config.tasks?.dev).toContain('deno run');
  });

  it('handles lock: false', () => {
    const config = generateDenoConfig({ lock: false });
    expect(config.lock).toBe(false);
  });

  it('includes unstable flags', () => {
    const config = generateDenoConfig({
      unstable: ['kv', 'cron']
    });
    expect(config.unstable).toContain('kv');
  });
});

describe('serializeDenoConfig', () => {
  it('serializes to JSON string', () => {
    const config = generateDenoConfig({
      tasks: { dev: 'deno run main.ts' }
    });
    const json = serializeDenoConfig(config);
    expect(typeof json).toBe('string');
    expect(json).toContain('"tasks"');
    expect(json).toContain('"dev"');
  });
});

/* -------------------------------------------------------------------------- */
/* Detection                                                                  */
/* -------------------------------------------------------------------------- */

describe('detectPreset - new platforms', () => {
  it('detects vercel via VERCEL env var', () => {
    const result = detectPreset({
      environment: { VERCEL: '1' },
      globalThis: {}
    });
    expect(result.preset.name).toBe('vercel');
    expect(result.source).toBe('environment');
  });

  it('detects netlify via NETLIFY env var', () => {
    const result = detectPreset({
      environment: { NETLIFY: 'true' },
      globalThis: {}
    });
    expect(result.preset.name).toBe('netlify');
    expect(result.source).toBe('environment');
  });

  it('detects bun via globalThis.Bun', () => {
    const result = detectPreset({
      environment: {},
      globalThis: { Bun: {} }
    });
    expect(result.preset.name).toBe('bun');
    expect(result.source).toBe('environment');
  });

  it('detects deno via globalThis.Deno', () => {
    const result = detectPreset({
      environment: {},
      globalThis: { Deno: {} }
    });
    expect(result.preset.name).toBe('deno');
    expect(result.source).toBe('environment');
  });

  it('detects bun via process.versions.bun', () => {
    const result = detectPreset({
      environment: {},
      globalThis: { process: { versions: { bun: '1.0.0' } } }
    });
    expect(result.preset.name).toBe('bun');
  });
});

/* -------------------------------------------------------------------------- */
/* Registration & aliases                                                     */
/* -------------------------------------------------------------------------- */

describe('registration & aliases', () => {
  it('all new presets are registered', () => {
    const names = getRegisteredPresets().map(p => p.name);
    expect(names).toContain('vercel');
    expect(names).toContain('vercel-edge');
    expect(names).toContain('netlify');
    expect(names).toContain('bun');
    expect(names).toContain('deno');
  });

  it('aliases map to correct presets', () => {
    const aliases = getPresetAliases();
    expect(aliases.get('vercel-serverless')).toBe('vercel');
    expect(aliases.get('vercel-edge-function')).toBe('vercel-edge');
    expect(aliases.get('netlify-functions')).toBe('netlify');
    expect(aliases.get('bun-runtime')).toBe('bun');
    expect(aliases.get('deno-deploy')).toBe('deno');
  });

  it('listDetectablePresets includes all platforms', () => {
    const list = listDetectablePresets();
    const names = list.map(p => p.name);
    expect(names).toContain('standard');
    expect(names).toContain('node');
    expect(names).toContain('cloudflare');
    expect(names).toContain('vercel');
    expect(names).toContain('vercel-edge');
    expect(names).toContain('netlify');
    expect(names).toContain('bun');
    expect(names).toContain('deno');
    expect(list.length).toBeGreaterThanOrEqual(9);
  });
});

/* -------------------------------------------------------------------------- */
/* Capability diagnostics for new presets                                     */
/* -------------------------------------------------------------------------- */

describe('capability consistency', () => {
  it('vercel has fewer capabilities than node (no websocket)', () => {
    const vercelResolved = resolvePresetByName('vercel');
    const nodeResolved = resolvePresetByName('node');
    expect(vercelResolved.capabilities?.websocket).toBe(false);
    expect(nodeResolved.capabilities?.websocket).toBe(true);
  });

  it('bun has same websocket support as node', () => {
    const bunResolved = resolvePresetByName('bun');
    const nodeResolved = resolvePresetByName('node');
    expect(bunResolved.capabilities?.websocket).toBe(nodeResolved.capabilities?.websocket);
  });

  it('deno has kv support (node does not by default)', () => {
    const denoResolved = resolvePresetByName('deno');
    expect(denoResolved.capabilities?.kv).toBe(true);
  });

  it('vercel-edge has no nodeCompat (unlike vercel)', () => {
    const edgeResolved = resolvePresetByName('vercel-edge');
    const vercelResolved = resolvePresetByName('vercel');
    expect(edgeResolved.capabilities?.nodeCompat).toBe(false);
    expect(vercelResolved.capabilities?.nodeCompat).toBe(true);
  });
});
