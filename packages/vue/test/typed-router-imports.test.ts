import { execFileSync } from 'node:child_process';
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
 *
 * ## 两个平台坑（都是 CI 实测踩出来的）
 *
 * 3. **`tsc` 要走 `process.execPath` + 真实 JS 入口**。`node_modules/.bin/tsc` 是 pnpm 的
 *    sh shim（POSIX 专属），Windows 上 `execFileSync` 直接 ENOENT —— 于是控制用例红、
 *    而只断言「不含 TS2667」的用例静默绿。
 *
 * 4. **预算是 5s 不够用**。`execFileSync` 是外进程 + 磁盘（tsgo 还要拉起原生二进制），
 *    本机各 0.7s / 1.2s，CI runner 上实测 4.4～5.9s —— 正好骑在 vitest 默认 5s 上，
 *    所以红的总是「较慢的那一条」（下面 `TSC_TIMEOUT_MS`）。
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'pathe';
import { RouteFileGenerator } from '../src/generator';
import { generateTypedRouter } from '../src/virtual-pages';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

/**
 * 解析 `tsc` 的**真实 JS 入口**（靠仓库根 package.json 锚定，不依赖 `.pnpm` 哈希目录名）。
 *
 * 不能拿 `node_modules/.bin/tsc` 去 `execFileSync`：那是 pnpm 生成的 **sh shim**（POSIX 专属），
 * Windows 上直接 ENOENT —— `packages/cli/test/helpers/vp.ts` 为 `vp` 记下过同一个坑。
 * 本仓的 `typescript` 是 `typescript-native-bridge` 桥接包，它的 `bin.tsc` 指向一个 80 字节的
 * `require('../lib/tsc.js')` shim，用 `process.execPath` 直接跑它，POSIX / Windows 通吃。
 *
 * 从 package.json 的 `bin` 字段取路径而不是写死 `typescript/bin/tsc`：桥接包换布局时这里跟着走。
 */
function resolveTscEntry(repoRoot: string): string {
  const req = createRequire(join(repoRoot, 'package.json'));
  const pkgPath = req.resolve('typescript/package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { bin?: string | Record<string, string> };
  const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.tsc;
  if (!bin) throw new Error('typescript 包没有暴露 `tsc` bin');
  return resolve(dirname(pkgPath), bin);
}

const TSC_ENTRY = resolveTscEntry(REPO_ROOT);
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
    execFileSync(process.execPath, [TSC_ENTRY, '-p', join(dir, 'tsconfig.json')], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: 'pipe'
    });
    return [];
  } catch (err: any) {
    // tsc **没跑起来**（ENOENT / EACCES / 被杀）和 tsc 跑完但报了错是两件事。
    // 前者若也返回 []，那些只断言「不含 TS2667」的用例就**假通过**了 —— 正是本文件
    // 开头警告的「断言被缺席满足」（Windows 上 `.bin/tsc` shim 不可执行时就是这样：
    // 控制用例红，而「真实产物编译」用例静默绿）。所以这里大声抛出去。
    if (typeof err.status !== 'number') {
      throw new Error(`tsc 未能启动（${TSC_ENTRY}）：${err.message}`, { cause: err });
    }
    return String(err.stdout || '')
      .split('\n')
      .filter(l => l.includes('error TS'));
  }
}

/** 路由表刻意混合有参 / 无参路由，覆盖 `ParamValue` 与 `Record<never, never>` 两条分支。 */
const PAGES = [
  { name: 'Dashboard', route: '/dashboard', fullPath: '/src/pages/dashboard.vue', isReuse: false, isMarkdown: false },
  { name: 'UsersId', route: '/users/:id', fullPath: '/src/pages/users/[id].vue', isReuse: false, isMarkdown: false },
  {
    name: 'DocsSlug',
    route: '/docs/:slug?',
    fullPath: '/src/pages/docs/[[slug]].vue',
    isReuse: false,
    isMarkdown: false
  }
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

/**
 * 本文件里两个用例要 `execFileSync` 真跑 `tsc` —— 外进程 + 磁盘，且 tsgo 要拉起原生二进制。
 *
 * vitest 默认的 5s 预算是按纯内存单测定的，这条用例在本机各 0.7s / 1.2s，在 CI runner 上
 * 同一个用例冲到 **5.7s** 即 `Test timed out in 5000ms`（release `v0.6.1-beta.2` 与紧随的
 * CI run 都因此红）。这不是 flaky：预算是死的，机器快慢是活的，重试只是碰运气。
 *
 * 给足预算是必要且充分的 —— 超时是唯一失败模式，「很慢但结果错」会照常由断言抓住。
 * 30s 与仓库根 `vite.config.ts` 的 `testTimeout: 30000` 同口径（`packages/cli` 里那些
 * 跑构建的用例也是同一个量级）。
 */
const TSC_TIMEOUT_MS = 30_000;

afterEach(() => {
  rmSync(FIXTURE_ROOT, { recursive: true, force: true });
});

describe('typed-router.d.ts · TS2667 守卫（模块增强内不得有 import）', () => {
  it('tsc 入口可被 Node 直接启动，且不是 pnpm 的 sh shim', () => {
    // 这条守着 Windows 上踩过的坑：`.bin/tsc` 是 POSIX 专属的 sh shim，`execFileSync` 在
    // win32 上 ENOENT；而它一旦被吞掉（返回 []），下面只断言「不含 TS2667」的用例就会以
    // 7ms 静默绿 —— 断言被缺席满足。所以入口必须是可被 Node 直接执行的 JS。
    expect(TSC_ENTRY.endsWith('bin/tsc'), `unexpected tsc entry: ${TSC_ENTRY}`).toBe(true);
    expect(TSC_ENTRY).not.toContain('.bin');
    expect(readFileSync(TSC_ENTRY, 'utf8').startsWith('#!')).toBe(true);

    const version = execFileSync(process.execPath, [TSC_ENTRY, '--version'], { encoding: 'utf8' });
    expect(version).toMatch(/Version \d+\.\d+\.\d+/);
  });

  it(
    '夹具链路有效：把 import 搬回块内必须报出 TS2667（否则守卫是假通过）',
    () => {
      const mutated = relocateImportIntoBlock(generateFromGenerator());
      const errors = compileDts('control', mutated).join('\n');

      expect(errors, 'fixture could not resolve vue-router → guard would be vacuous').not.toContain('TS2307');
      expect(errors, 'fixture did not reach the module augmentation → guard would be vacuous').toContain('TS2667');
    },
    TSC_TIMEOUT_MS
  );

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

  it(
    '两个写入器的真实产物在不吃 skipLibCheck 的项目里编译且无 TS2667',
    () => {
      const fromGenerator = compileDts('generator', generateFromGenerator());
      const fromVirtualPages = compileDts('virtual-pages', generateFromVirtualPages());

      expect(fromGenerator.join('\n'), 'generator dts failed to resolve vue-router').not.toContain('TS2307');
      expect(fromVirtualPages.join('\n'), 'virtual-pages dts failed to resolve vue-router').not.toContain('TS2307');
      expect(fromGenerator.join('\n')).not.toContain('TS2667');
      expect(fromVirtualPages.join('\n')).not.toContain('TS2667');
    },
    TSC_TIMEOUT_MS
  );
});
