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
 * - devChangeClient         写入客户端模块 → Vite 侧发出更新信号（stdout）的墙钟
 * - buildWall               build 命令墙钟
 * - buildPeakRss            build 进程树峰值内存（50ms 轮询 ps）
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
 *   pnpm benchmark:lifecycle -- --toggle viteBuilder            # 需 RM-V07+ 落地（见下）
 *
 * 本机环境注意：dev server 默认只绑 IPv6 `[::1]`，探针自动选择可用地址；脚本会清除
 * 进程内的代理环境变量，避免 localhost 探针被 http_proxy 拦成 502。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
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
  summarizeSamples,
  waitUntil
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
const jsonOut = argValue('--json', null);
const baselineOut = argValue('--out', null);

/* -------------------------------------------------------------------------- */
/* 被测臂（单变量开关 + 生效证明，RM-P02）                                        */
/* -------------------------------------------------------------------------- */

const ARMS = {
  legacy: {
    label: 'legacy',
    describe: '当前编排：CLI 自建 HTTP server + 宿主 ssrLoadModule + 两次 viteBuild',
    env: () => ({}),
    /** 旧路径始终生效，无需断言。 */
    assertEngaged: () => true
  },
  viteBuilder: {
    label: 'viteBuilder',
    describe: 'Vite 插件优先：插件注册 environments + 自定义 DevEnvironment + 单 createBuilder',
    env: () => ({ UBEAN_EXPERIMENTAL_VITE_BUILDER: '1' }),
    assertEngaged() {
      throw new Error(
        [
          '「viteBuilder」臂暂不可运行：`experimental.viteBuilder` 尚未在 @ubean/config 中实现。',
          '',
          '这是 RM-P02 的**刻意硬失败**。开关不存在时两个臂都会跑在旧路径上，数字接近，',
          '会被误读成「迁移没有性能变化」—— 正是「生效证明」要拦下的假对比。',
          '',
          '落地 RM-V07 / RM-V08（`config` 钩子注册 client 与 ubean environments、自定义',
          'DevEnvironment）后，在此补齐生效断言：构建侧的证据是 environments 注册 + 单次',
          'createBuilder，dev 侧的证据是 env-runner worker 内的 ModuleRunner。',
          '见 docs/vite-plugin-migration.md Phase 1 / Phase 2。'
        ].join('\n')
      );
    }
  }
};

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
const VITE_UPDATE_LOG = /\[vite\][^\n]*(?:hmr update|page reload)\s+(\S+)/;

