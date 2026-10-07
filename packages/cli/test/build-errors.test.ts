/**
 * 构建期错误契约（TS-10）。
 *
 * 依据：SvelteKit 把 packages/kit/test/build-errors/ 做成独立目录 —— 构建期报错是用户最先遇到的
 * 失败面，而「退出码非零」这一条本身不足以防回归：报错文案被吞掉、或错误指向错误的文件，用户都
 * 无法自修。因此每个非法输入断言两件事：① 退出码非零；② 输出里含**可操作**的错误片段（文件路径
 * 或修复建议），而不是一句空话。
 *
 * 覆盖 9 类非法输入（全部经真实 CLI 探针确认会抛错）：
 *   1. ubean.config.ts 语法错误              6. 页面 SFC 语法错误
 *   2. ubean.config.ts 执行期抛错            7. API 路由模块语法错误
 *   3. ubean.config.ts 引用不存在的模块      8. API 路由模块引用不存在的模块
 *   4. ubean.config.ts 导出不可调用的值      9. vite.config.ts 语法错误
 *   5. 拦截路由目录标记 (.)（ADR-0010 刻意不做）
 *
 * **偏差记录（重要）**：docs/test.md 的 TS-10 原始类表里还列了「srcDir 不存在」与「非法路由组 /
 * 并行路由标记」两类。实测这两类在 CLI 里**没有抛错点**：stripRouteGroups() 静默剥离路由组，扫描器
 * 的 glob().catch(() => []) 把缺失 srcDir 吞成 0 个页面，配置也没有形状校验，resolvePresetByName()
 * 对未知预设回退 standard。它们被下面的「静默接受面」用例固化为**可观测的当前行为**（退出码 0 +
 * 明确的空产物证据）：将来若补上校验，这两个用例会变红并提醒更新台账，而不是留一句无人验证的注释。
 *
 * 用法约束（与 build-contracts.test.ts 同源）：
 * - 用**已构建**的 CLI（packages/cli/dist/cli.js）：pnpm test 不构建，stale dist 会给出假结果。
 * - fixture 目录必须落在**仓库内**：探针实测放 /tmp 会让 Node 依赖解析失败，报出与输入无关的
 *   Rolldown build.rolldownOptions.external 错误。
 * - fixture 独立于 packages/builder/test/fixtures/build-project：共享 .temp-* / .ubean 在
 *   pnpm -r --parallel test 下会互相干扰（实测「单跑绿、全量跑红」）。
 * - 固定 NODE_ENV=production：否则 Vue 换成 dev runtime，产物形状与体积都不同。
 * - 基线用例是错误用例的反向对照：若 CLI 整体坏掉（例如 dist 缺失），错误用例会因为「什么都退出 1」
 *   而全绿 —— 基线把这种假绿挡在门外。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const cliEntry = join(repoRoot, 'packages/cli/dist/cli.js');
const fixtureRoot = join(repoRoot, 'packages/cli/test/fixtures/build-errors');
const OUT = '.temp-build';
const BUILD_TIMEOUT_MS = 300_000;

interface FixtureFile {
  path: string;
  content: string;
}

interface ErrorCase {
  /** fixture 目录名 */
  name: string;
  /** 用例标题 */
  title: string;
  /** 在基线 fixture 之上追加的文件 */
  files: FixtureFile[];
  /** 必须出现在输出里的可操作片段 */
  fragments: string[];
}

interface SilentCase {
  name: string;
  title: string;
  files: FixtureFile[];
  /** 证明「静默」的产物侧证据 */
  evidence: string[];
}

interface BuildResult {
  code: number;
  output: string;
}

const ESC = String.fromCharCode(27);

/** 去掉 kolorist 的颜色转义：断言片段不应夹带 ANSI 序列。 */
function stripAnsi(text: string): string {
  let out = text.split('\r').join('');
  let start = out.indexOf(ESC);
  while (start !== -1) {
    if (out[start + 1] !== '[') {
      start = out.indexOf(ESC, start + 1);
      continue;
    }
    const end = out.indexOf('m', start);
    if (end === -1) break;
    out = out.slice(0, start) + out.slice(end + 1);
    start = out.indexOf(ESC);
  }
  return out;
}

