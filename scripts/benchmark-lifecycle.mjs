#!/usr/bin/env node
/**
 * ubean dev / build 生命周期性能基准（docs/perf-regression-net.md RM-P01–P05）。
 *
 * 目的：在 **旧路径** 上冻结性能基线，供 Vite 插件化（ADR-0012 / vite-plugin-migration.md）
 * 整改前后对照。RM-V36 双轨收敛后旧实现删除，届时基线将无法再产出。
 *
 * 采集指标：
 * - devColdStart            spawn dev → 首个 SSR 页面响应 200 的墙钟
 * - devChangeServer         写入 API 路由 → 该变更在 HTTP 响应中可见的墙钟
 * - devChangeClient         写入客户端模块 → 该模块重新转换并返回新内容的墙钟
 * - buildWall               build 命令墙钟
 * - buildPeakRss            build 进程树峰值内存（50ms 轮询 ps）
 * - browserHydration        浏览器：导航到 islands 页面 → 首个岛屿水合的墙钟（RM-P07）
 * - browserNavigation       浏览器：首页点击站内链接 → 新页面 DOM 提交的墙钟（RM-P07）
 * - reloadScope             正确性对照（非耗时）：改无关文件触发 reload 后，探针模块的实例
 *                           是否被保留。R3 承诺的是「文件级失效 + 保留单例状态」，
 *                           这里给出旧实现的「是 / 否」，供整改后对照（RM-P04）。
 *
 * 方法（三条纪律，取自 farm.js 的性能工程实践）：
 * 1. 单变量开关 —— 变体之间除被测项外不做任何改动（`--arms` / `--toggle`）；
 * 2. 生效证明 —— 采集前断言被测路径确实生效，否则**直接失败**，避免对比退化成
 *    baseline-vs-baseline（RM-P02）；
 * 3. 前后数字 —— warmup + N 次迭代，报 p50/p95，原始样本落盘，记录运行环境。
 *
 * 用法：
 *   pnpm benchmark:lifecycle                                   # 报告（默认 legacy 臂）
 *   pnpm benchmark:lifecycle -- --runs 5 --warmup 1
 *   pnpm benchmark:lifecycle -- --out examples/ubean-test/benchmarks/perf-baseline.json
 *   pnpm benchmark:lifecycle -- --skip-browser                  # 跳过浏览器运行时指标
 *   pnpm benchmark:lifecycle -- --toggle viteBuilder            # 需 RM-V07+ 落地（见下）
 *
 * 浏览器指标需要 Playwright 的 Chromium（`npx playwright install chromium`）；缺失时
 * 只在报告里标注「不可用」并跳过，不阻塞服务端指标。
 *
 * 本机环境注意：dev server 默认只绑 IPv6 `[::1]`，探针自动选择可用地址；脚本会清除
 * 进程内的代理环境变量，避免 localhost 探针被 http_proxy 拦成 502。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { createBrowserSession, measureHydration, measureNavigation } from './lib/browser-metrics.mjs';
import {
  collectEnvironment,
  delay,
  findFreePort,
  fmtMB,
  fmtMs,
  formatEnvironment,
  killTree,
  pollUntil,
  resolveBaseUrl,
  spawnCaptured,
  startRssSampler,
  summarizeSamples
} from './lib/metrics.mjs';

/* 本地探针不应经过 http_proxy（本机设置了 127.0.0.1:7890，会把 localhost 拦成 502）。 */
for (const key of ['http_proxy', 'https_proxy', 'all_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY']) {
  delete process.env[key];
}

/* -------------------------------------------------------------------------- */
/* 参数                                                                         */
/* -------------------------------------------------------------------------- */

const args = process.argv.slice(2);
function argValue(name, fallback) {
  const i = args.indexOf(name);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : fallback;
}
function argFlag(name) {
  return args.includes(name);
}

