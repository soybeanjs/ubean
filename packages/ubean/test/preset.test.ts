import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  cloudflarePreset,
  generateWranglerConfig,
  serializeWranglerToml,
  resolvePresetByName,
  registerBuiltinPresets,
  detectPreset,
  resolvePresetWithDetection,
  listDetectablePresets
} from '../src/core/preset';

describe('cloudflare preset', () => {
  it('has correct name and entry', () => {
    expect(cloudflarePreset.name).toBe('cloudflare');
    expect(cloudflarePreset.entry).toBe('worker');
  });

  it('defines correct capabilities', () => {
    const caps = cloudflarePreset.capabilities;
    expect(caps.websocket).toBe(true);
    expect(caps.sse).toBe(true);
    expect(caps.cronTriggers).toBe(true);
    expect(caps.queues).toBe(true);
    expect(caps.kv).toBe(true);
    expect(caps.storage).toBe(true);
    expect(caps.database).toBe(true);
    expect(caps.envVars).toBe(true);
    expect(caps.secrets).toBe(true);
    expect(caps.nodeCompat).toBe(false);
    expect(caps.streaming).toBe(true);
    expect(caps.https).toBe(true);
    expect(caps.middleware).toBe(true);
  });

  it('sets build output dir', () => {
    expect(cloudflarePreset.build?.outputDir).toContain('cloudflare');
  });

  it('configures correct externals', () => {
    expect(cloudflarePreset.build?.externals).toContain('hono');
    expect(cloudflarePreset.build?.externals).toContain('cloudflare:workers');
  });

  it('sets compatibility date and flags', () => {
    expect(cloudflarePreset.runtime?.compatibilityDate).toBe('2024-09-01');
    expect(cloudflarePreset.runtime?.compatibilityFlags).toContain('nodejs_compat');
  });

  it('defines preview and deploy commands', () => {
    expect(cloudflarePreset.commands?.preview).toContain('wrangler');
    expect(cloudflarePreset.commands?.deploy).toContain('wrangler deploy');
  });
});

describe('resolvePresetByName', () => {
  it('resolves cloudflare preset by name', () => {
    registerBuiltinPresets();
    const preset = resolvePresetByName('cloudflare');
    expect(preset.name).toBe('cloudflare');
  });

  it('resolves node preset by name', () => {
    const preset = resolvePresetByName('node');
    expect(preset.name).toBe('node');
  });

  it('falls back to standard preset for unknown names', () => {
    const preset = resolvePresetByName('unknown');
    expect(preset.name).toBe('standard');
  });
});

describe('generateWranglerConfig', () => {
  it('generates minimal config with name', () => {
    const config = generateWranglerConfig({ name: 'my-app' });
    expect(config.name).toBe('my-app');
    expect(config.main).toBe('.ubean/dist/cloudflare/worker/index.mjs');
    expect(config.compatibility_date).toBe('2024-09-01');
    expect(config.compatibility_flags).toContain('nodejs_compat');
    expect(config.workers_dev).toBe(true);
    expect(config.observability?.enabled).toBe(true);
  });

  it('supports custom entry and compatibility date', () => {
    const config = generateWranglerConfig({
      name: 'custom-app',
      entry: 'dist/worker.mjs',
      compatibilityDate: '2025-01-01'
    });
    expect(config.main).toBe('dist/worker.mjs');
    expect(config.compatibility_date).toBe('2025-01-01');
  });

  it('adds KV namespaces', () => {
    const config = generateWranglerConfig({
      name: 'kv-app',
      kvNamespaces: [{ binding: 'MY_KV', id: 'abc123' }]
    });
    expect(config.kv_namespaces).toHaveLength(1);
    expect(config.kv_namespaces![0].binding).toBe('MY_KV');
    expect(config.kv_namespaces![0].id).toBe('abc123');
  });

  it('adds environment variables', () => {
    const config = generateWranglerConfig({
      name: 'env-app',
      vars: { API_URL: 'https://api.example.com', DEBUG: 'true' }
    });
    expect(config.vars).toEqual({
      API_URL: 'https://api.example.com',
      DEBUG: 'true'
    });
  });

  it('adds D1 databases', () => {
    const config = generateWranglerConfig({
      name: 'db-app',
      d1Databases: [{ binding: 'DB', databaseId: 'db-123' }]
    });
    expect(config.d1_databases).toHaveLength(1);
    expect(config.d1_databases![0].binding).toBe('DB');
    expect(config.d1_databases![0].database_id).toBe('db-123');
  });

  it('adds R2 buckets', () => {
    const config = generateWranglerConfig({
      name: 'r2-app',
      r2Buckets: [{ binding: 'BUCKET', bucketName: 'my-bucket' }]
    });
    expect(config.r2_buckets).toHaveLength(1);
    expect(config.r2_buckets![0].binding).toBe('BUCKET');
    expect(config.r2_buckets![0].bucket_name).toBe('my-bucket');
  });

  it('adds queues producers and consumers', () => {
    const config = generateWranglerConfig({
      name: 'queue-app',
      queuesProducers: [{ binding: 'TASKS', queue: 'task-queue' }],
      queuesConsumers: [{ queue: 'task-queue' }]
    });
    expect(config.queues?.producers).toHaveLength(1);
    expect(config.queues?.producers![0].binding).toBe('TASKS');
    expect(config.queues?.consumers).toHaveLength(1);
    expect(config.queues?.consumers![0].queue).toBe('task-queue');
  });

  it('adds assets directory', () => {
    const config = generateWranglerConfig({
      name: 'assets-app',
      assetsDir: 'public'
    });
    expect(config.assets?.directory).toBe('public');
    expect(config.assets?.binding).toBe('ASSETS');
  });

  it('can disable observability', () => {
    const config = generateWranglerConfig({
      name: 'no-obs',
      observability: false
    });
    expect(config.observability?.enabled).toBe(false);
  });
});