async function startDev(arm, port) {
  // --strictPort：端口被占时直接退出，而不是自增到另一个端口让探针白等。
  const { child, readStdout, readStderr, exited } = spawnCaptured(
    'pnpm',
    ['exec', 'ubean', 'dev', '--port', String(port), '--strictPort'],
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

/** 服务端变更：写入 API 路由字面量 → 轮询 HTTP 响应是否反映新值 */
async function measureServerChange(dev, runIndex) {
  const file = resolve(fixture, SERVER_CHANGE_TARGET);
  const original = readFileSync(file, 'utf8');
  if (!original.includes(SERVER_CHANGE_LITERAL)) {
    throw new Error(`${SERVER_CHANGE_TARGET} 不再包含 ${SERVER_CHANGE_LITERAL}；请同步更新基准探针`);
  }
  const marker = `perf-probe-${Date.now()}-${runIndex}`;
  try {
    writeFileSync(file, original.replace(SERVER_CHANGE_LITERAL, `'${marker}'`));
    const result = await pollUntil(`${dev.baseUrl}/api/hello`, {
      timeoutMs: changeTimeoutMs,
      predicate: ({ body }) => body.includes(marker)
    });
    return { observed: result.ok, latencyMs: result.ok ? result.elapsedMs : null, elapsedMs: result.elapsedMs };
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

/** 客户端变更：写入客户端模块 → 观察 Vite 侧更新日志（stdout） */
async function measureClientChange(dev, runIndex) {
  const file = resolve(fixture, CLIENT_CHANGE_TARGET);
  const original = readFileSync(file, 'utf8');
  const marker = `perf-probe-client-${Date.now()}-${runIndex}`;
  const seenBefore = dev.readStdout().length;
  try {
    writeFileSync(file, `${original}\n// ${marker}\n`);
    const result = await waitUntil(
      () => {
        const fresh = dev.readStdout().slice(seenBefore);
        return VITE_UPDATE_LOG.test(fresh) || fresh.includes(CLIENT_CHANGE_TARGET);
      },
      { timeoutMs: changeTimeoutMs }
    );
    return { observed: result.ok, latencyMs: result.ok ? result.elapsedMs : null, elapsedMs: result.elapsedMs };
  } finally {
    writeFileSync(file, original);
  }
}

async function runDevPhase(arm) {
  const samples = { coldStart: [], serverChange: [], clientChange: [] };
  const notes = [];
  const total = warmup + runs;

  for (let i = 1; i <= total; i += 1) {
    const isWarmup = i <= warmup;
    const label = isWarmup ? `warmup ${i}/${warmup}` : `run ${i - warmup}/${runs}`;
    process.stdout.write(`  [${arm.label}] dev ${label} ... `);
    const attempt = await measureColdStart(arm);
    try {
      if (!attempt.firstResponse.ok) {
        throw new Error(`首个 SSR 响应未在超时内返回 200`);
      }
      if (!attempt.viteClientOk) {
        notes.push('dev 健康检查：/@vite/client 未返回 200（本机曾出现绑定差异，请复核）');
      }
      const serverChange = await measureServerChange(attempt.dev, i);
      const clientChange = await measureClientChange(attempt.dev, i);
      const summary = `cold ${fmtMs(attempt.coldStartMs)} · server-change ${serverChange.observed ? fmtMs(serverChange.latencyMs) : '未观察到'} · client-change ${clientChange.observed ? fmtMs(clientChange.latencyMs) : '未观察到'}`;
      console.log(summary);
      if (!isWarmup) {
        samples.coldStart.push(attempt.coldStartMs);
        samples.serverChange.push(serverChange.observed ? serverChange.latencyMs : null);
        samples.clientChange.push(clientChange.observed ? clientChange.latencyMs : null);
      }
    } finally {
      await stopDev(attempt.dev);
    }
  }

  return { samples, notes };
}

/* -------------------------------------------------------------------------- */
/* build 指标                                                                   */
/* -------------------------------------------------------------------------- */

async function measureBuild(arm) {
  const started = performance.now();
  const { child, readStdout, readStderr, exited } = spawnCaptured('pnpm', ['exec', 'ubean', 'build'], {
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
    devChangeServer: summarizeSamples(samples.serverChange),
    devChangeClient: summarizeSamples(samples.clientChange),
    buildWall: summarizeSamples(samples.buildWall),
    buildPeakRss: summarizeSamples(samples.buildPeakRss)
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
    // RM-P02：生效证明。失败即中止，绝不产出可用于对比的数字。
    arm.assertEngaged();

    const armSamples = { coldStart: [], serverChange: [], clientChange: [], buildWall: [], buildPeakRss: [] };
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
        clientChange: observationRate(armSamples.clientChange)
      },
      samples: armSamples,
      notes
    };
    console.log('');
  }

  const lines = [];
  lines.push(`| 指标 | ${armNames.map(n => ARMS[n].label).join(' | ')} |`);
  lines.push(`| --- | ${armNames.map(() => '---').join(' | ')} |`);
  const row = (title, key, format) => {
    lines.push(
      `| ${title} | ${armNames
        .map(n => {
          const metric = report.arms[n].summary[key];
          if (metric.p50 == null) return '未观察到';
          return `${format(metric.p50)}（p95 ${format(metric.p95)}）`;
        })
        .join(' | ')} |`
    );
  };
  row('dev 冷启动', 'devColdStart', fmtMs);
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
    console.log(
      `观测率 · ${arm.label}: 服务端变更 ${sc ? `${sc.observed}/${sc.total}` : 'n/a'}，客户端变更 ${cc ? `${cc.observed}/${cc.total}` : 'n/a'}`
    );
    for (const note of arm.notes) console.log(`  note: ${note}`);
  }
  console.log('');

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