const repoRoot = resolve(import.meta.dirname, '..');
const fixture = resolve(repoRoot, argValue('--fixture', 'examples/ubean-test'));
const runs = Math.max(1, parseInt(argValue('--runs', '3'), 10) || 3);
const warmup = Math.max(0, parseInt(argValue('--warmup', '1'), 10) || 0);
const changeTimeoutMs = Math.max(1_000, parseInt(argValue('--change-timeout', '15000'), 10) || 15_000);
const devReadyTimeoutMs = Math.max(5_000, parseInt(argValue('--dev-timeout', '60000'), 10) || 60_000);
const skipDev = argFlag('--skip-dev');
const skipBuild = argFlag('--skip-build');
const skipBrowser = argFlag('--skip-browser');
const jsonOut = argValue('--json', null);
const baselineOut = argValue('--out', null);

/* -------------------------------------------------------------------------- */
/* 被测臂（单变量开关 + 生效证明，RM-P02）                                        */
/* -------------------------------------------------------------------------- */

const ARMS = {
  legacy: {
    label: 'legacy',
    describe: '`ubean dev` 旧编排路径（开关关闭）',
    env: () => ({}),
    /** dev 命令（不传 --port 时由 `startDev` 追加）。 */
    devCommand: () => ['exec', 'ubean', 'dev'],
    /** build 命令（RM-V23：与 dev 臂同构，旧路径走 CLI 编排）。 */
    buildCommand: () => ['exec', 'ubean', 'build'],
    /** 旧路径始终生效，无需断言。 */
    assertEngaged: () => true
  },
  viteBuilder: {
    label: 'viteBuilder',
    describe: '`vp dev` 插件自举路径（experimental.viteBuilder 打开，无 CLI 参与）',
    env: () => ({ UBEAN_VITE_BUILDER: '1' }),
    /**
     * 走 `vp dev` 而不是 `ubean dev`：这是**生效证明**本身 —— 没有 CLI，请求路由与宿主 app
     * 只可能来自插件，因此这一臂的数字必然出自新路径（RM-P02 的要求：不能让两臂都跑在旧
     * 路径上再比出「没差别」的假结论）。旧版的硬失败是因为开关当时不存在。
     */
    devCommand: () => ['exec', 'vp', 'dev'],
    /**
     * build 同理走 `vp build`（RM-V23）：**两条 CLI 路径的构建日志除产物路径字符串外逐行
     * 相同**（实测 diff 过），没有可断言的标记位；而 `vp build` 没有 CLI，服务端产物只可能
     * 来自插件注册的 `builder.buildApp`。这层保障比 dev 臂更硬 —— 实测不带开关的 `vp build`
     * **直接硬失败**（`Cannot resolve entry module index.html`，exit 1，零产物），连退化产物
     * 都产不出来。`assertBuildEngaged` 是第二道防线，防的是插件接线被改动后「仍退出 0 但只出
     * 半套产物」的情况。代价是两臂命令不同（含 pnpm exec 派发），报告脚注里明示，不假装成纯
     * 单变量对比。
     */
    buildCommand: () => ['exec', 'vp', 'build'],
    /**
     * 启动后必须真的能服务应用：新路径未生效时这里会 404（实测过 —— 那时 ubeanPlugin() 还
     * 不含 @vitejs/plugin-vue，且没有插件接管请求），直接中止而不是产出假对比。
     */
    async assertEngaged(baseUrl) {
      const res = await fetch(`${baseUrl}/`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
      const body = res ? await res.text().catch(() => '') : '';
      if (!res || !res.ok || !body.includes('class="home"')) {
        throw new Error(
          [
            `「viteBuilder」臂未生效：${baseUrl}/ 未返回 SSR 页面（status=${res?.status ?? 'n/a'}）。`,
            '',
            '该臂要求 `experimental.viteBuilder` 打开后插件接管 dev（请求路由 + 自举宿主 app）。',
            '若开关或自举能力被改动，此断言会拦下「两臂跑同一路径」的假对比。'
          ].join('\n')
        );
      }
    },
    /**
     * build 臂的第二道防线：这些产物**只有插件路径能产出** —— 开关未生效时 `vp build` 连构建
     * 都跑不起来（见上），但万一接线改成「退出 0 却只出半套产物」，这里会拦下。
     */
    assertBuildEngaged(distDir, violations) {
      if (!existsSync(resolve(distDir, 'manifest.json'))) violations.push('缺少 manifest.json');
      if (!existsSync(resolve(distDir, 'server'))) violations.push('缺少 server/（服务端 bundle）');
      if (countHtmlFiles(distDir) === 0) violations.push('没有预渲染 HTML（该路径会跑 runPrerenderStep）');
    }
  }
};

/** 递归数 HTML 文件（预渲染产物）。 */
function countHtmlFiles(dir) {
  if (!existsSync(dir)) return 0;
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) count += countHtmlFiles(resolve(dir, entry.name));
    else if (entry.name.endsWith('.html')) count += 1;
  }
  return count;
}

