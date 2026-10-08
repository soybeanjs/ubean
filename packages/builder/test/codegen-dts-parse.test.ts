/**
 * 历史事故 #3（RM-T01）—— 生成的 `.ubean/*.d.ts` 是**非法 TypeScript**，而没人解析过它。
 *
 * 事故现场：`examples/ubean-test` 的 `pnpm type-check` 整片红，错误来自 `.ubean/components.d.ts`
 * 里的语法错误（按文件名派生出 `Foo.server` / `Foo.client` 这种带点键，未加引号时在接口里是
 * 限定名，TS1131）。根因不只是 codegen 侧写错了名字，更是**这道门从来没被打开过**：
 *
 * - 根 `pnpm typecheck` 只覆盖 `packages/*`，示例项目不在其中；
 * - `.ubean/*` 是生成物且**不入 git**（`git ls-files examples/ubean-test/.ubean/` 为空），
 *   所以「仓库里有没有非法 d.ts」这件事在 CI 里根本不可观测；
 * - 于是 CI 全绿、示例 typecheck 全红，持续到有人手工跑一次。
 *
 * 为什么这条断言必须**真解析**而不是正则匹配键名：
 * `packages/builder/test/codegen-components-dts.test.ts` 已经在守「键的形态」（加引号、排除
 * 半成品），但那是**我们自己写的正则**——它对 TS 的语法规则是一份手抄本，抄错了就静默放过。
 * `@ts-nocheck` 压不住语法错误这一点，也让「加个 nocheck 就完事」成为不可能。
 * 这里改用 TypeScript 自己的 parser（`ts.createSourceFile(...).parseDiagnostics`）做终审：
 * 生成物里只要有任何一条语法诊断，示例项目的 typecheck 就必然红，而这里会先红。
 *
 * 与 `packages/cli/test/ci-matrix.test.ts` 的分工：那边守「`Type check the example project`
 * 这个 CI 步骤还在」（`UBUNTU_ONLY_STEPS`），这边守「那个步骤跑的东西本身是合法的」。
 * 两半缺一不可：步骤被删是静默的，产物非法也是静默的。
 */
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ScanResult } from '@ubean/scan';
import { generateAutoImports } from '../src/codegen/auto-imports';

/**
 * `typescript` 是 `packages/builder` 的 devDependency（catalog）。
 *
 * 用 `createRequire` 而不是 `import ts from 'typescript'`：本包的 tsconfig 会把
 * `import` 走 tsconfigPaths 解析，而这里要的正是「和示例项目 `vue-tsc` 用的同一个 TS」——
 * 从包自己的 `package.json` 起解析，拿到的就是 devDeps 里那一个。
 */
const rootRequire = createRequire(join(import.meta.dirname, '..', 'package.json'));
const ts = rootRequire('typescript') as typeof import('typescript');

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

/** 与 `vue-tsc` 解析 `.d.ts` 时相同的入口：按 ESNext + TS 方言，带上 `setParentNodes`。 */
function parseDiagnostics(source: string, fileName: string): string[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  return (file.parseDiagnostics ?? []).map(diagnostic => {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
    const { line } = file.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    return `${fileName}:${line + 1} TS${diagnostic.code} ${message}`;
  });
}

describe('生成的 d.ts 必须能被 TypeScript 解析（RM-T01）', () => {
  it('components.d.ts 在有配对/单边/带点组件名时仍无语法诊断', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ubean-codegen-parse-'));
    const componentsDir = join(cwd, 'src/components');
    await mkdir(componentsDir, { recursive: true });

    // 四种最容易写出非法键的形态一次全给：配对半成品、单边半成品、普通带点文件名、普通组件。
    // 事故现场的 `examples/ubean-test/src/components/sc/` 正是这个形状。
    await writeFile(join(componentsDir, 'ThemeBadge.server.vue'), '<template><b class="s" /></template>');
    await writeFile(join(componentsDir, 'ThemeBadge.client.vue'), '<template><b class="c" /></template>');
    await writeFile(join(componentsDir, 'BrowserClock.client.vue'), '<template><b /></template>');
    await writeFile(join(componentsDir, 'My.Comp.vue'), '<template><i /></template>');
    await writeFile(join(componentsDir, 'Plain.vue'), '<template><i /></template>');

    const result = await generateAutoImports(emptyScan(), {
      cwd,
      srcDir: resolve(cwd, 'src'),
      buildDir: '.ubean'
    });

    for (const file of [result.componentsDtsPath, result.autoImportsDtsPath, result.virtualComponentsDtsPath]) {
      const source = await readFile(file, 'utf8');
      expect(parseDiagnostics(source, file), `${file} 不是合法 TypeScript`).toEqual([]);
    }
  });

  it('探针自证：事故形态（未加引号的带点键）确实会被解析器抓住', () => {
    // 没有这条，「上面那条测试因为 fixture 没触发缺陷而永远绿」就无法排除。
    const illegalInterface = 'export interface C {\n  Foo.server: typeof import("./a.vue")["default"];\n}\n';
    const illegalConst = 'const Foo.server: string = "x";\n';
    const legalQuoted = 'export interface C {\n  "Foo.server": typeof import("./a.vue")["default"];\n}\n';

    expect(parseDiagnostics(illegalInterface, 'illegal.d.ts').length).toBeGreaterThan(0);
    expect(parseDiagnostics(illegalConst, 'illegal2.d.ts').length).toBeGreaterThan(0);
    expect(parseDiagnostics(legalQuoted, 'legal.d.ts')).toEqual([]);
  });

  it('unplugin-vue-components 侧的排除 glob 与实际半成品形态一致', async () => {
    // 两个写入器（codegen / unplugin-vue-components）都写同一份 components.d.ts。
    // 上面守的是 codegen 侧，unplugin 侧靠 `globsExclude: COMPONENT_HALF_GLOBS` 接线
    // （`../src/vue-plugin.ts`）。这份 glob 一旦被改成不匹配真实文件名，unplugin 就会
    // 重新写出非法行，而上面那条测试**看不见**（它只跑 codegen）。
    const { COMPONENT_HALF_GLOBS } = await import('../src/codegen/auto-imports');
    expect(COMPONENT_HALF_GLOBS).toEqual(['**/*.server.vue', '**/*.client.vue']);

    const vuePlugin = await readFile(resolve(import.meta.dirname, '../src/vue-plugin.ts'), 'utf8');
    expect(vuePlugin).toContain('COMPONENT_HALF_GLOBS');
    expect(vuePlugin).toMatch(/globsExclude:\s*\[[^\]]*COMPONENT_HALF_GLOBS/u);
  });
});