function writeFixture(name: string, files: FixtureFile[]): string {
  const dir = join(fixtureRoot, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const file of files) {
    const target = join(dir, file.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.content, 'utf8');
  }
  return dir;
}

/** 跑一次构建，**不因非零退出而 reject**：错误用例断言的就是非零退出。 */
function runBuild(cwd: string, extraArgs: string[] = [], timeoutMs = BUILD_TIMEOUT_MS): Promise<BuildResult> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [cliEntry, 'build', '--outDir', OUT, ...extraArgs], {
      cwd,
      env: { ...process.env, NODE_ENV: 'production' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    child.stdout?.on('data', chunk => (output += chunk));
    child.stderr?.on('data', chunk => (output += chunk));
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      rejectRun(new Error(`构建未在 ${timeoutMs}ms 内退出（挂住即为回归）\n${output.slice(-2000)}`));
    }, timeoutMs);
    child.once('exit', code => {
      clearTimeout(timer);
      resolveRun({ code: code === null ? -1 : code, output: stripAnsi(output) });
    });
  });
}

/** 非零退出 + 每个可操作片段都在。失败信息里带上输出尾巴，便于直接定位。 */
function expectBuildError(label: string, result: BuildResult, fragments: string[]): void {
  const tail = result.output.slice(-3000);
  expect(result.code, `${label}：非法输入必须以非零码退出\n${tail}`).not.toBe(0);
  for (const fragment of fragments) {
    expect(result.output, `${label}：错误信息里应当出现可操作片段「${fragment}」\n${tail}`).toContain(fragment);
  }
}

const PACKAGE_JSON = JSON.stringify({ name: 'ubean-build-errors', private: true, type: 'module' }, null, 2);
const OK_PAGE = '<template>\n  <div>ok</div>\n</template>\n';

const BASE_FILES: FixtureFile[] = [
  { path: 'package.json', content: PACKAGE_JSON },
  { path: 'src/pages/index.vue', content: OK_PAGE }
];

function withBase(files: FixtureFile[]): FixtureFile[] {
  return [...BASE_FILES, ...files];
}

const CONFIG = 'ubean.config.ts';

/**
 * 9 类非法输入。fragments 全部来自真实 CLI 输出（探针实测），不是猜测的文案。
 */
const ERROR_CASES: ErrorCase[] = [
  {
    name: 'config-syntax',
    title: 'ubean.config.ts 语法错误',
    files: [{ path: CONFIG, content: 'export default { srcDir: "src",, };\n' }],
    fragments: ['ParseError', CONFIG]
  },
  {
    name: 'config-throw',
    title: 'ubean.config.ts 执行期抛错（错误信息原样透出）',
    files: [
      {
        path: CONFIG,
        content: 'throw new Error("CONFIG_EXPLODED: 请检查 srcDir 配置");\n'
      }
    ],
    fragments: ['CONFIG_EXPLODED']
  },
  {
    name: 'config-missing-import',
    title: 'ubean.config.ts 引用不存在的模块',
    files: [{ path: CONFIG, content: 'import "./nope.js";\nexport default { srcDir: "src" };\n' }],
    fragments: ['Cannot find module', CONFIG]
  },
  {
    name: 'config-not-constructible',
    title: 'ubean.config.ts 导出不可调用的值（class）',
    files: [{ path: CONFIG, content: 'export default class Foo {}\n' }],
    fragments: ['cannot be invoked without', 'Foo']
  },
  {
    name: 'intercept-route-marker',
    title: '拦截路由目录标记 (.) —— ADR-0010 刻意不做，必须显式报错',
    files: [{ path: 'src/pages/(.)photo.vue', content: OK_PAGE }],
    fragments: ['拦截路由目录约定不被支持', '发现了 "']
  },
  {
    name: 'page-sfc-syntax',
    title: '页面 SFC 语法错误（模板插值未闭合）',
    files: [{ path: 'src/pages/index.vue', content: '<template><div>{{ oops </div></template>\n' }],
    fragments: ['Interpolation end sign was not found', 'src/pages/index.vue']
  },
  {
    name: 'route-module-syntax',
    title: 'API 路由模块语法错误',
    files: [{ path: 'src/routes/bad.ts', content: 'export const GET = (( (\n' }],
    fragments: ['Build failed with 1 error', 'src/routes/bad.ts']
  },
  {
    name: 'route-module-missing-import',
    title: 'API 路由模块引用不存在的模块',
    files: [
      {
        path: 'src/routes/imp.ts',
        content: 'import "./does-not-exist.js";\n\nexport const GET = () => new Response("ok");\n'
      }
    ],
    fragments: ['UNRESOLVED_IMPORT', 'does-not-exist.js', 'src/routes/imp.ts']
  },
  {
    name: 'vite-config-syntax',
    title: 'vite.config.ts 语法错误（用户配置损坏要指向用户文件）',
    files: [{ path: 'vite.config.ts', content: 'export default { plugins: [\n' }],
    fragments: ['failed to load config from', 'vite.config.ts']
  }
];

