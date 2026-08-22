import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { ScanResult } from '@ubean/scan';
import { join } from 'pathe';
import { CODEGEN_CONTRACT_VERSION, generateTypes } from '../src/codegen/index';

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

describe('generateTypes codegen.manifest.json', () => {
  it('writes a versioned file list for IDE plugins', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ubean-codegen-manifest-'));
    await mkdir(join(cwd, 'src'), { recursive: true });
    const result = await generateTypes(emptyScan(), {
      cwd,
      srcDir: 'src',
      buildDir: '.ubean'
    });
    const raw = await readFile(join(cwd, '.ubean/codegen.manifest.json'), 'utf8');
    const manifest = JSON.parse(raw) as { contractVersion: number; files: Array<{ name: string; generated: boolean }> };
    expect(manifest.contractVersion).toBe(CODEGEN_CONTRACT_VERSION);
    expect(result.generated.some(p => p.endsWith('codegen.manifest.json'))).toBe(true);
    expect(manifest.files.find(f => f.name === 'routes.d.ts')?.generated).toBe(true);
    expect(manifest.files.find(f => f.name === 'pages.d.ts')?.generated).toBe(true);
    expect(manifest.files.find(f => f.name === 'i18n.d.ts')?.generated).toBe(false);
  });
});
