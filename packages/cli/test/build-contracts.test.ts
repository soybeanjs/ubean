/**
 * 构建矩阵：每种 mode × preset 的**产物契约**（RM-V23 建立，RM-V36 收敛后重写）。
 *
 * 收敛前这里比的是「两条路径（CLI 旧编排 vs builder 环境）的产物清单逐项一致」——那时矩阵的
 * 价值在于证明迁移无差异。旧编排已删除，比较对象不存在了，但**那一轮暴露的失败模式仍然有效**，
 * 因此矩阵按「契约」重写：每一格在临时 outDir 里独立构建，断言该 mode / preset 该有的产物**存在
 * 且内容正确**。
 *
 * 为什么不能只断言「构建成功」：本轮踩到的三次都是「退出 0 但产物不可用」——
 * ① 资产标签被内联成空串（生产 HTML 不水合、无样式）；
 * ② 预渲染 HTML 落到另一个目录（`--outDir` 下产物被劈成两半）；
 * ③ 无用户 `vite.config` + backend 模式直接构建失败（`virtual:ubean-app` 解析不到）。
 * ① ② 都是本次重写后仍然守着的内容级判据，③ 由「无配置」那一格覆盖。
 *
 * 两条硬性要求：
 * 1. **构建到各自的临时目录**（`--outDir`），不覆盖 `dist` —— 否则会把构建残留留给
 *    `analyze:check`；
 * 2. **固定 `NODE_ENV`**：Vite 尊重显式 `NODE_ENV`，`NODE_ENV=test` 会把 Vue 开发态代码打进
 *    客户端产物（同一个示例 entry gzip 45.2 → 75.9 kB）。
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const fixtureDir = join(repoRoot, 'examples/ubean-test');
/**
 * worker 目标（cloudflare）与「无用户 `vite.config.ts`」两格用**本包自己的最小 fixture**：
 *
 * - 示例项目里有一条 **Node-only 的测试路由**（`src/routes/api/prerender-test.ts` 直接 import
 *   `ubean/build`，为 HTTP 集成测试暴露预渲染 API），它的整条构建工具链在 worker 图里含无法打包的
 *   可选依赖（`@vue/compiler-sfc` → `velocityjs` / `atpl` …），构建会在解析阶段失败 —— 这是**使用
 *   约束而不是框架缺陷**（运行时路由不该 import 构建期 API），所以 worker 那格换项目跑；
 * - 该 fixture **不带 `vite.config.ts`**，正好也是「CLI 注入 builtin 插件」那一格要覆盖的分支。
 *
 * 刻意**不复用 `packages/builder/test/fixtures/build-project`**：本仓测试是 `pnpm -r --parallel`
 * 跑的，两个包共用同一目录又各自清理 `.temp-*` / `.ubean`，实测出现「单跑绿、全量跑红」的互相干扰。
 */
const workerFixtureDir = join(repoRoot, 'packages/cli/test/fixtures/no-config-app');
const cliEntry = join(repoRoot, 'packages/cli/dist/cli.js');
/** 各格产物目录前缀（都在 fixture 内、跑完删除）。 */
const OUT = '.temp-build';

const MODES = ['fullstack', 'spa', 'backend', 'ssg'] as const;

/**
 * preset 轴（三种包装形态）。
 *
 * 每个 preset 断言**它自己的**产物契约：node 系出 `server/server.mjs`、cloudflare 出
 * `server/worker.mjs` + `wrangler.toml`、fetch 系出 `server/handler.mjs`。
 * 平台配置文件（`vercel.json` / `netlify.toml` / `deno.json`）不单独断言 —— 它们由 preset 的
 * `build:after` 钩子写，属部署侧配置，packages 侧不承诺其内容。
 */