function resolveArms() {
  const explicit = argValue('--arms', null);
  const toggle = argValue('--toggle', null);
  let names;
  if (explicit) {
    names = explicit
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  } else if (toggle) {
    names = ['legacy', toggle];
  } else {
    names = ['legacy'];
  }
  for (const name of names) {
    if (!ARMS[name]) {
      throw new Error(`未知的臂 ${JSON.stringify(name)}；可用：${Object.keys(ARMS).join(', ')}`);
    }
  }
  return names;
}

/* -------------------------------------------------------------------------- */
/* dev 指标                                                                     */
/* -------------------------------------------------------------------------- */

const CLIENT_CHANGE_TARGET = 'src/app.ts';
const SERVER_CHANGE_TARGET = 'src/routes/api/hello.ts';
const SERVER_CHANGE_LITERAL = "'Hello from ubean API!'";
/** 探针路由（examples/ubean-test/src/routes/api/perf-probe.ts）暴露模块实例标识。 */
const PROBE_ENDPOINT = '/api/perf-probe';

async function readProbe(dev) {
  try {
    const res = await fetch(`${dev.baseUrl}${PROBE_ENDPOINT}`);
    if (!res.ok) return undefined;
    return await res.json();
  } catch {
    return undefined;
  }
}

async function startDev(arm, port) {
  // --strictPort：端口被占时直接退出，而不是自增到另一个端口让探针白等。
  const devCommand = arm.devCommand ? arm.devCommand() : ['exec', 'ubean', 'dev'];
  const { child, readStdout, readStderr, exited } = spawnCaptured(
    'pnpm',
    [...devCommand, '--port', String(port), '--strictPort'],
    {
      cwd: fixture,
      env: { ...process.env, ...arm.env() }
    }
  );
  const baseUrl = await Promise.race([
    resolveBaseUrl(port, ['::1', '127.0.0.1'], devReadyTimeoutMs),
    exited.then(code => {
      throw new Error(`dev server 提前退出（exit ${code}）\n${readStderr() || readStdout()}`);
    })
  ]);
  if (!baseUrl) {
    killTree(child);
    throw new Error(`dev server 在 ${devReadyTimeoutMs}ms 内不可达（port ${port}）\n${readStderr() || readStdout()}`);
  }
  return { child, readStdout, readStderr, exited, baseUrl };
}

async function stopDev(dev) {
  killTree(dev.child, 'SIGTERM');
  const finished = await Promise.race([dev.exited, delay(5_000).then(() => 'timeout')]);
  if (finished === 'timeout') killTree(dev.child, 'SIGKILL');
}

