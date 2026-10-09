/**
 * `typed-router.d.ts` 的**两个写入器**都必须在顶层导入 vue-router 类型。
 *
 * 背景：`RouteRecordInfo` / `ParamValue` / `ParamValueZeroOrOne` 此前写在
 * `declare module 'vue-router/auto-routes' { import type { … } from 'vue-router' }`
 * 块**内部**。TypeScript 对模块增强内的 import 报 TS2667
 * （Imports are not permitted in module augmentations. Consider moving them to the
 * enclosing external module.）。
 *
 * 这个错误此前长期不可见：仓库内所有 example / docs 的 tsconfig 都有
 * `skipLibCheck: true`，而未入库的 `.ubean/typed-router.d.ts` 恰好被该选项跳过；
 * 真实用户项目（例如 soybean-agent）一旦不吃 skipLibCheck，`pnpm typecheck`
 * 第一屏就是这条错误 —— 用户会以为是自己的代码问题。
 *
 * ## 两个"静默通过"陷阱（都是实测踩出来的）
 *
 * 1. **夹具必须放在仓库内**。放 `os.tmpdir()` 下时 tsconfig 解析不到
 *    `vue-router`（TS2307），编译根本没走到模块增强那一步，断言会假通过。
 *    所以夹具写在 `<repo>/.temp/typed-router-imports/`，让 Node 的
 *    node_modules 向上查找命中仓库根。
 *
 * 2. **夹具必须带 `declare module 'vue-router' { TypesConfig }` 块**。
 *    只有这个块里的 `import('vue-router/auto-routes')` 会迫使 TS 去解析那个
 *    **虚拟**模块并增补它；块内 import 的 TS2667 才会被报告。实测少这个块时
 *    同一份坏写法只报 TS2307，不报 TS2667 —— 于是"反向对照"会失败（这正是本
 *    用例保留那条对照的原因）。
 *
 * 守卫因此分成两层：**形状断言**（import 在 declare 之前）+ **真实 tsc 编译**，
 * 后者自带一条**变异对照**（把生成结果里的顶层 import 搬回块内，必须报出
 * TS2667），保证夹具解析链路一旦断掉就大声失败，而不是静默通过。
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'pathe';
import { RouteFileGenerator } from '../src/generator';
import { generateTypedRouter } from '../src/virtual-pages';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const TSC = join(REPO_ROOT, 'node_modules', '.bin', 'tsc');
const FIXTURE_ROOT = join(REPO_ROOT, '.temp', 'typed-router-imports');

const TSCONFIG = {
  compilerOptions: {
    target: 'ESNext',
    lib: ['DOM', 'ESNext'],
    module: 'ESNext',
    moduleResolution: 'Bundler',
    strict: true,
    noEmit: true,
    // 刻意**不开** skipLibCheck：本用例要复现真实用户项目里的报错
    types: []
  },
  include: ['typed-router.d.ts']
};

const FIXTURE_DTS_PATH = 'typed-router.d.ts';

/** 在仓库内的夹具目录里跑真实 tsc，返回 `error TS…` 行。 */
function compileDts(name: string, dts: string): string[] {
  const dir = join(FIXTURE_ROOT, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, FIXTURE_DTS_PATH), dts, 'utf8');
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify(TSCONFIG), 'utf8');
  try {
    execFileSync(TSC, ['-p', join(dir, 'tsconfig.json')], { cwd: REPO_ROOT, encoding: 'utf8', stdio: 'pipe' });
    return [];
  } catch (err: any) {
    return String(err.stdout || '')
      .split('\n')
      .filter(l => l.includes('error TS'));
  }
}

/** 路由表刻意混合有参 / 无参路由，覆盖 `ParamValue` 与 `Record<never, never>` 两条分支。 */
const PAGES = [
  { name: 'Dashboard', route: '/dashboard', fullPath: '/src/pages/dashboard.vue', isReuse: false, isMarkdown: false },
  { name: 'UsersId', route: '/users/:id', fullPath: '/src/pages/users/[id].vue', isReuse: false, isMarkdown: false },
  { name: 'DocsSlug', route: '/docs/:slug?', fullPath: '/src/pages/docs/[[slug]].vue', isReuse: false, isMarkdown: false }
];

/** 复刻 bug：把顶层 import 搬进 `declare module 'vue-router/auto-routes'` 块内部。 */
function relocateImportIntoBlock(dts: string): string {
  const importLine = "import type { RouteRecordInfo, ParamValue, ParamValueZeroOrOne } from 'vue-router';";
  const augmentHead = "declare module 'vue-router/auto-routes' {";
  expect(dts, 'generated dts is missing the top-level import').toContain(importLine);

  const withoutImport = dts.replace(importLine, '').replace(/\n\n\n/g, '\n\n');
  return withoutImport.replace(augmentHead, `${augmentHead}\n  ${importLine}`);
}

function generateFromGenerator(): string {
  const gen = new RouteFileGenerator({ cwd: process.cwd(), outDir: join(FIXTURE_ROOT, 'out') });
  return gen.renderDtsFile({ pages: PAGES as never, layouts: [] });
}

function generateFromVirtualPages(): string {
  return generateTypedRouter({ pages: PAGES as never, layouts: [] });
}

afterEach(() => {
  rmSync(FIXTURE_ROOT, { recursive: true, force: true });
});

describe('typed-router.d.ts · TS2667 守卫（模块增强内不得有 import）', () => {
  it('夹具链路有效：把 import 搬回块内必须报出 TS2667（否则守卫是假通过）', () => {
    const mutated = relocateImportIntoBlock(generateFromGenerator());
    const errors = compileDts('control', mutated).join('\n');

    expect(errors, 'fixture could not resolve vue-router → guard would be vacuous').not.toContain('TS2307');
    expect(errors, 'fixture did not reach the module augmentation → guard would be vacuous').toContain('TS2667');
  });

  it('generator 写入器把 import type 放在 declare module 之前', () => {
    const dts = generateFromGenerator();

    const importIdx = dts.indexOf('import type { RouteRecordInfo');
    expect(importIdx, 'missing top-level import type').toBeGreaterThan(-1);
    expect(importIdx).toBeLessThan(dts.indexOf("declare module '@ubean/scan'"));
    expect(dts).not.toMatch(/declare module '[^']+' \{\s*\n\s*import /);
  });

  it('virtual-pages 写入器把 import type 放在 declare module 之前', () => {
    const dts = generateFromVirtualPages();

    const importIdx = dts.indexOf('import type { RouteRecordInfo');
    expect(importIdx, 'missing top-level import type').toBeGreaterThan(-1);
    expect(importIdx).toBeLessThan(dts.indexOf("declare module 'vue-router/auto-routes'"));
    expect(dts).not.toMatch(/declare module '[^']+' \{\s*\n\s*import /);
  });

  it('两个写入器的真实产物在不吃 skipLibCheck 的项目里编译且无 TS2667', () => {
    const fromGenerator = compileDts('generator', generateFromGenerator());
    const fromVirtualPages = compileDts('virtual-pages', generateFromVirtualPages());

    expect(fromGenerator.join('\n'), 'generator dts failed to resolve vue-router').not.toContain('TS2307');
    expect(fromVirtualPages.join('\n'), 'virtual-pages dts failed to resolve vue-router').not.toContain('TS2307');
    expect(fromGenerator.join('\n')).not.toContain('TS2667');
    expect(fromVirtualPages.join('\n')).not.toContain('TS2667');
  });
});
