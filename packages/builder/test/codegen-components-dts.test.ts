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

  /**
   * `.server.vue` / `.client.vue` 是组件半成品，不是独立组件（见 `COMPONENT_HALF_GLOBS`）。
   *
   * 缺陷形态：按文件名派生名字会得到 `Foo.server` / `Foo.client`，写进 `components.d.ts`
   * 就是**非法 TypeScript** —— 未加引号的带点键在接口里是限定名（TS1131），而语法错误
   * 不受文件顶部 `@ts-nocheck` 影响，于是整个示例项目的 `pnpm type-check` 直接红。
   * unplugin-vue-components 重写同一份文件时同样会产出非法行（`const 'Foo.server': …`），
   * 所以两侧都要排除：这里守 codegen 侧，unplugin 侧由 `globsExclude` 接线（vue-plugin.ts）。
   */
  it('不把 .server.vue / .client.vue 当成组件（否则写出非法 TS 键）', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ubean-codegen-halves-'));
    const componentsDir = join(cwd, 'src/components');
    await mkdir(componentsDir, { recursive: true });
    await writeFile(join(componentsDir, 'Paired.server.vue'), '<template><b class="paired-server" /></template>');
    await writeFile(join(componentsDir, 'Paired.client.vue'), '<template><b class="paired-client" /></template>');
    await writeFile(join(componentsDir, 'Solo.client.vue'), '<template><b /></template>');
    await writeFile(join(componentsDir, 'plain.vue'), '<template><i /></template>');

    const result = await generateAutoImports(emptyScan(), {
      cwd,
      srcDir: resolve(cwd, 'src'),
      buildDir: '.ubean'
    });
    const raw = await readFile(result.componentsDtsPath, 'utf8');

    // 半成品一律不出现（成对与单边都一样）
    for (const leaked of ['Paired.server', 'Paired.client', 'Solo.client']) {
      expect(raw, `组件半成品泄漏进 d.ts: ${leaked}`).not.toContain(`    ${leaked}:`);
    }
    // 普通组件照常收录
    expect(raw).toContain('    Plain: typeof import(');

    // 任何键都必须是合法 TS —— 非标识符名要加引号，否则语法错误会连累整个项目
    const keyLines = raw.split('\n').filter(line => /^ {4}\S.*: typeof /.test(line));
    expect(keyLines.length).toBeGreaterThan(0);
    for (const line of keyLines) {
      expect(line, `d.ts 键不是合法 TS: ${line}`).toMatch(/^ {4}(?:[A-Za-z_$][\w$]*|"(?:[^"\\]|\\.)*"): typeof /);
    }
  });

  it('名字含点（普通文件名）时加引号，不产出限定名键', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ubean-codegen-dotted-'));
    const componentsDir = join(cwd, 'src/components');
    await mkdir(componentsDir, { recursive: true });
    await writeFile(join(componentsDir, 'My.Comp.vue'), '<template><i /></template>');

    const result = await generateAutoImports(emptyScan(), {
      cwd,
      srcDir: resolve(cwd, 'src'),
      buildDir: '.ubean'
    });
    const raw = await readFile(result.componentsDtsPath, 'utf8');

    // 名字要与 unplugin 的派生结果一致（两个写入器不能各写各的），但必须是合法键
    expect(raw).toContain('    "My.Comp": typeof import(');
    expect(raw).not.toContain('    My.Comp: typeof import(');
  });
});