async function measureColdStart(arm) {
  const port = await findFreePort();
  const started = performance.now();
  const dev = await startDev(arm, port);
  const firstResponse = await pollUntil(`${dev.baseUrl}/`, {
    timeoutMs: devReadyTimeoutMs,
    predicate: ({ res, body }) => res.ok && body.includes('<')
  });
  const coldStartMs = performance.now() - started;
  // 健康判定：dev 起得来不等于页面渲染得出来（见 dev-verify 工作流）。
  const viteClientOk = await pollUntil(`${dev.baseUrl}/@vite/client`, {
    timeoutMs: 10_000,
    predicate: ({ res }) => res.ok
  });
  return { dev, port, coldStartMs, firstResponse, viteClientOk: viteClientOk.ok };
}

/**
 * 服务端变更：写入 API 路由字面量 → 轮询 HTTP 响应是否反映新值。
 *
 * 同一次变更顺带给出 reload 正确性对照：变更前后各读一次探针路由（与被改文件无关），
 * 实例标识不变 ⇒ 探针模块没有被重新求值（保留单例状态）；变了 ⇒ 整个模块图被重新求值。
 * 用同一次 reload 采集两个指标，避免为对照额外制造一次重载。
 */
async function measureServerChange(dev, runIndex) {
  const file = resolve(fixture, SERVER_CHANGE_TARGET);
  const original = readFileSync(file, 'utf8');
  if (!original.includes(SERVER_CHANGE_LITERAL)) {
    throw new Error(`${SERVER_CHANGE_TARGET} 不再包含 ${SERVER_CHANGE_LITERAL}；请同步更新基准探针`);
  }
  const marker = `perf-probe-${Date.now()}-${runIndex}`;
  const probeBefore = await readProbe(dev);
  try {
    writeFileSync(file, original.replace(SERVER_CHANGE_LITERAL, `'${marker}'`));
    const result = await pollUntil(`${dev.baseUrl}/api/hello`, {
      timeoutMs: changeTimeoutMs,
      predicate: ({ body }) => body.includes(marker)
    });
    const probeAfter = await readProbe(dev);
    // 只有这次变更**确实生效**（result.ok）时，实例标识才有判读意义：若重载根本没发生，
    // 实例当然「保留」，那是 baseline-vs-baseline 式的假阴性。
    const comparable = Boolean(probeBefore && probeAfter && result.ok);
    return {
      observed: result.ok,
      latencyMs: result.ok ? result.elapsedMs : null,
      elapsedMs: result.elapsedMs,
      reason: result.ok ? undefined : `${changeTimeoutMs}ms 内 /api/hello 未返回新内容`,
      scope: {
        probeAvailable: comparable,
        instancePreserved: comparable ? probeBefore.instance === probeAfter.instance : null,
        processRestarted: comparable ? probeBefore.pid !== probeAfter.pid : null
      }
    };
  } finally {
    writeFileSync(file, original);
    // 还原后等 dev 侧回到初始状态，避免污染下一轮测量。
    await pollUntil(`${dev.baseUrl}/api/hello`, {
      timeoutMs: 3_000,
      intervalMs: 150,
      predicate: ({ body }) => !body.includes(marker)
    });
  }
}

/**
 * 客户端变更：写入客户端模块 → 该模块被重新转换并返回新内容。
 *
 * 不依赖 Vite 的 stdout 日志（实测不可靠：`[vite] hmr update` 只对已进入 HMR 图的模块
 * 打印，无浏览器连接时通常一条都没有），改为请求模块端点直到新内容出现 —— 确定性信号。
 *
 * **先预热**：改文件之前必须先请求一次该模块，让它进入客户端环境的转换缓存。否则改完之后的
 * 「第一次请求」本来就没有缓存可比，测到的是「首次请求耗时」而不是「失效传播耗时」——
 * 跳过浏览器臂时会稳定地报出个位数毫秒（RM-P05 基线跑过浏览器阶段，恰好预热过，掩盖了这个
 * 缺口；RM-V10 复查时才暴露）。预热同时充当断言：预热响应里**不得**含本次标记，否则说明
 * 上一轮的还原没生效，这一轮的数字无意义。
 */
