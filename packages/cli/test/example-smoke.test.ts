/**
 * 示例项目的「产物 + 可服务」冒烟（TS-11）。
 *
 * 覆盖 `examples/` 下三个**有独立构建形态**的示例。它们此前完全在 CI 之外：`pnpm test`
 * 跑的是各包的 `vp test`，而示例目录里只有 `ubean-test` 有测试文件，另外三个示例
 * （`frontend-only` / `routing-file-mode` / `ssg-catchall`）既没有测试，也没有任何 job
 * 构建它们 —— 也就是说，它们的 `ubean.config.ts` 写错、路由扫不出来、SSG catch-all 的
 * chunk 打不出来，CI 都不会红。本文件把「构建成功 + 产物内容 + 关键路径可服务」钉住。
 *
 * 为什么放在 `packages/cli/test/`：这里已经有两个同类 harness（`build-contracts.test.ts`
 * / `preview-cli.test.ts`），都用**已构建的** `packages/cli/dist/cli.js` 起真实进程，且
 * `packages/cli/vite.config.ts` 里 `fileParallelism: false` —— 三个示例各起一次构建 + 一次
 * preview，必须串行，避免端口与磁盘产物互相踩。
 *
 * 四条纪律（与 `docs/test.md` §1 一致）：
 * 1. **只测产物与响应，不读配置回显**：断言的是「构建退出码 + 磁盘上的文件 + 请求的状态码
 *    与正文片段」，不是「CLI 打印了什么配置」。
 * 2. **产物存在 ≠ 产物可用**：所以每个示例都额外起一次 `ubean preview` 真发请求。
 * 3. **构建到 `.temp-build`，绝不写示例的 `dist/`**：`dist` 是仓库里提交过的陈旧产物
 *    （实测 `ssg-catchall/dist` 只有 19 个 `index.html`、没有 `search/`、没有
 *    `__search.json`），在它上面断言等于测上一个版本。`.temp-build*` 已被 `.gitignore` 忽略。
 * 4. **preview 必须带 `--outDir .temp-build`**：不带的话 preview 服务的是配置里的
 *    `build.outputDir`（= `dist`），于是「源码正确、产物陈旧」会被误判成 404（此前踩过）。
 *
 * 两个环境事实（实测，写进断言里）：
 * - `ubean preview` **只监听 IPv6 `::1`**，`127.0.0.1` 直接拒连。所以探测必须按
 *   `['::1', '127.0.0.1']` 顺序取第一个可达者（与 `preview-cli.test.ts:76-80` 同形）。
 * - ssg-catchall 的 catch-all chunk 文件名带内容 hash（`_...slug_-XXXXXXXX.js`），**每次构建都变**，
 *   且预渲染 HTML 里**不引用**它们（HTML 只引 `/assets/app-*.js`）。所以按前缀 glob，
 *   永远不要断言确切文件名。
 */
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// TS-37：端口 / 进程 / 就绪探测收敛到共用 harness
import { findFreePort, resolveBaseUrl, stopChild } from './helpers/cli-harness';

const repoRoot = resolve(import.meta.dirname, '../../..');
const cliEntry = join(repoRoot, 'packages/cli/dist/cli.js');
/** 构建输出目录。`.gitignore` 第 58 行 `.temp-build*` 已忽略；不要换成 `.temp-out`（未忽略）。 */
const OUT = '.temp-build';
const BUILD_TIMEOUT_MS = 300_000;
const PREVIEW_TIMEOUT_MS = 120_000;

interface Running {
  child: ChildProcess;
  baseUrl: string;
  output: () => string;
}

interface Probe {
  status: number;
  contentType: string;
  body: string;
}

function exampleDir(name: string): string {
  return join(repoRoot, 'examples', name);
}

function outDir(name: string): string {
  return join(exampleDir(name), OUT);
}

/**
 * 用**已构建的** CLI 把示例构建到 `.temp-build`。
 *
 * `NODE_ENV: 'production'` 是刻意的：`NODE_ENV=test` 会让 Vue 走 dev 运行时，产物体积与
 * 内容都不同（`build-contracts.test.ts` / `build-errors.test.ts` 同口径）。
 */
