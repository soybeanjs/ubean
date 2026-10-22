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

describe('generateI18nTypes · GeneratedTypeConfig locale union', () => {
  const locale = (code: string, fullPath: string, isDefault = false): ScannedLocale => ({
    fullPath,
    relativePath: fullPath.split('/').pop()!,
    dirname: '.',
    basename: fullPath.split('/').pop()!,
    code,
    isDefault
  });

  it('emits the locale union alongside DefineLocaleMessage', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ubean-i18n-union-'));
    const enPath = join(dir, 'en.json');
    await writeFile(enPath, JSON.stringify({ hello: 'Hello' }), 'utf8');

    const path = await generateI18nTypes(
      emptyScan([locale('en', enPath, true), locale('zh', join(dir, 'zh.json'))]),
      { outDir: join(dir, '.ubean') }
    );

    const dts = await readFile(path!, 'utf8');
    expect(dts).toContain("declare module '@intlify/core-base'");
    expect(dts).toContain('export interface GeneratedTypeConfig');
    expect(dts).toContain('locale: "en" | "zh";');
    // `export {}` is what makes the `declare module` blocks augmentations
    // instead of script-scoped declarations that silently do nothing.
    expect(dts).toMatch(/^\/\* eslint-disable \*\/\nexport \{\};/m);
  });

  it('emits the union even when no message JSON is usable', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ubean-i18n-union-only-'));
    const path = await generateI18nTypes(emptyScan([locale('en', join(dir, 'en.ts'), true)]), {
      outDir: join(dir, '.ubean')
    });

    const dts = await readFile(path!, 'utf8');
    expect(dts).toContain('locale: "en";');
    expect(dts).not.toContain("declare module 'vue-i18n'");
  });

  it('returns null when there are no locales at all', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ubean-i18n-no-locales-'));
    expect(await generateI18nTypes(emptyScan([]), { outDir: dir })).toBeNull();
  });
});
