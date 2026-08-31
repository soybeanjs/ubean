import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { ScanResult } from '@ubean/scan';
import { dirname, join, resolve } from 'pathe';
import { generateAutoImports } from '../src/codegen/auto-imports';

function emptyScan(): ScanResult {
  return {
    apiRoutes: [],
    pages: [],
    layouts: [],
    middlewares: [],
    plugins: [],
    crons: [],
    queues: [],
    locales: [],
    appEntry: { shared: { exists: false }, server: { exists: false }, client: { exists: false } },
    serverEntry: { shared: { exists: false }, dev: { exists: false }, prod: { exists: false } }
  };
}

describe('generateAutoImports components.d.ts format', () => {
  it('emits self-contained inline import entries (unplugin merge-safe)', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ubean-codegen-dts-'));
    const componentsDir = join(cwd, 'src/components/islands');
    await mkdir(componentsDir, { recursive: true });
    await writeFile(join(componentsDir, 'island-clock.vue'), '<template><span /></template>');

    // ResolvedConfig.srcDir is always absolute (guaranteed by the config loader)
    const result = await generateAutoImports(emptyScan(), {
      cwd,
      srcDir: resolve(cwd, 'src'),
      buildDir: '.ubean'
    });

    const raw = await readFile(result.componentsDtsPath, 'utf8');
    const entryLines = raw.split('\n').filter(line => /^ {4}\w+: /.test(line));
    expect(entryLines.length).toBeGreaterThan(0);

    for (const line of entryLines) {
      // Every entry must carry its own import path. Bare `typeof X` entries lose
      // their meaning when unplugin-vue-components merges this file in dev mode
      // (it preserves interface entries but drops surrounding import statements).
      expect(line, `entry is not self-contained: ${line}`).toMatch(/^ {4}\w+: typeof import\('/);
      expect(line).not.toMatch(/: typeof \w+$/);
    }

    // Builtins stay aligned with UBEAN_BUILTIN_COMPONENTS in ../src/vue-plugin.ts
    for (const name of ['Link', 'Head', 'PageView']) {
      expect(raw).toContain(`${name}: typeof import('ubean/client')['${name}']`);
    }

    // The scanned entry points at the real file, relative to the d.ts directory
    const clockLine = entryLines.find(line => line.startsWith('    IslandClock:'));
    expect(clockLine).toBeDefined();
    expect(clockLine).toContain("./../src/components/islands/island-clock.vue')['default']");
    const match = clockLine!.match(/typeof import\('([^']+)'\)/);
    expect(match).toBeTruthy();
    expect(resolve(dirname(result.componentsDtsPath), match![1])).toBe(join(componentsDir, 'island-clock.vue'));
  });
});
