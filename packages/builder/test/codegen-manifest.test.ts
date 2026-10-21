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

  it('同时写 env.d.ts（不属于 CODEGEN_FILES，但仍由 generateTypes 产出）', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ubean-codegen-env-'));
    await mkdir(join(cwd, 'src'), { recursive: true });
    const result = await generateTypes(emptyScan(), {
      cwd,
      srcDir: 'src',
      buildDir: '.ubean',
      // schema 为空时也必须生成：文件里还有 `ImportMetaEnv` 那半，与 schema 无关。
      importMetaEnv: { MODE: 'development', DEV: true, VITE_APP_TITLE: 'SoybeanAdmin' }
    });

    expect(result.envTypesPath.endsWith('/.ubean/env.d.ts')).toBe(true);
    const contents = await readFile(result.envTypesPath, 'utf8');
    // 客户端可见的 key 进 ImportMetaEnv，服务端变量不进。
    expect(contents).toContain('readonly VITE_APP_TITLE: string;');
    // Vite 内建（MODE / DEV / PROD / BASE_URL / SSR）**不**进：`vite/client` 已声明它们，
    // 且那边没有 `readonly` —— 重复声明会撞 TS2687。
    expect(contents).not.toContain('readonly MODE: string;');
    expect(contents).not.toContain('readonly DEV: boolean;');
    expect(contents).toContain("declare module 'ubean:env/client'");
    expect(contents).toContain("declare module 'ubean:env/server'");
    // `ImportMetaEnv` 必须在全局作用域 —— 顶层一旦出现 `export {}` 类型增强就失效。
    expect(contents).not.toMatch(/^export \{\}/m);
  });
});