async function measureClientChange(dev, runIndex) {
  const file = resolve(fixture, CLIENT_CHANGE_TARGET);
  const original = readFileSync(file, 'utf8');
  const marker = `perf-probe-client-${Date.now()}-${runIndex}`;
  const moduleUrl = `${dev.baseUrl}/${CLIENT_CHANGE_TARGET}`;
  try {
    const warm = await pollUntil(moduleUrl, {
      timeoutMs: 5_000,
      intervalMs: 50,
      predicate: ({ res }) => res.ok
    });
    if (!warm.ok) {
      return { observed: false, latencyMs: null, reason: `模块端点预热失败（${CLIENT_CHANGE_TARGET}）` };
    }
    if (warm.lastBody?.includes(marker)) {
      return { observed: false, latencyMs: null, reason: '预热响应已含本轮标记 —— 上一轮还原未生效，测量无意义' };
    }

    writeFileSync(file, `${original}\n// ${marker}\n`);
    const result = await pollUntil(moduleUrl, {
      timeoutMs: changeTimeoutMs,
      predicate: ({ res, body }) => res.ok && body.includes(marker)
    });
    return { observed: result.ok, latencyMs: result.ok ? result.elapsedMs : null, elapsedMs: result.elapsedMs };
  } finally {
    writeFileSync(file, original);
    // 还原后等模块回到初始内容，避免污染下一轮测量。
    await pollUntil(moduleUrl, {
      timeoutMs: 3_000,
      intervalMs: 100,
      predicate: ({ body }) => !body.includes(marker)
    });
  }
}

async function runDevPhase(arm) {
  const samples = { coldStart: [], serverChange: [], clientChange: [], scope: [], hydration: [], navigation: [] };
  const notes = [];
  const total = warmup + runs;

  // 浏览器只在臂内启一次、跨迭代复用；不可用时记 note 并跳过这组指标
  // （不阻塞服务端指标的采集，也不静默隐藏：报告里会显示「不可用」）。
  let session;
  if (!skipBrowser) {
    try {
      session = await createBrowserSession();
    } catch (error) {
      notes.push(
        `浏览器不可用，跳过运行时指标：${error instanceof Error ? error.message : String(error)}（可运行 npx playwright install chromium，或用 --skip-browser 显式跳过）`
      );
    }
  }

  try {
    for (let i = 1; i <= total; i += 1) {
      const isWarmup = i <= warmup;
      const label = isWarmup ? `warmup ${i}/${warmup}` : `run ${i - warmup}/${runs}`;
      process.stdout.write(`  [${arm.label}] dev ${label} ... `);
      const attempt = await measureColdStart(arm);
      try {
        if (!attempt.firstResponse.ok) {
          throw new Error(`首个 SSR 响应未在超时内返回 200`);
        }
        // 生效证明（RM-P02）：拿真实 baseUrl 验证这一臂确实跑在新/旧路径上
        await arm.assertEngaged(attempt.dev.baseUrl);
        if (!attempt.viteClientOk) {
          notes.push('dev 健康检查：/@vite/client 未返回 200（本机曾出现绑定差异，请复核）');
        }
        // 浏览器指标先采：此时服务端还是初始状态，不受后续变更探针影响。
        const hydration = session ? await measureHydration(session, attempt.dev.baseUrl) : { observed: false };
        const navigation = session ? await measureNavigation(session, attempt.dev.baseUrl) : { observed: false };
        const serverChange = await measureServerChange(attempt.dev, i);
        const clientChange = await measureClientChange(attempt.dev, i);
        if (clientChange.reason) notes.push(`客户端变更未测到：${clientChange.reason}`);
        if (serverChange.reason) notes.push(`服务端变更未测到：${serverChange.reason}`);
        const scope = serverChange.scope;
        const scopeLabel =
          scope.instancePreserved === null ? 'n/a' : scope.instancePreserved ? '单例保留' : '模块重新求值';
        const summary = `cold ${fmtMs(attempt.coldStartMs)} · 水合 ${hydration.observed ? fmtMs(hydration.latencyMs) : '未观察到'} · 导航 ${navigation.observed ? fmtMs(navigation.latencyMs) : '未观察到'} · server-change ${serverChange.observed ? fmtMs(serverChange.latencyMs) : '未观察到'} · client-change ${clientChange.observed ? fmtMs(clientChange.latencyMs) : '未观察到'} · reload ${scopeLabel}`;
        console.log(summary);
        if (!isWarmup) {
          samples.coldStart.push(attempt.coldStartMs);
          samples.serverChange.push(serverChange.observed ? serverChange.latencyMs : null);
          samples.clientChange.push(clientChange.observed ? clientChange.latencyMs : null);
          samples.scope.push(scope);
          samples.hydration.push(hydration.observed ? hydration.latencyMs : null);
          samples.navigation.push(navigation.observed ? navigation.latencyMs : null);
        }
      } finally {
        await stopDev(attempt.dev);
      }
    }
  } finally {
    if (session) await session.close();
  }

  return { samples, notes };
}