describe('serializeWranglerToml', () => {
  it('serializes basic config to TOML', () => {
    const config = generateWranglerConfig({ name: 'test-app' });
    const toml = serializeWranglerToml(config);
    expect(toml).toContain('name = "test-app"');
    expect(toml).toContain('main = "');
    expect(toml).toContain('compatibility_date = "');
    expect(toml).toContain('workers_dev = true');
    expect(toml).toContain('[observability]');
    expect(toml).toContain('enabled = true');
  });

  it('serializes vars section', () => {
    const config = generateWranglerConfig({
      name: 'vars-app',
      vars: { FOO: 'bar' }
    });
    const toml = serializeWranglerToml(config);
    expect(toml).toContain('[vars]');
    expect(toml).toContain('FOO = "bar"');
  });

  it('serializes kv_namespaces', () => {
    const config = generateWranglerConfig({
      name: 'kv-app',
      kvNamespaces: [{ binding: 'CACHE', id: 'kv-1' }]
    });
    const toml = serializeWranglerToml(config);
    expect(toml).toContain('[[kv_namespaces]]');
    expect(toml).toContain('binding = "CACHE"');
    expect(toml).toContain('id = "kv-1"');
  });

  it('serializes d1_databases', () => {
    const config = generateWranglerConfig({
      name: 'd1-app',
      d1Databases: [{ binding: 'MY_DB', databaseId: 'd1-123' }]
    });
    const toml = serializeWranglerToml(config);
    expect(toml).toContain('[[d1_databases]]');
    expect(toml).toContain('binding = "MY_DB"');
  });

  it('serializes r2_buckets', () => {
    const config = generateWranglerConfig({
      name: 'r2-app',
      r2Buckets: [{ binding: 'FILES', bucketName: 'files-bucket' }]
    });
    const toml = serializeWranglerToml(config);
    expect(toml).toContain('[[r2_buckets]]');
    expect(toml).toContain('binding = "FILES"');
    expect(toml).toContain('bucket_name = "files-bucket"');
  });

  it('serializes queues producers', () => {
    const config = generateWranglerConfig({
      name: 'q-app',
      queuesProducers: [{ binding: 'JOBS', queue: 'jobs-queue' }]
    });
    const toml = serializeWranglerToml(config);
    expect(toml).toContain('[[queues.producers]]');
    expect(toml).toContain('binding = "JOBS"');
    expect(toml).toContain('queue = "jobs-queue"');
  });

  it('serializes compatibility_flags as array', () => {
    const config = generateWranglerConfig({
      name: 'flags-app',
      compatibilityFlags: ['nodejs_compat', 'streams_enable_constructors']
    });
    const toml = serializeWranglerToml(config);
    expect(toml).toContain('compatibility_flags = [');
    expect(toml).toContain('"nodejs_compat"');
  });

  it('escapes quotes in strings', () => {
    const config = generateWranglerConfig({
      name: 'quote"app',
      vars: { KEY: 'val"ue' }
    });
    const toml = serializeWranglerToml(config);
    expect(toml).toContain('name = "quote\\"app"');
    expect(toml).toContain('KEY = "val\\"ue"');
  });

  it('ends with newline', () => {
    const config = generateWranglerConfig({ name: 'nl-test' });
    const toml = serializeWranglerToml(config);
    expect(toml.endsWith('\n')).toBe(true);
  });
});