async function buildExample(name: string): Promise<{ code: number; output: string }> {
  const dir = exampleDir(name);
  expect(existsSync(cliEntry), `${cliEntry} 不存在：请先构建（pnpm build）再跑 CLI 集成测试`).toBe(true);
  rmSync(outDir(name), { recursive: true, force: true });

  return new Promise((resolveBuild, rejectBuild) => {
    let output = '';
    const proc = spawn(process.execPath, [cliEntry, 'build', '--outDir', OUT], {
      cwd: dir,
      env: { ...process.env, NODE_ENV: 'production' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    proc.stdout?.on('data', chunk => (output += String(chunk)));
    proc.stderr?.on('data', chunk => (output += String(chunk)));
    const timer = setTimeout(() => proc.kill('SIGKILL'), BUILD_TIMEOUT_MS);
    proc.once('error', error => {
      clearTimeout(timer);
      rejectBuild(error);
    });
    proc.once('exit', code => {
      clearTimeout(timer);
      resolveBuild({ code: code === null ? -1 : code, output });
    });
  });
}

async function startPreview(name: string): Promise<Running> {
  const dir = exampleDir(name);
  const port = await findFreePort({ base: 20_000 });
  const child = spawn(
    process.execPath,
    [cliEntry, 'preview', '--port', String(port), '--strictPort', '--outDir', OUT],
    { cwd: dir, env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  let output = '';
  child.stdout?.on('data', chunk => (output += String(chunk)));
  child.stderr?.on('data', chunk => (output += String(chunk)));

  try {
    const baseUrl = await resolveBaseUrl(port, {
      timeoutMs: PREVIEW_TIMEOUT_MS,
      child,
      output: () => output
    });
    return { child, baseUrl, output: () => output };
  } catch (error) {
    await stopChild(child);
    throw error;
  }
}

async function stopPreview(running: Running | null): Promise<void> {
  await stopChild(running?.child);
}

async function get(running: Running, path: string): Promise<Probe> {
  const res = await fetch(running.baseUrl + path, { signal: AbortSignal.timeout(15_000) });
  return {
    status: res.status,
    contentType: res.headers.get('content-type') ?? '',
    body: await res.text()
  };
}

function listDir(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir) : [];
}

// ─────────────────────────── frontend-only ───────────────────────────

describe('示例冒烟：frontend-only（无后端路径的纯前端形态）', () => {
  const NAME = 'frontend-only';
  let build: { code: number; output: string };
  let running: Running | null = null;

  beforeAll(async () => {
    build = await buildExample(NAME);
    if (build.code === 0) running = await startPreview(NAME);
  }, BUILD_TIMEOUT_MS + PREVIEW_TIMEOUT_MS);

  afterAll(async () => {
    await stopPreview(running);
    running = null;
    rmSync(outDir(NAME), { recursive: true, force: true });
  });

  it('构建成功并产出 node 预设的完整产物树', () => {
    expect(build.output, `frontend-only 构建失败：\n${build.output}`).toContain('Build complete for preset "node"!');
    expect(build.code).toBe(0);

    const root = outDir(NAME);
    expect(existsSync(join(root, 'server', 'server.mjs')), 'node 预设的启动入口').toBe(true);
    expect(existsSync(join(root, 'server', 'entry.mjs')), 'SSR/服务端 handler 入口').toBe(true);
    expect(existsSync(join(root, 'server', 'package.json')), '服务端包的 type 声明').toBe(true);
    expect(existsSync(join(root, 'manifest.json')), '构建清单').toBe(true);
    expect(existsSync(join(root, 'public', 'favicon.svg')), '示例自带 favicon 应被复制进产物').toBe(true);

    // fullstack 形态下**没有** `public/index.html`：HTML 由生产 handler 在请求时渲染
    // （只有 spa/ssg 才会把壳写成文件）。这里刻意不断言它，避免把 SSR 形态误当静态站点。
    expect(existsSync(join(root, 'public', 'index.html')), 'fullstack 不产出静态 HTML 壳').toBe(false);
    expect(existsSync(join(root, 'public', '.vite', 'manifest.json')), '客户端资源清单').toBe(true);

    const assets = listDir(join(root, 'public', 'assets'));
    expect(assets.length, '客户端资源不应为空').toBeGreaterThan(0);
    // 客户端入口 chunk 必须存在，否则浏览器侧根本挂不起来
    expect(
      assets.some(name => name.startsWith('app-') && name.endsWith('.js')),
      `客户端入口 chunk：${assets.join(', ')}`
    ).toBe(true);
  });

  it('预渲染页面可服务，正文来自各自的页面组件', async () => {
    expect(running, '构建失败时 preview 未启动').not.toBeNull();

    const home = await get(running!, '/');
    expect(home.status).toBe(200);
    expect(home.body).toContain('class="home"');
    expect(home.body).toContain('ubean frontend-only - 首页');

    const about = await get(running!, '/about');
    expect(about.status).toBe(200);
    expect(about.body).toContain('class="about"');

    // 动态段页面：`/users/[id]` 必须由产物里的路由表解析出参数，而不是回落到 404
    const user = await get(running!, '/users/42');
    expect(user.status).toBe(200);
    expect(user.body).toContain('class="user-page"');
    expect(user.body).toContain('42');
  });

  it('未知路径 404（没有后端兜底时也不能静默 200）', async () => {
    const missing = await get(running!, '/nope-404');
    expect(missing.status).toBe(404);
  });
});

// ──────────────────────── routing-file-mode ────────────────────────

describe('示例冒烟：routing-file-mode（路由数据以实体文件生成）', () => {
  const NAME = 'routing-file-mode';
  let build: { code: number; output: string };
  let running: Running | null = null;

  beforeAll(async () => {
    build = await buildExample(NAME);
    if (build.code === 0) running = await startPreview(NAME);
  }, BUILD_TIMEOUT_MS + PREVIEW_TIMEOUT_MS);

  afterAll(async () => {
    await stopPreview(running);
    running = null;
    rmSync(outDir(NAME), { recursive: true, force: true });
  });

  it('构建触发 onGenerated，且生成物是「真的路由表」而非空壳', () => {
    expect(build.code, `routing-file-mode 构建失败：\n${build.output}`).toBe(0);
    expect(build.output).toContain('[routing-file-mode] Generated route files:');

    const generated = join(exampleDir(NAME), 'src', 'router', '_generated');
    expect(existsSync(join(generated, 'routes.ts')), 'routes.ts 应被生成').toBe(true);
    expect(existsSync(join(generated, 'imports.ts')), 'imports.ts 应被生成').toBe(true);

    const routes = readFileSync(join(generated, 'routes.ts'), 'utf8');
    expect(routes).toContain("path: '/about'");
    expect(routes).toContain("path: '/users/:id'");
    // 文件模式的意义是「路由与组件加载器都落到实体文件」，所以 views 映射必须存在
    const imports = readFileSync(join(generated, 'imports.ts'), 'utf8');
    expect(imports).toContain('export const views');
    expect(imports).toContain('@/pages/index.vue');
  });

  it('文件模式生成的产物可服务：页面 + 动态段 + API', async () => {
    expect(running, '构建失败时 preview 未启动').not.toBeNull();

    const home = await get(running!, '/');
    expect(home.status).toBe(200);
    expect(home.body).toContain('class="home"');
    expect(home.body).toContain('routing-file-mode - 首页');

    const about = await get(running!, '/about');
    expect(about.status).toBe(200);
    expect(about.body).toContain('class="about"');

    const user = await get(running!, '/users/42');
    expect(user.status).toBe(200);
    expect(user.body).toContain('class="user-page"');

    // API 路由是 `src/routes/api/hello.ts`（void 风格命名导出），产物里必须真的走 handler：
    // 静态目录里不存在 `/api/hello`，200 + JSON 只可能来自生产 handler。
    const api = await get(running!, '/api/hello');
    expect(api.status).toBe(200);
    expect(api.contentType).toContain('application/json');
    expect(api.body).toContain('Hello from routing-file-mode');
    expect(api.body).toContain('"mode":"file"');
  });

  it('未知路径 404', async () => {
    const missing = await get(running!, '/nope');
    expect(missing.status).toBe(404);
  });
});

// ─────────────────────────── ssg-catchall ───────────────────────────

describe('示例冒烟：ssg-catchall（SSG catch-all 的 chunk 必须可被静态服务器取出）', () => {
  const NAME = 'ssg-catchall';
  let build: { code: number; output: string };
  let running: Running | null = null;

  beforeAll(async () => {
    build = await buildExample(NAME);
    if (build.code === 0) running = await startPreview(NAME);
  }, BUILD_TIMEOUT_MS + PREVIEW_TIMEOUT_MS);

  afterAll(async () => {
    await stopPreview(running);
    running = null;
    rmSync(outDir(NAME), { recursive: true, force: true });
  });

  it('预渲染出完整静态站点（无 server 目录），并生成搜索索引', () => {
    expect(build.code, `ssg-catchall 构建失败：\n${build.output}`).toBe(0);
    expect(build.output).toMatch(/Prerendered \d+ routes/);
    expect(build.output).toContain('Search: wrote __search.json');

    const root = outDir(NAME);
    // SSG 的产物形态就是纯静态：`server/` 会被清理掉（`ubean build` 的 SSG 分支）
    expect(existsSync(join(root, 'server')), 'SSG 不应留下服务端入口').toBe(false);
    expect(existsSync(join(root, 'public', 'index.html'))).toBe(true);
    expect(existsSync(join(root, 'public', '404.html'))).toBe(true);
    expect(existsSync(join(root, 'public', 'pagefind')), 'pagefind 索引目录').toBe(true);

    const searchIndex = join(root, 'public', '__search.json');
    expect(existsSync(searchIndex)).toBe(true);
    // 索引形态是 { content: [{ id, title, level, content }] }（由 useContentSearch 消费）
    const parsed = JSON.parse(readFileSync(searchIndex, 'utf8')) as { content?: unknown };
    const entries = Array.isArray(parsed.content) ? parsed.content : [];
    expect(entries.length, '__search.json 应有条目').toBeGreaterThan(0);
    expect(
      entries.some(entry => typeof (entry as { id?: unknown }).id === 'string'),
      '每条索引项应有 id'
    ).toBe(true);

    // 显式 include 的路径必须各自有 HTML
    expect(existsSync(join(root, 'public', 'ui', 'components', 'button', 'index.html'))).toBe(true);
  });

  it('catch-all 的按名 chunk 确实存在于产物（本示例存在的理由）', () => {
    const chunks = listDir(join(outDir(NAME), 'public', 'assets', 'chunks'));
    // 文件名带内容 hash，每次构建都变 ⇒ 只能按前缀匹配
    const slugChunks = chunks.filter(name => name.startsWith('_...slug_-') && name.endsWith('.js'));
    expect(slugChunks.length, `catch-all 路由应产出按名 chunk：${chunks.join(', ')}`).toBeGreaterThanOrEqual(3);
  });

  it('预渲染页、catch-all 页与搜索索引都可服务', async () => {
    expect(running, '构建失败时 preview 未启动').not.toBeNull();

    expect((await get(running!, '/')).status).toBe(200);

    const search = await get(running!, '/search');
    expect(search.status).toBe(200);
    expect(search.body).toContain('>Search<');

    // catch-all 的两棵子树：`ui/[...slug]` 与顶层 `[...slug]`
    const button = await get(running!, '/ui/components/button');
    expect(button.status).toBe(200);
    expect(button.body).toContain('class="page-title"');

    const guide = await get(running!, '/guide/components');
    expect(guide.status).toBe(200);

    const playground = await get(running!, '/playground');
    expect(playground.status).toBe(200);
    expect(playground.body).toContain('class="page-path"');

    // i18n 前缀策略（prefix_except_default）：非默认语言带前缀
    expect((await get(running!, '/zh/')).status).toBe(200);

    const searchJson = await get(running!, '/__search.json');
    expect(searchJson.status).toBe(200);
    expect(searchJson.contentType).toContain('application/json');

    expect((await get(running!, '/pagefind/pagefind.js')).status).toBe(200);
  });

  it('catch-all 的 chunk 文件本身可被静态服务器取出（产物存在 ≠ 可服务）', async () => {
    expect(running, '构建失败时 preview 未启动').not.toBeNull();
    const chunks = listDir(join(outDir(NAME), 'public', 'assets', 'chunks'));
    const slugChunks = chunks.filter(name => name.startsWith('_...slug_-') && name.endsWith('.js'));
    expect(slugChunks.length).toBeGreaterThanOrEqual(3);

    for (const name of slugChunks) {
      const res = await get(running!, `/assets/chunks/${name}`);
      expect(res.status, `${name} 应可访问`).toBe(200);
      expect(res.contentType, `${name} 的 MIME`).toContain('javascript');
    }
  });

  it('不存在的路径 404，且路径穿越被拒', async () => {
    const missing = await get(running!, '/nope-not-here');
    expect(missing.status).toBe(404);

    // 预览静态服务器不能把 `/../` 解成仓库外的文件
    const traversal = await fetch(`${running!.baseUrl}/../etc/passwd`, {
      signal: AbortSignal.timeout(15_000),
      redirect: 'manual'
    });
    expect(traversal.status, '路径穿越必须被拒').toBe(404);
  });
});

// ──────────────────────── platform-drivers ────────────────────────

describe('示例目录定性：platform-drivers 是代码片段集，不是可运行示例', () => {
  const dir = exampleDir('platform-drivers');

  it('目录里没有可运行示例的骨架（无 package.json / 无 ubean.config.ts / 无 src）', () => {
    // 这个「负向断言」是刻意的：只要有人把它补成真示例，这条就会红，提醒把本文件的
    // 定性说明与 `docs/test.md` 的 TS-11 记录一起更新 —— 避免文档与目录长期不一致。
    expect(existsSync(join(dir, 'package.json')), 'platform-drivers 目前不是可运行示例').toBe(false);
    expect(existsSync(join(dir, 'ubean.config.ts'))).toBe(false);
    expect(existsSync(join(dir, 'src'))).toBe(false);
  });

  it('README 明确标注「代码片段集，非示例」', () => {
    const readme = join(dir, 'README.md');
    expect(existsSync(readme)).toBe(true);
    expect(readFileSync(readme, 'utf8')).toContain('代码片段集，非示例');
  });
});