const PRESET_CONTRACTS = [
  { preset: 'node', wrapper: 'server/server.mjs', rootFile: '' },
  { preset: 'cloudflare', wrapper: 'server/worker.mjs', rootFile: 'wrangler.toml' },
  { preset: 'standard', wrapper: 'server/handler.mjs', rootFile: '' },
  { preset: 'bun', wrapper: 'server/server.mjs', rootFile: '' },
  { preset: 'deno', wrapper: 'server/server.mjs', rootFile: '' },
  { preset: 'vercel', wrapper: 'server/handler.mjs', rootFile: '' },
  { preset: 'netlify', wrapper: 'server/handler.mjs', rootFile: '' },
  // aws / azure 的 `build:after` 是空钩子，但 `build.outputDir` 是非默认值（`dist/aws` /
  // `dist/azure`）—— 这一格顺带覆盖「preset 自带 outputDir 与 `--outDir` 的优先级」。
  { preset: 'aws', wrapper: 'server/handler.mjs', rootFile: '' },
  { preset: 'azure', wrapper: 'server/handler.mjs', rootFile: '' }
] as const;

function cleanup(): void {
  // worker fixture 上跑的格：cloudflare preset 与「无配置」两格（都写在这个 fixture 里）
  for (const name of [`${OUT}-preset-cloudflare`, `${OUT}-no-cfg`, `${OUT}-no-cfg-backend`]) {
    rmSync(join(workerFixtureDir, name), { recursive: true, force: true });
  }
  rmSync(join(workerFixtureDir, '.ubean'), { recursive: true, force: true });
  const dirs = [
    `${OUT}-base`,
    `${OUT}-no-cfg`,
    `${OUT}-no-cfg-backend`,
    ...MODES.map(mode => `${OUT}-${mode}`),
    ...PRESET_CONTRACTS.map(({ preset }) => `${OUT}-preset-${preset}`)
  ];
  for (const dir of dirs) rmSync(join(fixtureDir, dir), { recursive: true, force: true });
}

/** 递归列出产物文件（相对路径），并把内容哈希规范化 —— 哈希在不同构建间不稳定。 */
function listArtifacts(dir: string, prefix = ''): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    const rel = prefix ? `${prefix}/${entry}` : entry;
    if (statSync(full).isDirectory()) out.push(...listArtifacts(full, rel));
    else out.push(rel.replace(/-[A-Za-z0-9_-]{8}\./g, '.<hash>.'));
  }
  return out;
}

/** 递归读出产物里的所有文本内容（用于「内容级」断言 —— 清单看不见内容差异）。 */
function readArtifactText(dir: string): string {
  if (!existsSync(dir)) return '';
  let text = '';
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) text += readArtifactText(full);
    else if (/\.(mjs|js|html)$/.test(entry.name)) text += readFileSync(full, 'utf-8');
  }
  return text;
}

/**
 * 内容级产物契约（两条，都是「清单比对 + 体积门禁都看不见」的静默失败）。
 *
 * 1. **预渲染 HTML 必须落在本次构建的产物目录里**。`prerender.staticDir` 的默认值曾写死
 *    `'dist/public'`，于是 `--outDir .temp-x` 时客户端产物去 `.temp-x/public`、预渲染 HTML 却写进
 *    `dist/public`。
 * 2. **服务端产物必须内联客户端资产标签**。`virtual:ubean-asset-manifest` 曾有两个提供者，
 *    抢先生效的那份 ref 为空，内联出空标签 —— 生产 HTML 既无客户端入口 `<script>` 也无样式表。
 */