/* -------------------------------------------------------------------------- */
/* build 指标                                                                   */
/* -------------------------------------------------------------------------- */

async function measureBuild(arm) {
  const started = performance.now();
  const [command, ...commandArgs] = arm.buildCommand();
  const { child, readStdout, readStderr, exited } = spawnCaptured('pnpm', [command, ...commandArgs], {
    cwd: fixture,
    env: { ...process.env, ...arm.env() }
  });
  const sampler = startRssSampler(child.pid, 50);
  const exitCode = await exited;
  const peakRssKB = sampler.stop();
  const wallMs = performance.now() - started;
  return { wallMs, peakRssKB, exitCode, stdout: readStdout(), stderr: readStderr() };
}

async function runBuildPhase(arm) {
  const samples = { buildWall: [], buildPeakRss: [] };
  const total = warmup + runs;
  // 干净产物：两条路径都设 `emptyOutDir: false`，上一臂/上一次的残留会让产物目录累积 ——
  // 这正是「体积断言把残留读成回归」那次的成因（见 vite-plugin-migration.md 的自我更正）。
  const distDir = resolve(fixture, 'dist');
  rmSync(distDir, { recursive: true, force: true });
  for (let i = 1; i <= total; i += 1) {
    const isWarmup = i <= warmup;
    const label = isWarmup ? `warmup ${i}/${warmup}` : `run ${i - warmup}/${runs}`;
    process.stdout.write(`  [${arm.label}] build ${label} ... `);
    const result = await measureBuild(arm);
    if (result.exitCode !== 0) {
      console.error(`FAILED (exit ${result.exitCode})`);
      console.error(result.stderr || result.stdout);
      throw new Error('build 失败，基准中止');
    }
    // RM-P02：第一格构建完成后断言被测路径确实生效（否则两臂可能跑的是同一条路径）
    if (i === 1 && arm.assertBuildEngaged) {
      const violations = [];
      arm.assertBuildEngaged(distDir, violations);
      if (violations.length > 0) {
        console.error('FAILED (生效证明)');
        throw new Error(
          [
            `「${arm.label}」臂的构建未生效：${violations.join('；')}。`,
            '',
            `命令：pnpm ${arm.buildCommand().join(' ')}`,
            '该臂要求插件接管构建（builder.buildApp 产出服务端 bundle 与预渲染 HTML）。',
            '若插件接线被改动，此断言会拦下「两臂跑同一路径」的假对比。'
          ].join('\n')
        );
      }
    }
    console.log(`wall ${fmtMs(result.wallMs)}, peak ${fmtMB(result.peakRssKB)}`);
    if (!isWarmup) {
      samples.buildWall.push(result.wallMs);
      samples.buildPeakRss.push(result.peakRssKB);
    }
  }
  return { samples };
}

