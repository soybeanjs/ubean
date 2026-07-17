import { describe, it, expect } from 'vitest';
import { standardPreset, nodePreset, cloudflarePreset, resolvePresetByName } from '../../src/core/preset';
import {
  NODE_CAPABILITIES,
  STANDARD_CAPABILITIES,
  WORKER_CAPABILITIES,
  diagnoseCapabilities,
  requireCapability,
  createCapabilitySet
} from '../../src/core/preset/capabilities';

describe('Preset capabilities matrix (P8-04)', () => {
  describe('Node preset capabilities', () => {
    it('has all full-featured capabilities enabled', () => {
      expect(NODE_CAPABILITIES.staticServe).toBe(true);
      expect(NODE_CAPABILITIES.websocket).toBe(true);
      expect(NODE_CAPABILITIES.sse).toBe(true);
      expect(NODE_CAPABILITIES.cronTriggers).toBe(true);
      expect(NODE_CAPABILITIES.queues).toBe(true);
      expect(NODE_CAPABILITIES.kv).toBe(true);
      expect(NODE_CAPABILITIES.storage).toBe(true);
      expect(NODE_CAPABILITIES.database).toBe(true);
      expect(NODE_CAPABILITIES.secrets).toBe(true);
      expect(NODE_CAPABILITIES.nodeCompat).toBe(true);
      expect(NODE_CAPABILITIES.streaming).toBe(true);
      expect(NODE_CAPABILITIES.compression).toBe(true);
      expect(NODE_CAPABILITIES.https).toBe(true);
      expect(NODE_CAPABILITIES.http2).toBe(true);
      expect(NODE_CAPABILITIES.multipart).toBe(true);
      expect(NODE_CAPABILITIES.rpc).toBe(true);
      expect(NODE_CAPABILITIES.envVars).toBe(true);
      expect(NODE_CAPABILITIES.middleware).toBe(true);
      expect(NODE_CAPABILITIES.bodyLimit).toBe(true);
    });

    it('passes dev requirements validation', () => {
      const devRequirements = [
        requireCapability('middleware', true),
        requireCapability('streaming', true),
        requireCapability('envVars', true),
        requireCapability('staticServe', false),
        requireCapability('nodeCompat', false)
      ];
      const result = diagnoseCapabilities('node', NODE_CAPABILITIES, devRequirements);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Standard preset capabilities', () => {
    it('has minimal web capabilities enabled', () => {
      expect(STANDARD_CAPABILITIES.staticServe).toBe(true);
      expect(STANDARD_CAPABILITIES.sse).toBe(true);
      expect(STANDARD_CAPABILITIES.middleware).toBe(true);
      expect(STANDARD_CAPABILITIES.streaming).toBe(true);
      expect(STANDARD_CAPABILITIES.bodyLimit).toBe(true);
      expect(STANDARD_CAPABILITIES.envVars).toBe(true);
    });

    it('disables advanced Node-specific features', () => {
      expect(STANDARD_CAPABILITIES.websocket).toBe(false);
      expect(STANDARD_CAPABILITIES.cronTriggers).toBe(false);
      expect(STANDARD_CAPABILITIES.queues).toBe(false);
      expect(STANDARD_CAPABILITIES.kv).toBe(false);
      expect(STANDARD_CAPABILITIES.storage).toBe(false);
      expect(STANDARD_CAPABILITIES.database).toBe(false);
      expect(STANDARD_CAPABILITIES.secrets).toBe(false);
      expect(STANDARD_CAPABILITIES.nodeCompat).toBe(false);
      expect(STANDARD_CAPABILITIES.compression).toBe(false);
      expect(STANDARD_CAPABILITIES.https).toBe(false);
      expect(STANDARD_CAPABILITIES.http2).toBe(false);
      expect(STANDARD_CAPABILITIES.multipart).toBe(false);
      expect(STANDARD_CAPABILITIES.rpc).toBe(false);
    });

    it('passes minimal dev requirements (middleware/streaming/envVars)', () => {
      const minRequirements = [
        requireCapability('middleware', true),
        requireCapability('streaming', true),
        requireCapability('envVars', true)
      ];
      const result = diagnoseCapabilities('standard', STANDARD_CAPABILITIES, minRequirements);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Worker/Cloudflare preset capabilities', () => {
    it('has worker-appropriate capabilities', () => {
      expect(WORKER_CAPABILITIES.staticServe).toBe(true);
      expect(WORKER_CAPABILITIES.websocket).toBe(true);
      expect(WORKER_CAPABILITIES.sse).toBe(true);
      expect(WORKER_CAPABILITIES.kv).toBe(true);
      expect(WORKER_CAPABILITIES.envVars).toBe(true);
      expect(WORKER_CAPABILITIES.streaming).toBe(true);
      expect(WORKER_CAPABILITIES.middleware).toBe(true);
      expect(WORKER_CAPABILITIES.bodyLimit).toBe(true);
    });

    it('disables Node-specific features', () => {
      expect(WORKER_CAPABILITIES.storage).toBe(false);
      expect(WORKER_CAPABILITIES.nodeCompat).toBe(false);
      expect(WORKER_CAPABILITIES.compression).toBe(false);
      expect(WORKER_CAPABILITIES.https).toBe(false);
      expect(WORKER_CAPABILITIES.http2).toBe(false);
    });
  });
});

describe('Preset resolution', () => {
  it('resolves node preset by name', () => {
    const preset = resolvePresetByName('node');
    expect(preset).toBeDefined();
    expect(preset.name).toBe('node');
  });

  it('resolves standard preset by name', () => {
    const preset = resolvePresetByName('standard');
    expect(preset).toBeDefined();
    expect(preset.name).toBe('standard');
  });

  it('resolves cloudflare preset by name', () => {
    const preset = resolvePresetByName('cloudflare');
    expect(preset).toBeDefined();
    expect(preset.name).toBe('cloudflare');
  });

  it('falls back to standard for unknown preset names', () => {
    const preset = resolvePresetByName('nonexistent-preset');
    expect(preset.name).toBe('standard');
  });

  it('resolves standard via "default" alias', () => {
    const preset = resolvePresetByName('default');
    expect(preset.name).toBe('standard');
  });
});

describe('Preset definitions', () => {
  it('standard preset has correct _meta name', () => {
    expect(standardPreset._meta.name).toBe('standard');
  });

  it('node preset has correct _meta name and extends standard', () => {
    expect(nodePreset._meta.name).toBe('node');
  });

  it('cloudflare preset has correct _meta name', () => {
    expect(cloudflarePreset._meta.name).toBe('cloudflare');
  });
});

describe('Capability diagnosis', () => {
  it('reports errors for required missing capabilities', () => {
    const result = diagnoseCapabilities('test', createCapabilitySet(), [requireCapability('database', true)]);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('database');
  });

  it('reports warnings for optional missing capabilities', () => {
    const result = diagnoseCapabilities('test', createCapabilitySet(), [requireCapability('database', false)]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
  });

  it('passes when all required capabilities are present', () => {
    const caps = createCapabilitySet({ database: true, websocket: true });
    const result = diagnoseCapabilities('test', caps, [
      requireCapability('database', true),
      requireCapability('websocket', true)
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('supports custom error messages', () => {
    const result = diagnoseCapabilities('test', createCapabilitySet(), [
      requireCapability('database', true, 'Custom database error message')
    ]);
    expect(result.errors[0]).toContain('Custom database error message');
  });

  it('reports mixed errors and warnings correctly', () => {
    const caps = createCapabilitySet({ database: true });
    const result = diagnoseCapabilities('test', caps, [
      requireCapability('database', true),
      requireCapability('websocket', true),
      requireCapability('compression', false)
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
  });
});

describe('Node preset runtime with createUbeanApp', () => {
  it('node preset resolved config includes serve port', async () => {
    const preset = resolvePresetByName('node');
    expect(preset.serve?.port).toBe(9527);
    expect(preset.build?.outputDir).toBe('.ubean/dist');
    expect(preset.build?.format).toBe('esm');
  });

  it('standard preset resolved config includes serve port', () => {
    const preset = resolvePresetByName('standard');
    expect(preset.serve?.port).toBe(9527);
    expect(preset.build?.outputDir).toBe('.ubean/dist');
  });

  it('node preset has preview command', () => {
    const preset = resolvePresetByName('node');
    expect(preset.commands?.preview).toBeDefined();
    expect(preset.commands?.preview).toContain('.ubean/dist');
  });
});
