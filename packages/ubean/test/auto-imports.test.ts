import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'pathe';
import { generateAutoImports, getBuiltinComposables, generateImportsTransform } from '../src/core/auto-imports';
import type { ScanResult } from '../src/core/routing/types';

describe('Auto imports', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'ubean-auto-imports-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function createEmptyScanResult(): ScanResult {
    return {
      apiRoutes: [],
      middlewares: [],
      pages: [],
      layouts: [],
      plugins: [],
      crons: [],
      queues: [],
      locales: [],
      defaultLocale: 'en',
      appEntry: {
        shared: { exists: false },
        server: { exists: false },
        client: { exists: false }
      }
    };
  }

  describe('getBuiltinComposables', () => {
    it('returns Vue core APIs', () => {
      const builtins = getBuiltinComposables();
      const names = builtins.map(i => i.name);

      expect(names).toContain('ref');
      expect(names).toContain('computed');
      expect(names).toContain('reactive');
      expect(names).toContain('watch');
      expect(names).toContain('onMounted');
      expect(names).toContain('defineProps');
      expect(names).toContain('defineEmits');
    });

    it('returns ubean composables', () => {
      const builtins = getBuiltinComposables();
      const names = builtins.map(i => i.name);

      expect(names).toContain('t');
      expect(names).toContain('useI18n');
      expect(names).toContain('useSeoMeta');
      expect(names).toContain('useData');
    });

    it('includes Vue macros', () => {
      const builtins = getBuiltinComposables();
      const names = builtins.map(i => i.name);

      expect(names).toContain('$ref');
      expect(names).toContain('$computed');
    });
  });

  describe('generateImportsTransform', () => {
    it('generates import statements', () => {
      const { code } = generateImportsTransform([
        { name: 'ref', from: 'vue' },
        { name: 'computed', from: 'vue' },
        { name: 't', from: 'ubean' }
      ]);

      expect(code).toContain("import { ref, computed } from 'vue'");
      expect(code).toContain("import { t } from 'ubean'");
    });
  });

  describe('generateAutoImports', () => {
    it('generates auto-imports.d.ts with builtins', async () => {
      const srcDir = join(tempDir, 'src');
      await mkdir(srcDir, { recursive: true });

      const result = await generateAutoImports(createEmptyScanResult(), {
        cwd: tempDir,
        srcDir,
        buildDir: '.ubean',
        imports: { autoImport: true },
        components: { autoImport: false }
      });

      expect(result.composablesImports.length).toBeGreaterThan(0);
      expect(result.autoImportsDtsPath).toContain('auto-imports.d.ts');
    });

    it('generates components.d.ts for Vue components', async () => {
      const srcDir = join(tempDir, 'src');
      const componentsDir = join(srcDir, 'components');
      await mkdir(componentsDir, { recursive: true });
      await writeFile(join(componentsDir, 'MyButton.vue'), '<template><button/></template>');
      await writeFile(join(componentsDir, 'AppCard.vue'), '<template><div/></template>');

      const result = await generateAutoImports(createEmptyScanResult(), {
        cwd: tempDir,
        srcDir,
        buildDir: '.ubean',
        dirs: { components: 'components' },
        imports: { autoImport: false },
        components: { autoImport: true, directoryAsNamespace: false }
      });

      expect(result.components.length).toBe(2);
      const componentNames = result.components.map(c => c.name);
      expect(componentNames).toContain('MyButton');
      expect(componentNames).toContain('AppCard');
    });

    it('scans custom composables directory', async () => {
      const srcDir = join(tempDir, 'src');
      const composablesDir = join(srcDir, 'composables');
      await mkdir(composablesDir, { recursive: true });
      await writeFile(
        join(composablesDir, 'useCounter.ts'),
        'export function useCounter() { return { count: ref(0) } }'
      );
      await writeFile(
        join(composablesDir, 'useDarkMode.ts'),
        'export function useDarkMode() { return { isDark: ref(false) } }'
      );

      const result = await generateAutoImports(createEmptyScanResult(), {
        cwd: tempDir,
        srcDir,
        buildDir: '.ubean',
        dirs: { composables: 'composables' },
        imports: { autoImport: true },
        components: { autoImport: false }
      });

      const customImports = result.composablesImports.filter(i => i.from.startsWith('~/composables/'));
      expect(customImports.length).toBe(2);
      const importNames = customImports.map(i => i.name);
      expect(importNames).toContain('useCounter');
      expect(importNames).toContain('useDarkMode');
    });

    it('respects directoryAsNamespace option for components', async () => {
      const srcDir = join(tempDir, 'src');
      const componentsDir = join(srcDir, 'components');
      const baseDir = join(componentsDir, 'base');
      await mkdir(baseDir, { recursive: true });
      await writeFile(join(baseDir, 'Button.vue'), '<template><button/></template>');

      const result = await generateAutoImports(createEmptyScanResult(), {
        cwd: tempDir,
        srcDir,
        buildDir: '.ubean',
        dirs: { components: 'components' },
        imports: { autoImport: false },
        components: { autoImport: true, directoryAsNamespace: true }
      });

      expect(result.components.length).toBe(1);
      expect(result.components[0].name).toBe('BaseButton');
    });

    it('skips components starting with underscore', async () => {
      const srcDir = join(tempDir, 'src');
      const componentsDir = join(srcDir, 'components');
      await mkdir(componentsDir, { recursive: true });
      await writeFile(join(componentsDir, 'Button.vue'), '<template/>');
      await writeFile(join(componentsDir, '_Internal.vue'), '<template/>');

      const result = await generateAutoImports(createEmptyScanResult(), {
        cwd: tempDir,
        srcDir,
        buildDir: '.ubean',
        dirs: { components: 'components' },
        imports: { autoImport: false },
        components: { autoImport: true }
      });

      expect(result.components.length).toBe(1);
      expect(result.components[0].name).toBe('Button');
    });

    it('can disable auto imports', async () => {
      const srcDir = join(tempDir, 'src');
      await mkdir(srcDir, { recursive: true });

      const result = await generateAutoImports(createEmptyScanResult(), {
        cwd: tempDir,
        srcDir,
        buildDir: '.ubean',
        imports: { autoImport: false },
        components: { autoImport: false }
      });

      expect(result.composablesImports.length).toBe(0);
      expect(result.components.length).toBe(0);
    });

    it('converts file names to camelCase for composables', async () => {
      const srcDir = join(tempDir, 'src');
      const composablesDir = join(srcDir, 'composables');
      await mkdir(composablesDir, { recursive: true });
      await writeFile(join(composablesDir, 'use-local-storage.ts'), 'export function useLocalStorage() {}');

      const result = await generateAutoImports(createEmptyScanResult(), {
        cwd: tempDir,
        srcDir,
        buildDir: '.ubean',
        dirs: { composables: 'composables' },
        imports: { autoImport: true },
        components: { autoImport: false }
      });

      const customImport = result.composablesImports.find(i => i.from.includes('use-local-storage'));
      expect(customImport).toBeDefined();
      expect(customImport!.name).toBe('useLocalStorage');
    });
  });
});