/* -------------------------------------------------------------------------- */
/* 报告                                                                         */
/* -------------------------------------------------------------------------- */

function summarizeArm(samples) {
  return {
    devColdStart: summarizeSamples(samples.coldStart),
    browserHydration: summarizeSamples(samples.hydration ?? []),
    browserNavigation: summarizeSamples(samples.navigation ?? []),
    devChangeServer: summarizeSamples(samples.serverChange),
    devChangeClient: summarizeSamples(samples.clientChange),
    buildWall: summarizeSamples(samples.buildWall),
    buildPeakRss: summarizeSamples(samples.buildPeakRss),
    reloadScope: summarizeReloadScope(samples.scope ?? [])
  };
}

/** reload 正确性对照（非耗时）：保留单例状态的次数 / 进程重启次数。 */
function summarizeReloadScope(entries) {
  const usable = entries.filter(entry => entry?.probeAvailable && entry.instancePreserved !== null);
  if (usable.length === 0) {
    return { n: 0, preserved: null, reevaluated: null, processRestarted: null };
  }
  const preserved = usable.filter(entry => entry.instancePreserved).length;
  return {
    n: usable.length,
    preserved,
    reevaluated: usable.length - preserved,
    processRestarted: usable.filter(entry => entry.processRestarted).length
  };
}

function observationRate(samples) {
  if (samples.length === 0) return null;
  const observed = samples.filter(v => v !== null && v !== undefined).length;
  return { observed, total: samples.length };
}

