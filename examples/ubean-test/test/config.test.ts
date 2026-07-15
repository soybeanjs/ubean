import { describe, it, expect } from 'vitest';
import { defineConfig, loadUbeanConfig, getConfig } from 'ubean';
import { resolve } from 'node:path';

describe('Config system - defineConfig / loadUbeanConfig', () => {
  describe('defineConfig()', () => {
    it('returns config as-is (pass-through)', () => {
      const config = defineConfig({
        i18n: {
          defaultLocale: 'en',
          locales: ['en', 'zh'],
          strategy: 'prefix_except_default'
        }
      });
      expect(config.i18n?.defaultLocale).toBe('en');
      expect(config.i18n?.locales).toEqual(['en', 'zh']);
      expect(config.i18n?.strategy).toBe('prefix_except_default');
    });

    it('accepts empty config', () => {
      const config = defineConfig({});
      expect(config).toBeDefined();
    });

    it('accepts routeRules', () => {
      const config = defineConfig({
        routeRules: {
          '/api/**': {
            cors: true
          }
        }
      });
      expect(config.routeRules).toBeDefined();
    });
  });

  describe('loadUbeanConfig() from file', () => {
    it('loads config from ubean.config.ts', async () => {
      const rootDir = resolve(process.cwd());
      const config = await loadUbeanConfig(rootDir);
      expect(config).toBeDefined();
      expect(config.i18n).toBeDefined();
      expect(config.i18n?.defaultLocale).toBe('en');
      // defu merges arrays by concatenation, so defaults ['en'] is appended
      expect(config.i18n?.locales).toEqual(expect.arrayContaining(['en', 'zh']));
      expect(config.i18n?.strategy).toBe('prefix_except_default');
    });

    it('returns default config when no file found', async () => {
      const config = await loadUbeanConfig('/tmp/nonexistent-ubean-dir');
      expect(config).toBeDefined();
    });
  });

  describe('getConfig() singleton', () => {
    it('returns the loaded config', async () => {
      const rootDir = resolve(process.cwd());
      await loadUbeanConfig(rootDir);
      const config = getConfig();
      expect(config).toBeDefined();
    });
  });

  describe('Default value fallback', () => {
    it('i18n defaults to undefined when not set', () => {
      const config = defineConfig({});
      expect(config.i18n).toBeUndefined();
    });

    it('srcDir defaults to undefined (framework uses "src")', () => {
      const config = defineConfig({});
      expect(config.srcDir).toBeUndefined();
    });

    it('routeRules defaults to undefined', () => {
      const config = defineConfig({});
      expect(config.routeRules).toBeUndefined();
    });

    it('preserves explicitly set values', () => {
      const config = defineConfig({
        srcDir: 'app',
        i18n: {
          defaultLocale: 'zh',
          locales: ['zh', 'en'],
          strategy: 'prefix'
        }
      });
      expect(config.srcDir).toBe('app');
      expect(config.i18n?.defaultLocale).toBe('zh');
      expect(config.i18n?.strategy).toBe('prefix');
    });
  });
});