describe('detectPreset', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ubean-preset-detect-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('respects explicit preset override', () => {
    const result = detectPreset({
      explicitPreset: 'node',
      environment: {},
      globalThis: {}
    });
    expect(result.preset.name).toBe('node');
    expect(result.source).toBe('explicit');
    expect(result.reason).toContain('explicitly');
  });

  it('respects explicit cloudflare preset', () => {
    const result = detectPreset({
      explicitPreset: 'cloudflare',
      environment: {},
      globalThis: {}
    });
    expect(result.preset.name).toBe('cloudflare');
    expect(result.source).toBe('explicit');
  });

  it('detects cloudflare by wrangler.toml file', async () => {
    await writeFile(join(tmpDir, 'wrangler.toml'), 'name = "test"');
    const result = detectPreset({
      cwd: tmpDir,
      environment: {},
      globalThis: {}
    });
    expect(result.preset.name).toBe('cloudflare');
    expect(result.source).toBe('config-file');
  });

  it('detects cloudflare by wrangler.json file', async () => {
    await writeFile(join(tmpDir, 'wrangler.json'), JSON.stringify({ name: 'test' }));
    const result = detectPreset({
      cwd: tmpDir,
      environment: {},
      globalThis: {}
    });
    expect(result.preset.name).toBe('cloudflare');
    expect(result.source).toBe('config-file');
  });

  it('detects cloudflare by wrangler dependency in package.json', async () => {
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'cf-app',
        devDependencies: { wrangler: '^3.0.0' }
      })
    );
    const result = detectPreset({
      cwd: tmpDir,
      environment: {},
      globalThis: {}
    });
    expect(result.preset.name).toBe('cloudflare');
    expect(result.source).toBe('config-file');
  });

  it('detects cloudflare by @cloudflare/workers-types dependency', async () => {
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'cf-app',
        devDependencies: { '@cloudflare/workers-types': '^4.0.0' }
      })
    );
    const result = detectPreset({
      cwd: tmpDir,
      environment: {},
      globalThis: {}
    });
    expect(result.preset.name).toBe('cloudflare');
  });

  it('detects cloudflare by CF_WORKERS env var', () => {
    const result = detectPreset({
      environment: { CF_WORKERS: '1' },
      globalThis: {}
    });
    expect(result.preset.name).toBe('cloudflare');
    expect(result.source).toBe('environment');
  });

  it('detects cloudflare by WRANGLER env var', () => {
    const result = detectPreset({
      environment: { WRANGLER: '1' },
      globalThis: {}
    });
    expect(result.preset.name).toBe('cloudflare');
  });

  it('detects node by process.versions.node in globalThis', () => {
    const result = detectPreset({
      environment: {},
      globalThis: {
        process: { versions: { node: '20.0.0' } }
      }
    });
    expect(result.preset.name).toBe('node');
    expect(result.source).toBe('environment');
  });

  it('falls back to standard preset when nothing detected', () => {
    const result = detectPreset({
      environment: {},
      globalThis: {}
    });
    expect(result.preset.name).toBe('standard');
    expect(result.source).toBe('default');
  });

  it('explicit preset takes priority over config files', async () => {
    await writeFile(join(tmpDir, 'wrangler.toml'), 'name = "test"');
    const result = detectPreset({
      cwd: tmpDir,
      explicitPreset: 'node',
      environment: {},
      globalThis: {}
    });
    expect(result.preset.name).toBe('node');
    expect(result.source).toBe('explicit');
  });

  it('config file takes priority over environment detection', async () => {
    await writeFile(join(tmpDir, 'wrangler.toml'), 'name = "test"');
    const result = detectPreset({
      cwd: tmpDir,
      environment: {},
      globalThis: {
        process: { versions: { node: '20.0.0' } }
      }
    });
    expect(result.preset.name).toBe('cloudflare');
    expect(result.source).toBe('config-file');
  });
});

describe('resolvePresetWithDetection', () => {
  it('returns detection result', () => {
    const result = resolvePresetWithDetection('standard');
    expect(result.preset.name).toBe('standard');
    expect(result.source).toBe('explicit');
  });

  it('works without explicit preset', () => {
    const result = resolvePresetWithDetection(undefined);
    expect(result.source === 'default' || result.source === 'environment').toBe(true);
  });
});

describe('listDetectablePresets', () => {
  it('returns all detectable presets', () => {
    const presets = listDetectablePresets();
    const names = presets.map(p => p.name).sort();
    expect(names).toEqual(['cloudflare', 'cloudflare-dev', 'node', 'standard']);
  });
});