function expectBuildOutputContract(label: string, outDir: string, options: { expectHtml?: boolean } = {}): void {
  const { expectHtml = true } = options;
  const artifacts = listArtifacts(outDir);
  // 预渲染产物只在 `prerender.all` / `routeRules.prerender` 打开时才有：builder 的最小 fixture
  // 没开预渲染，因此那一格只断言「服务端产物内联了资产标签」。
  if (expectHtml) {
    const htmlFiles = artifacts.filter(f => f.endsWith('.html'));
    expect(htmlFiles.length, `${label}：产物目录里应当有预渲染 HTML`).toBeGreaterThan(0);
  }

  const serverText = readArtifactText(join(outDir, 'server'));
  // 标签是经 `JSON.stringify` 内联的，产物里引号是转义形态（`src=\"/assets/…`）—— 两种形态都接受
  expect(/src=\\?"\/assets\//.test(serverText), `${label}：服务端产物应当内联客户端入口 script`).toBe(true);

  // 预渲染 HTML 也必须带上客户端入口（否则静态托管出去的页面不水合）
  if (expectHtml) {
    const htmlText = readArtifactText(join(outDir, 'public'));
    expect(/<script type="module" src="\/assets\//.test(htmlText), `${label}：预渲染 HTML 缺少客户端入口`).toBe(true);
  }
}

/** 跑一次构建并等它退出（构建挂住会在这里超时，本身就是回归）。 */
function build(outDir: string, extraArgs: string[] = [], timeoutMs = 300_000, cwd = fixtureDir): Promise<void> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [cliEntry, 'build', '--outDir', outDir, ...extraArgs], {
      cwd,
      // NODE_ENV 固定：见文件头第 2 条
      env: { ...process.env, NODE_ENV: 'production' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    child.stdout?.on('data', chunk => (output += chunk));
    child.stderr?.on('data', chunk => (output += chunk));
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      rejectRun(new Error(`构建未在 ${timeoutMs}ms 内退出（构建挂住即为回归）\n${output.slice(-2000)}`));
    }, timeoutMs);
    child.once('exit', code => {
      clearTimeout(timer);
      if (code === 0) resolveRun();
      else rejectRun(new Error(`构建失败（exit ${code}）\n${output.slice(-2000)}`));
    });
  });
}

afterAll(cleanup);

