import { mkdir, writeFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'pathe';
import { scanProject } from '../src/core/routing/scan';

describe('i18n locales auto-loading', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'ubean-locales-test-'));
    await mkdir(join(testDir, 'src'), { recursive: true });
    await mkdir(join(testDir, 'src/locales'), { recursive: true });
    await mkdir(join(testDir, 'src/routes'), { recursive: true });
    await mkdir(join(testDir, 'src/pages'), { recursive: true });
    await mkdir(join(testDir, 'src/middleware'), { recursive: true });
    await mkdir(join(testDir, 'src/layouts'), { recursive: true });
    await mkdir(join(testDir, 'src/plugins'), { recursive: true });
    await mkdir(join(testDir, 'src/crons'), { recursive: true });
    await mkdir(join(testDir, 'src/queues'), { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('scans flat locale JSON files', async () => {
    await writeFile(
      join(testDir, 'src/locales/en.json'),
      JSON.stringify({
        hello: 'Hello',
        world: 'World'
      })
    );
    await writeFile(
      join(testDir, 'src/locales/zh-CN.json'),
      JSON.stringify({
        hello: '你好',
        world: '世界'
      })
    );

    const result = await scanProject({
      cwd: testDir,
      srcDir: 'src'
    });

    expect(result.locales).toHaveLength(2);
    expect(result.locales.map(l => l.code)).toContain('en');
    expect(result.locales.map(l => l.code)).toContain('zh-CN');
  });

  it('detects default locale from default.json filename', async () => {
    await writeFile(
      join(testDir, 'src/locales/default.json'),
      JSON.stringify({
        hello: 'Hello'
      })
    );
    await writeFile(
      join(testDir, 'src/locales/fr.json'),
      JSON.stringify({
        hello: 'Bonjour'
      })
    );

    const result = await scanProject({
      cwd: testDir,
      srcDir: 'src'
    });

    expect(result.defaultLocale).toBe('en');
    const defaultLocale = result.locales.find(l => l.isDefault);
    expect(defaultLocale).toBeDefined();
    expect(defaultLocale!.code).toBe('en');
  });

  it('supports nested directories for namespaced locales', async () => {
    await mkdir(join(testDir, 'src/locales/en'), { recursive: true });
    await writeFile(
      join(testDir, 'src/locales/en/common.json'),
      JSON.stringify({
        save: 'Save',
        cancel: 'Cancel'
      })
    );
    await writeFile(
      join(testDir, 'src/locales/en.json'),
      JSON.stringify({
        hello: 'Hello'
      })
    );

    const result = await scanProject({
      cwd: testDir,
      srcDir: 'src'
    });

    const namespacedLocale = result.locales.find(l => l.namespace === 'common');
    expect(namespacedLocale).toBeDefined();
    expect(namespacedLocale!.code).toBe('en');
  });

  it('supports index files in nested directories', async () => {
    await mkdir(join(testDir, 'src/locales/zh'), { recursive: true });
    await writeFile(
      join(testDir, 'src/locales/zh/index.json'),
      JSON.stringify({
        hello: '你好'
      })
    );

    const result = await scanProject({
      cwd: testDir,
      srcDir: 'src'
    });

    expect(result.locales).toHaveLength(1);
    expect(result.locales[0].code).toBe('zh');
    expect(result.locales[0].namespace).toBeUndefined();
  });

  it('extracts name and dir metadata from JSON files', async () => {
    await writeFile(
      join(testDir, 'src/locales/ar.json'),
      JSON.stringify({
        name: 'Arabic',
        dir: 'rtl',
        messages: {
          hello: 'مرحبا'
        }
      })
    );

    const result = await scanProject({
      cwd: testDir,
      srcDir: 'src'
    });

    expect(result.locales).toHaveLength(1);
    expect(result.locales[0].name).toBe('Arabic');
    expect(result.locales[0].dir).toBe('rtl');
  });

  it('supports numeric order prefixes', async () => {
    await writeFile(join(testDir, 'src/locales/1.en.json'), JSON.stringify({ hello: 'Hello' }));
    await writeFile(join(testDir, 'src/locales/2.fr.json'), JSON.stringify({ hello: 'Bonjour' }));

    const result = await scanProject({
      cwd: testDir,
      srcDir: 'src'
    });

    expect(result.locales).toHaveLength(2);
    expect(result.locales.map(l => l.code)).toContain('en');
    expect(result.locales.map(l => l.code)).toContain('fr');
  });

  it('ignores test and spec files', async () => {
    await writeFile(join(testDir, 'src/locales/en.json'), JSON.stringify({ hello: 'Hello' }));
    await writeFile(join(testDir, 'src/locales/en.test.json'), JSON.stringify({ hello: 'Test' }));
    await writeFile(join(testDir, 'src/locales/en.spec.json'), JSON.stringify({ hello: 'Spec' }));

    const result = await scanProject({
      cwd: testDir,
      srcDir: 'src'
    });

    expect(result.locales).toHaveLength(1);
    expect(result.locales[0].code).toBe('en');
  });
});