async function main() {
  if (!existsSync(resolve(fixture, 'package.json'))) {
    throw new Error(`fixture 不存在：${fixture}`);
  }

  const armNames = resolveArms();
  const environment = collectEnvironment();

  console.log('Benchmark: ubean dev / build lifecycle');
  console.log(`Fixture:   ${relative(repoRoot, fixture) || fixture}`);
  console.log(`Arms:      ${armNames.map(n => ARMS[n].label).join(', ')}`);
  console.log(`Iterations: warmup ${warmup} + ${runs}（报 p50 / p95）`);
  console.log(`Env:       ${formatEnvironment(environment)}`);
  console.log('');

  const report = { environment, arms: {} };

  for (const name of armNames) {
    const arm = ARMS[name];
    console.log(`── arm ${arm.label}: ${arm.describe}`);
    // RM-P02：带 baseUrl 的生效证明在 `measureColdStart` 之后逐个迭代执行（见 runDevPhase）；
    // build 臂的证明是产物契约断言，在第一格构建后执行（见 runBuildPhase）。

    const armSamples = {
      coldStart: [],
      serverChange: [],
      clientChange: [],
      scope: [],
      hydration: [],
      navigation: [],
      buildWall: [],
      buildPeakRss: []
    };
    const notes = [];

    if (!skipDev) {
      const devPhase = await runDevPhase(arm);
      Object.assign(armSamples, devPhase.samples);
      notes.push(...devPhase.notes);
    }
    if (!skipBuild) {
      const buildPhase = await runBuildPhase(arm);
      armSamples.buildWall = buildPhase.samples.buildWall;
      armSamples.buildPeakRss = buildPhase.samples.buildPeakRss;
    }

    report.arms[name] = {
      label: arm.label,
      describe: arm.describe,
      summary: summarizeArm(armSamples),
      observation: {
        serverChange: observationRate(armSamples.serverChange),
        clientChange: observationRate(armSamples.clientChange),
        hydration: observationRate(armSamples.hydration),
        navigation: observationRate(armSamples.navigation)
      },
      samples: armSamples,
      notes
    };
    console.log('');
  }

  const lines = [];
  lines.push(`| 指标 | ${armNames.map(n => ARMS[n].label).join(' | ')} |`);
  lines.push(`| --- | ${armNames.map(() => '---').join(' | ')} |`);
  const row = (title, key, format, whenSkipped) => {
    lines.push(
      `| ${title} | ${armNames
        .map(n => {
          const metric = report.arms[n].summary[key];
          if (metric.p50 == null) return whenSkipped ?? '未观察到';
          return `${format(metric.p50)}（p95 ${format(metric.p95)}）`;
        })
        .join(' | ')} |`
    );
  };
  // 显式跳过时不要显示成「未观察到」——那会让人误以为是采集失败。
  const browserSkipLabel = skipBrowser ? '跳过（--skip-browser）' : undefined;
  row('dev 冷启动', 'devColdStart', fmtMs);
  row('浏览器 · 首个岛屿水合', 'browserHydration', fmtMs, browserSkipLabel);
  row('浏览器 · 站内导航', 'browserNavigation', fmtMs, browserSkipLabel);
  row('变更生效 · 服务端', 'devChangeServer', fmtMs);
  row('变更生效 · 客户端', 'devChangeClient', fmtMs);
  row('build 墙钟', 'buildWall', fmtMs);
  row('build 峰值内存', 'buildPeakRss', fmtMB);

  const table = lines.join('\n');
  console.log(table);
  console.log('');
  for (const name of armNames) {
    const arm = report.arms[name];
    const sc = arm.observation.serverChange;
    const cc = arm.observation.clientChange;
    const hy = arm.observation.hydration;
    const nv = arm.observation.navigation;
    const scope = arm.summary.reloadScope;
    console.log(
      `观测率 · ${arm.label}: 服务端变更 ${sc ? `${sc.observed}/${sc.total}` : 'n/a'}，客户端变更 ${cc ? `${cc.observed}/${cc.total}` : 'n/a'}，水合 ${skipBrowser ? '跳过' : hy ? `${hy.observed}/${hy.total}` : 'n/a'}，导航 ${skipBrowser ? '跳过' : nv ? `${nv.observed}/${nv.total}` : 'n/a'}`
    );
    console.log(
      `reload 正确性 · ${arm.label}: 单例保留 ${scope.preserved ?? 'n/a'}/${scope.n}，模块重新求值 ${scope.reevaluated ?? 'n/a'}，进程重启 ${scope.processRestarted ?? 'n/a'}`
    );
    for (const note of arm.notes) console.log(`  note: ${note}`);
  }
  console.log('');
  if (!skipBuild && armNames.length > 1) {
    console.log(
      '注：build 两臂的命令不同（legacy `pnpm exec ubean build` vs viteBuilder `pnpm exec vp build`）——\n' +
        '    这是 build 侧唯一的生效证明手段（无 CLI 时服务端产物只可能来自插件），但也把 pnpm/vite\n' +
        '    派发开销算进了差值；dev 侧同理（`ubean dev` vs `vp dev`）。'
    );
    console.log('');
  }

  if (jsonOut) {
    const target = resolve(repoRoot, jsonOut);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`wrote ${target}`);
  }

  if (baselineOut) {
    const target = resolve(repoRoot, baselineOut);
    const baseline = {
      version: 1,
      kind: 'ubean-perf-lifecycle-baseline',
      generatedAt: new Date().toISOString(),
      fixture: relative(repoRoot, fixture).replace(/\\/g, '/'),
      recordedOn: 'legacy',
      note: '在 Vite 插件化（ADR-0012）之前、于旧路径上采集；见 docs/perf-regression-net.md RM-P05。',
      iterations: { warmup, runs },
      environment,
      arms: Object.fromEntries(
        Object.entries(report.arms).map(([key, arm]) => [
          key,
          { summary: arm.summary, observation: arm.observation, notes: arm.notes }
        ])
      )
    };
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
    console.log(`wrote baseline ${target}`);
  }
}

main().catch(error => {
  console.error('');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