describe('构建产物契约（RM-V23 矩阵 / RM-V36 重写）', () => {
  it('默认（fullstack + node）：完整产物 + 内容级契约', async () => {
    if (!existsSync(cliEntry)) {
      throw new Error(`${cliEntry} 不存在：请先构建（pnpm build）再跑 CLI 集成测试`);
    }
    cleanup();
    const outDir = `${OUT}-base`;
    rmSync(join(fixtureDir, outDir), { recursive: true, force: true });

    await build(outDir);

    const artifacts = listArtifacts(join(fixtureDir, outDir));
    expect(artifacts).toContain('manifest.json');
    expect(artifacts).toContain('public/.vite/manifest.json');
    expect(artifacts).toContain('server/server.mjs');
    expect(artifacts).toContain('server/entry.mjs');
    // 岛屿组件整类消失那次就是这个形状：页面在、组件不在
    expect(
      artifacts.some(f => f.includes('IslandClock')),
      '缺少岛屿产物'
    ).toBe(true);
    expectBuildOutputContract('默认（fullstack + node）', join(fixtureDir, outDir));

    // 页面元数据必须进产物：`[id=numeric]` 的 matcher 映射曾只在 dev 生效 —— 产物里的页面表按
    // 白名单序列化，漏了 `matchers` / `slot`，于是 dev 返回 404、生产返回 200。
    const serverText = readArtifactText(join(fixtureDir, outDir, 'server'));
    expect(serverText, '服务端入口的页面表应当带 matcher 映射').toContain('"matchers"');
    expect(serverText).toContain('numeric');

    // Server Components 的隔离（Task 9.1）：`.server.vue` 的实现只能进服务端产物 —— 客户端
    // 只应有通用 stub（元素名 `ubean-server-only`），组件的文案不得出现。
    const clientText = readArtifactText(join(fixtureDir, outDir, 'public'));
    expect(clientText, '服务端组件的实现不应进客户端产物').not.toContain('仅服务端渲染');
    expect(clientText, '客户端产物应当带服务端组件 stub').toContain('ubean-server-only');
  }, 600_000);

  it.each(PRESET_CONTRACTS)(
    'preset $preset：包装文件符合该 preset 契约',
    async ({ preset, wrapper, rootFile }) => {
      const outDir = `${OUT}-preset-${preset}`;
      // worker 目标在最小 fixture 上构建（原因见 `workerFixtureDir` 的说明）
      const cwd = preset === 'cloudflare' ? workerFixtureDir : fixtureDir;
      rmSync(join(cwd, outDir), { recursive: true, force: true });

      await build(outDir, ['--preset', preset], 300_000, cwd);
      const artifacts = listArtifacts(join(cwd, outDir));

      expect(artifacts).toContain(wrapper);
      if (rootFile) expect(artifacts).toContain(rootFile);
      expect(artifacts).toContain('manifest.json');
    },
    600_000
  );

  /**
   * 「无用户 `vite.config.ts`」这一格：CLI 注入全部 builtin 插件。
   *
   * 用**本就没有 `vite.config.ts` 的 fixture**（`packages/builder/test/fixtures/build-project`），
   * 而不是像早先那样把示例的配置临时改名 —— 后者改的是示例项目里的共享文件，在本仓
   * `pnpm -r --parallel test` 下与**示例自己的测试套件并发**，实测出现「单跑绿、全量跑红」的互相干扰。
   *
   * 这一格曾抓到两个真缺陷：漏注册 islands 插件（岛屿整类不进产物）、`virtual:ubean-app` 只在
   * `hasPages` 时注册导致 **backend 模式无配置时直接构建失败**（矩阵的 backend 格有配置、无配置格是
   * fullstack —— 缺的正是两者的交叉）。因此这里 fullstack 与 backend 两种 mode 都跑。
   */
  it('无用户 vite.config：注入 builtin 插件后 fullstack / backend 都能产出完整产物', async () => {
    const fullstackDir = `${OUT}-no-cfg`;
    const backendDir = `${OUT}-no-cfg-backend`;
    rmSync(join(workerFixtureDir, fullstackDir), { recursive: true, force: true });
    rmSync(join(workerFixtureDir, backendDir), { recursive: true, force: true });

    await build(fullstackDir, [], 300_000, workerFixtureDir);
    const fullstackArtifacts = listArtifacts(join(workerFixtureDir, fullstackDir));
    expect(fullstackArtifacts.length, '无 vite.config 时也该产出完整产物').toBeGreaterThan(0);
    expect(fullstackArtifacts).toContain('server/server.mjs');
    expectBuildOutputContract('无配置 fullstack', join(workerFixtureDir, fullstackDir), { expectHtml: false });

    // backend 模式没有页面（无 client 产物、无预渲染 HTML），只断言服务端产物与包装
    await build(backendDir, ['--mode', 'backend'], 300_000, workerFixtureDir);
    const backendArtifacts = listArtifacts(join(workerFixtureDir, backendDir));
    expect(backendArtifacts).toContain('server/server.mjs');
    expect(backendArtifacts).toContain('server/entry.mjs');
  }, 600_000);

  it.each(MODES)(
    '%s：产出该 mode 应有的产物',
    async mode => {
      const outDir = `${OUT}-${mode}`;
      rmSync(join(fixtureDir, outDir), { recursive: true, force: true });

      await build(outDir, ['--mode', mode]);
      const artifacts = listArtifacts(join(fixtureDir, outDir));
      expect(artifacts.length, `${mode} 应当产出产物`).toBeGreaterThan(0);

      if (mode === 'spa') {
        // 纯客户端：只有 public，没有服务端产物、也不预渲染
        expect(artifacts.some(f => f.startsWith('server/'))).toBe(false);
        expect(artifacts).toContain('public/index.html');
      } else if (mode === 'backend') {
        // 纯服务端：只有 server
        expect(artifacts.some(f => f.startsWith('public/'))).toBe(false);
        expect(artifacts).toContain('server/server.mjs');
      } else if (mode === 'ssg') {
        // 静态站点：预渲染 HTML 齐全，服务端产物在预渲染后被清理
        expect(artifacts.some(f => f.endsWith('.html'))).toBe(true);
        expect(artifacts.some(f => f.startsWith('public/assets/'))).toBe(true);
      } else {
        expect(artifacts).toContain('server/server.mjs');
        expectBuildOutputContract('fullstack', join(fixtureDir, outDir));
      }
    },
    600_000
  );
});
