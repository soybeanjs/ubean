import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, it, expect } from 'vitest';
import type { ScanResult, ScannedLocale } from '@ubean/scan';
import { join } from 'pathe';
import { generateI18nTypes, messagesToTsType } from '../src/codegen/i18n-types';

function emptyScan(locales: ScannedLocale[]): ScanResult {
  return {
    apiRoutes: [],
    pages: [],
    layouts: [],
    middlewares: [],
    plugins: [],
    crons: [],
    queues: [],
    locales,
    appEntry: { shared: { exists: false }, server: { exists: false }, client: { exists: false } },
    serverEntry: { shared: { exists: false }, dev: { exists: false }, prod: { exists: false } }
  };
}

describe('messagesToTsType', () => {
  it('maps nested JSON to an object type', () => {
    const ts = messagesToTsType({ hello: 'Hello', user: { name: 'Name' } });
    expect(ts).toContain('hello: string');
    expect(ts).toContain('user: {');
    expect(ts).toContain('name: string');
  });

  it('quotes invalid identifiers', () => {
    const ts = messagesToTsType({ 'nav.home': 'Home' });
    expect(ts).toContain('"nav.home": string');
  });
});

describe('generateI18nTypes', () => {
  it('writes DefineLocaleMessage from default locale JSON', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ubean-i18n-types-'));
    const localesDir = join(dir, 'locales');
    await mkdir(localesDir, { recursive: true });
    const fullPath = join(localesDir, 'en.json');
    await writeFile(fullPath, JSON.stringify({ hello: 'Hello', nested: { world: 'World' } }), 'utf8');

    const outDir = join(dir, '.ubean');
    const path = await generateI18nTypes(
      emptyScan([
        {
          fullPath,
          relativePath: 'en.json',
          dirname: '.',
          basename: 'en.json',
          code: 'en',
          isDefault: true
        }
      ]),
      { outDir, defaultLocale: 'en' }
    );

    expect(path).toBe(join(outDir, 'i18n.d.ts'));
    const dts = await readFile(path!, 'utf8');
    expect(dts).toContain("declare module 'vue-i18n'");
    expect(dts).toContain('export interface DefineLocaleMessage');
    expect(dts).toContain('hello: string');
    expect(dts).toContain('world: string');
  });

  it('returns null when there is no locale JSON', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ubean-i18n-empty-'));
    const path = await generateI18nTypes(emptyScan([]), { outDir: dir });
    expect(path).toBeNull();
  });
});
