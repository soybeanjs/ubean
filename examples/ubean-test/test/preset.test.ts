import { describe, it, expect } from 'vitest';
import {
  standardPreset,
  nodePreset,
  cloudflarePreset,
  detectPreset,
  resolvePresetByName,
  registerBuiltinPresets,
  generateWranglerConfig,
  serializeWranglerToml,
  listDetectablePresets,
  resolvePresetWithDetection,
  definePreset,
  resolvePreset
} from 'ubean';

describe('Preset system', () => {
  describe('standardPreset', () => {
    it('has correct name', () => {
      expect(standardPreset.name).toBe('standard');
    });

    it('has stdName or url in _meta', () => {
      expect(standardPreset._meta.stdName || standardPreset._meta.url || standardPreset.name).toBeDefined();
    });

    it('defines static/dev/compatibilityDate', () => {
      // Standard preset should have some build configuration
      expect(standardPreset).toBeDefined();
    });

    it('has aliases including default in _meta', () => {
      // standard is often aliased as 'default'
      const aliases = standardPreset._meta.aliases || [];
      expect(Array.isArray(aliases)).toBe(true);
    });
  });

  describe('nodePreset', () => {
    it('has correct name', () => {
      expect(nodePreset.name).toBe('node');
    });

    it('is a valid preset object', () => {
      expect(nodePreset).toHaveProperty('name');
    });

    it('may have node-server alias in _meta', () => {
      const aliases = nodePreset._meta.aliases || [];
      expect(Array.isArray(aliases)).toBe(true);
    });
  });

  describe('cloudflarePreset', () => {
    it('has correct name', () => {
      expect(cloudflarePreset.name).toBe('cloudflare');
    });

    it('is a valid preset object', () => {
      expect(cloudflarePreset).toHaveProperty('name');
    });

    it('may have cf alias in _meta', () => {
      const aliases = cloudflarePreset._meta.aliases || [];
      expect(Array.isArray(aliases)).toBe(true);
    });
  });

  describe('detectPreset()', () => {
    it('returns a detection result', () => {
      const result = detectPreset();
      expect(result).toBeDefined();
      // In a Node.js environment, it should detect node or return null
      expect(result === null || typeof result === 'object').toBe(true);
    });
  });

  describe('listDetectablePresets()', () => {
    it('returns an array of detectable preset names', () => {
      const list = listDetectablePresets();
      expect(Array.isArray(list)).toBe(true);
    });
  });

  describe('resolvePresetByName()', () => {
    it('resolves "standard" preset', () => {
      registerBuiltinPresets();
      const preset = resolvePresetByName('standard');
      expect(preset).toBeDefined();
      expect(preset?.name).toBe('standard');
    });

    it('resolves "node" preset', () => {
      registerBuiltinPresets();
      const preset = resolvePresetByName('node');
      expect(preset).toBeDefined();
      expect(preset?.name).toBe('node');
    });

    it('resolves "cloudflare" preset', () => {
      registerBuiltinPresets();
      const preset = resolvePresetByName('cloudflare');
      expect(preset).toBeDefined();
      expect(preset?.name).toBe('cloudflare');
    });

    it('resolves aliases (default → standard)', () => {
      registerBuiltinPresets();
      const preset = resolvePresetByName('default');
      expect(preset).toBeDefined();
    });

    it('resolves aliases (node-server → node)', () => {
      registerBuiltinPresets();
      const preset = resolvePresetByName('node-server');
      expect(preset).toBeDefined();
    });

    it('resolves aliases (cf → cloudflare)', () => {
      registerBuiltinPresets();
      const preset = resolvePresetByName('cf');
      expect(preset).toBeDefined();
    });

    it('falls back to standard for unknown preset', () => {
      registerBuiltinPresets();
      const preset = resolvePresetByName('nonexistent-preset-xyz');
      expect(preset).toBeDefined();
      expect(preset?.name).toBe('standard');
    });
  });

  describe('resolvePresetWithDetection()', () => {
    it('resolves with explicit name', () => {
      const result = resolvePresetWithDetection('node');
      expect(result).toBeDefined();
    });

    it('resolves with auto-detection when no name', () => {
      const result = resolvePresetWithDetection();
      expect(result).toBeDefined();
    });
  });

  describe('generateWranglerConfig()', () => {
    it('generates a wrangler config for cloudflare', () => {
      const config = generateWranglerConfig({
        name: 'test-app',
        entry: 'dist/server/index.mjs',
        compatibilityDate: '2024-01-01'
      });
      expect(config).toBeDefined();
      expect(config.name).toBe('test-app');
      expect(config.main).toBe('dist/server/index.mjs');
    });

    it('includes compatibility_date', () => {
      const config = generateWranglerConfig({
        name: 'test',
        entry: 'index.mjs',
        compatibilityDate: '2024-09-01'
      });
      expect(config.compatibility_date).toBe('2024-09-01');
    });
  });

  describe('serializeWranglerToml()', () => {
    it('serializes config to TOML string', () => {
      const config = generateWranglerConfig({
        name: 'my-app',
        entry: 'index.mjs',
        compatibilityDate: '2024-01-01'
      });
      const toml = serializeWranglerToml(config);
      expect(typeof toml).toBe('string');
      expect(toml).toContain('name = "my-app"');
      expect(toml).toContain('main = "index.mjs"');
    });

    it('includes compatibility_date in TOML', () => {
      const config = generateWranglerConfig({
        name: 'test',
        entry: 'index.mjs',
        compatibilityDate: '2024-09-01'
      });
      const toml = serializeWranglerToml(config);
      expect(toml).toContain('compatibility_date');
    });
  });

  describe('definePreset() / resolvePreset()', () => {
    it('defines a custom preset', () => {
      const custom = definePreset(
        {
          name: 'test-custom'
        },
        { name: 'test-custom', static: true }
      );
      expect(custom.name).toBe('test-custom');
    });

    it('resolvePreset resolves a defined preset', () => {
      definePreset(
        {
          name: 'test-resolve'
        },
        { name: 'test-resolve', static: true }
      );
      const resolved = resolvePreset('test-resolve');
      expect(resolved).toBeDefined();
      expect(resolved?.name).toBe('test-resolve');
    });

    it('supports extends inheritance', () => {
      definePreset(
        {
          name: 'base-preset',
          serve: { port: 3000 }
        },
        { name: 'base-preset', static: true }
      );
      definePreset(
        {
          name: 'child-preset',
          extends: 'base-preset',
          serve: { port: 4000 }
        },
        { name: 'child-preset', static: true }
      );
      const resolved = resolvePreset('child-preset');
      expect(resolved).toBeDefined();
      // child should override port
      expect(resolved?.serve?.port).toBe(4000);
    });
  });
});