/**
 * 静默接受面：这些输入**当前不报错**。用例固化「退出码 0 + 产物证据」，把静默行为变成可观测事实。
 * 将来若补上校验，这里会变红 —— 那正是需要更新 TS-10 台账的信号，而不是让它悄悄漂移。
 */
const SILENT_CASES: SilentCase[] = [
  {
    name: 'silent-src-dir-missing',
    title: 'srcDir 指向不存在的目录：当前静默通过（扫描器 glob 失败被吞成 0 页面）',
    files: [{ path: CONFIG, content: 'export default { srcDir: "nonexistent-src" };\n' }],
    evidence: ['0 pages', 'Build complete']
  },
  {
    name: 'silent-unknown-preset',
    title: '未知 --preset 名：当前回退到 standard 而非报错',
    files: [],
    evidence: ['Using preset: standard', 'Build complete']
  },
  {
    name: 'silent-unknown-mode',
    title: '未知 --mode 值：当前原样接受并构建',
    files: [],
    evidence: ['App mode: bogus', 'Build complete']
  },
  {
    name: 'silent-route-group',
    title: '未闭合路由组 (group：当前被静默剥离，不校验',
    files: [{ path: 'src/pages/(group/index.vue', content: OK_PAGE }],
    evidence: ['Build complete']
  }
];

const silentExtraArgs: Record<string, string[]> = {
  'silent-unknown-preset': ['--preset', 'bogus'],
  'silent-unknown-mode': ['--mode', 'bogus']
};

beforeAll(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

afterAll(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

describe('构建期错误契约（TS-10 / 参照 SvelteKit build-errors）', () => {
  it('前置条件：CLI 已构建（pnpm test 不构建，stale dist 会给出假结果）', () => {
    if (!existsSync(cliEntry)) {
      throw new Error(`${cliEntry} 不存在：请先构建（pnpm build）再跑 CLI 集成测试`);
    }
    expect(existsSync(cliEntry)).toBe(true);
  });

  it(
    '反向对照：合法基线必须退出 0 并产出完整产物',
    async () => {
      const dir = writeFixture('baseline', withBase([]));
      const result = await runBuild(dir);
      const tail = result.output.slice(-2000);
      expect(result.code, `合法项目构建失败：错误用例的「非零退出」断言将失去意义\n${tail}`).toBe(0);
      expect(result.output).toContain('Build complete');
      expect(existsSync(join(dir, OUT, 'server', 'server.mjs'))).toBe(true);
    },
    BUILD_TIMEOUT_MS
  );

  it.each(ERROR_CASES)(
    '$title → 非零退出 + 可操作错误信息',
    async testCase => {
      const dir = writeFixture(testCase.name, withBase(testCase.files));
      const result = await runBuild(dir);
      expectBuildError(testCase.name, result, testCase.fragments);
    },
    BUILD_TIMEOUT_MS
  );

  it.each(SILENT_CASES)(
    '$title',
    async testCase => {
      const dir = writeFixture(testCase.name, withBase(testCase.files));
      const result = await runBuild(dir, silentExtraArgs[testCase.name] ?? []);
      const tail = result.output.slice(-2000);
      // 固化的当前行为：不报错。若这里开始失败，说明框架补上了校验 —— 请同步更新 docs/test.md 的 TS-10 台账。
      expect(result.code, `${testCase.name}：该类输入当前预期被静默接受，行为已改变\n${tail}`).toBe(0);
      for (const item of testCase.evidence) {
        expect(result.output, `${testCase.name}：缺少静默行为证据「${item}」\n${tail}`).toContain(item);
      }
    },
    BUILD_TIMEOUT_MS
  );
});
