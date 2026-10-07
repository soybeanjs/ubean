#!/usr/bin/env node
/**
 * SSR 吞吐基准（RPS）—— 补齐九项生命周期口径之外的服务器侧指标。
 *
 * 背景：`docs/perf-regression-net.md` 的九项口径里没有服务器吞吐，而对外比较时
 * 「hello-world / 内容页 SSR 每秒能扛多少请求」是竞品公开数据里最常见的一列
 * （pausanchez 的 SSR 横评、rickbergfalk/ssr-framework-benchmarks 都用 `ab`）。
 * 本脚本用**同一台机器 + 同一把尺子**补上这一列，避免拿框架自己的营销数字对比。
 *
 * 口径（与 rickbergfalk/ssr-framework-benchmarks 对齐的部分）：
 * - 压测器：ApacheBench（`ab`），macOS/Linux 自带；默认**不开 keep-alive**（与 ab 默认一致）
 * - 主指标：并发 1 的 Requests per second（该仓库的默认口径）
 * - 附指标：并发 10 的吞吐（观察放大效应）
 *
 * 生效证明（RM-P02）：构建时强制 `--no-prerender`，并断言 `dist/public` 下没有 HTML ——
 * 否则 preview 会直接吐预渲染静态文件，量到的是静态服务器的 RPS（实测 4000+，虚高），
 * 而不是 Vue SSR 的渲染成本。
 *
 * 用法：
 *   node scripts/benchmark-ssr.mjs                                   # 默认 fixture + 路由 /
 *   node scripts/benchmark-ssr.mjs --fixture .tmp-bench-medium
 *   node scripts/benchmark-ssr.mjs --route /doc/page-1 --runs 3 --concurrency 1,10,50
 *   node scripts/benchmark-ssr.mjs --json examples/ubean-test/benchmarks/perf-ssr.json
 */
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  collectEnvironment,
  delay,
  findFreePort,
  formatEnvironment,
  killTree,
  median,
  pollUntil,
  spawnCaptured
} from './lib/metrics.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = resolve(import.meta.dirname, '..');

function argValue(name, fallback) {
  const args = process.argv.slice(2);
  const i = args.indexOf(name);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : fallback;
}

const fixture = resolve(repoRoot, argValue('--fixture', 'examples/ubean-test'));
const route = argValue('--route', '/');
const runs = Math.max(1, parseInt(argValue('--runs', '3'), 10) || 3);
const requests = Math.max(100, parseInt(argValue('--requests', '3000'), 10) || 3000);
const concurrencyList = argValue('--concurrency', '1,10')
  .split(',')
  .map(s => Math.max(1, parseInt(s.trim(), 10) || 1));
const jsonOut = argValue('--json', null);

/** 递归数 HTML 文件（生效证明用：必须为 0，否则量到的是静态产物）。 */
function countHtmlFiles(dir) {
  if (!existsSync(dir)) return 0;
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) count += countHtmlFiles(resolve(dir, entry.name));
    else if (entry.name.endsWith('.html')) count += 1;
  }
  return count;
}

/** 解析 ab 输出。 */
function parseAbOutput(stdout) {
  const grab = pattern => {
    const m = pattern.exec(stdout);
    return m ? Number(m[1]) : null;
  };
  return {
    rps: grab(/Requests per second:\s+([\d.]+)/),
    meanMs: grab(/Time per request:\s+([\d.]+)\s+\[ms\] \(mean\)/),
    // ab 会两次打印 "Time per request"（第二次是 across all concurrent requests），
    // 上面那条正则非全局，取到的是第一次 = 单请求平均延迟。
    p95Ms: grab(/\s+95%\s+(\d+)/),
    p99Ms: grab(/\s+99%\s+(\d+)/),
    failed: grab(/Failed requests:\s+(\d+)/),
    non2xx: grab(/Non-2xx responses:\s+(\d+)/)
  };
}

async function runAb(url, concurrency, total, quiet) {
  const args = ['-n', String(total), '-c', String(concurrency)];
  if (quiet) args.push('-q');
  args.push(url);
  const { stdout } = await execFileAsync('ab', args, { maxBuffer: 16 * 1024 * 1024 });
  return parseAbOutput(stdout);
}

async function main() {
  if (!existsSync(resolve(fixture, 'package.json'))) throw new Error(`fixture 不存在：${fixture}`);
  try {
    await execFileAsync('ab', ['-V']);
  } catch {
    throw new Error(
      '未找到 ApacheBench（ab）。macOS/Linux 自带：macOS 在 /usr/sbin/ab；Debian 系 apt install apache2-utils。'
    );
  }

  const environment = collectEnvironment();
  console.log('Benchmark: SSR throughput (ApacheBench, no keep-alive by default)');
  console.log(`Fixture:   ${relative(repoRoot, fixture) || fixture}`);
  console.log(`Route:     ${route}`);
  console.log(`Runs:      ${runs} × ${requests} requests @ concurrency ${concurrencyList.join(', ')}`);
  console.log(`Env:       ${formatEnvironment(environment)}`);
  console.log('');

  // 生效证明前置条件：构建必须不带预渲染，否则 preview 直接吐静态 HTML。
  console.log('Building (fullstack, --no-prerender) ...');
  const buildExit = await new Promise(resolve_ => {
    const child = spawn('pnpm', ['exec', 'ubean', 'build', '--mode', 'fullstack', '--no-prerender'], {
      cwd: fixture,
      stdio: 'inherit'
    });
    child.on('exit', resolve_);
  });
  if (buildExit !== 0) throw new Error(`build 失败（exit ${buildExit}）`);

  const htmlCount = countHtmlFiles(resolve(fixture, 'dist/public'));
  if (htmlCount > 0) {
    throw new Error(
      `生效证明失败：构建产物里仍有 ${htmlCount} 个 HTML —— preview 会返回预渲染静态文件，` +
        'RPS 会虚高（静态服务 vs SSR 渲染）。请确认 --no-prerender 生效。'
    );
  }

  const port = await findFreePort({ additionalOffsets: [] });
  console.log(`\nStarting preview on 127.0.0.1:${port} ...`);
  const { child, readStderr, readStdout, exited } = spawnCaptured(
    'pnpm',
    ['exec', 'ubean', 'preview', '--port', String(port), '--host', '127.0.0.1', '--strictPort'],
    { cwd: fixture }
  );

  const url = `http://127.0.0.1:${port}${route}`;
  let samples = [];
  try {
    const ready = await Promise.race([
      pollUntil(url, { timeoutMs: 60_000, intervalMs: 100, predicate: ({ res }) => res.ok }),
      exited.then(code => {
        throw new Error(`preview 提前退出（exit ${code}）\n${readStderr() || readStdout()}`);
      })
    ]);
    if (!ready.ok) {
      throw new Error(`preview 在 60s 内未就绪\n${readStderr() || readStdout()}`);
    }
    // 响应里必须真的是 SSR 内容（拿不到就说明路由没渲染出页面）。
    const probe = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const probeBody = await probe.text();
    if (!probe.ok || !probeBody.includes('<')) {
      throw new Error('生效证明失败：探测响应不是 HTML 页面');
    }
    console.log(`  SSR 生效证明通过（无预渲染 HTML，响应 ${probe.status}，${probeBody.length} 字节）`);

    console.log('  warmup ...');
    for (let i = 0; i < 3; i += 1) await runAb(url, 1, Math.min(500, requests), true);

    for (const concurrency of concurrencyList) {
      for (let i = 1; i <= runs; i += 1) {
        const result = await runAb(url, concurrency, requests, false);
        if (result.failed) throw new Error(`ab 报告 ${result.failed} 个失败请求（c=${concurrency}）`);
        samples.push({ concurrency, run: i, ...result });
        console.log(
          `  [c=${concurrency}] run ${i}/${runs} ... ${result.rps?.toFixed(1)} rps, ` +
            `${result.meanMs?.toFixed(2)} ms/req (p95 ${result.p95Ms ?? '—'} ms)`
        );
        await delay(200);
      }
    }
  } finally {
    killTree(child, 'SIGTERM');
    await Promise.race([exited, delay(5_000)]);
    killTree(child, 'SIGKILL');
  }

  const summary = concurrencyList.map(concurrency => {
    const group = samples.filter(s => s.concurrency === concurrency);
    return {
      concurrency,
      rps: median(group.map(s => s.rps).filter(v => v != null)),
      meanMs: median(group.map(s => s.meanMs).filter(v => v != null)),
      p95Ms: median(group.map(s => s.p95Ms).filter(v => v != null)),
      p99Ms: median(group.map(s => s.p99Ms).filter(v => v != null))
    };
  });

  const report = [
    '# ubean SSR 吞吐基准（ApacheBench）',
    '',
    `- Fixture: \`${relative(repoRoot, fixture) || fixture}\` · 路由 \`${route}\``,
    `- 构建：\`ubean build --mode fullstack --no-prerender\`（无预渲染，确保量到的是 SSR 渲染）`,
    `- 压测：\`ab -n ${requests} -c <concurrency>\`，无 keep-alive；${runs} 轮取中位数`,
    `- 环境：${formatEnvironment(environment)}`,
    '',
    '| 并发 | RPS（中位数） | 平均延迟 | p95 | p99 |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...summary.map(
      s =>
        `| ${s.concurrency} | **${s.rps?.toFixed(1) ?? '—'}** | ${s.meanMs?.toFixed(2) ?? '—'} ms | ${s.p95Ms ?? '—'} ms | ${s.p99Ms ?? '—'} ms |`
    ),
    '',
    '> 口径警示：RPS 与硬件、页面复杂度、压测器强相关，跨机器数值不可直接比较。',
    '> 本表用于「同机回归」与「量级定位」，对外引用时需一并给出页面与机器规格。',
    ''
  ].join('\n');

  console.log('');
  console.log(report);

  if (jsonOut) {
    const target = resolve(repoRoot, jsonOut);
    const payload = {
      version: 1,
      kind: 'ubean-perf-ssr-throughput',
      generatedAt: new Date().toISOString(),
      fixture: relative(repoRoot, fixture).replace(/\\/g, '/'),
      route,
      requests,
      runs,
      tool: 'ab',
      keepAlive: false,
      environment,
      summary,
      samples
    };
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    console.log(`wrote ${target}`);
  }
}

main().catch(error => {
  console.error('');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
