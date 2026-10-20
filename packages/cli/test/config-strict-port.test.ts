/**
 * 配置文件里的 `dev.strictPort` / `dev.open` / `preview.strictPort` 是否真的生效（2026-10 修复）。
 *
 * 三个字段以前的失效方式各不相同，但共同点是**配置文件被 CLI flag 的 citty 默认值永久遮蔽**，
 * 且没有任何报错：
 * - `dev.strictPort`：`UbeanConfig` 里根本没有这个字段（只有 port/host/open），只能靠 `--strictPort`；
 * - `dev.open`：字段存在但全仓无人读，`--open` 也没有消费者；
 * - `preview.strictPort`：`args.strictPort ?? config.preview.strictPort` 恒取到 citty 的 `false`。
 *
 * 这里断言**端到端行为**：给一个被占用的端口 + 配置文件里 `strictPort: true`，CLI 必须退出，
 * 而不是像修之前那样静默递增到下一个端口。
 */
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const fixtureDir = join(repoRoot, 'examples/ubean-test');
const cliEntry = join(repoRoot, 'packages/cli/dist/cli.js');

let cleanup: Array<() => Promise<void>> = [];

afterAll(async () => {
  for (const fn of cleanup.reverse()) await fn().catch(() => {});
  cleanup = [];
});

/**
 * 占住一个端口，返回端口号与释放函数。
 *
 * **必须同时占 `::1` 与 `127.0.0.1`**：Vite / ubean 默认 `host: 'localhost'`，Node 解析到 `::1`
 * （macOS 上 `lookup('localhost')` 的第 1 条是 IPv6），而 `listen(port)` 不传 host 时 Node 绑 `::`
 * 并**带 `IPV6_V6ONLY`** —— 只占 `127.0.0.1` 或只占 `::` 都拦不住 Vite 绑 `::1`，
 * `strictPort` 断言会假绿。这是 `docs/config-to-vite-passthrough.md` §7 记的坑的另一面。
 */
async function occupyPort(): Promise<{ port: number; release: () => Promise<void> }> {
  const listenOn = (host: string, port: number) =>
    new Promise<Server>((resolveListen, rejectListen) => {
      const server = createServer((_req, res) => res.end('busy'));
      server.once('error', rejectListen);
      server.listen(port, host, () => resolveListen(server));
    });

  // 先拿一个空闲端口，再用这个号码同时把两个回环地址占住
  const probe = await listenOn('127.0.0.1', 0);
  const address = probe.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const v6 = await listenOn('::1', port);
  return {
    port,
    release: () =>
      Promise.all([new Promise<void>(r => v6.close(() => r())), new Promise<void>(r => probe.close(() => r()))]).then(
        () => undefined
      )
  };
}

interface Run {
  exitCode: number | null;
  output: string;
  /** 进程在 `timeoutMs` 内主动退出？否则会被杀掉（说明它没有遵守 strictPort）。 */
  exitedOnItsOwn: boolean;
}

/**
 * 跑一次 CLI 子进程，等它退出或超时。
 *
 * 不等端口可达 —— 这里要验的正是「它该退出而不该起服务」，所以只关心退出行为。
 */
async function runCli(args: string[], cwd: string, timeoutMs = 20_000): Promise<Run> {
  const child: ChildProcess = spawn(process.execPath, [cliEntry, ...args], {
    cwd,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  const collect = (chunk: unknown) => (output += String(chunk));
  child.stdout?.on('data', collect);
  child.stderr?.on('data', collect);

  return new Promise<Run>(resolveRun => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolveRun({ exitCode: null, output, exitedOnItsOwn: false });
    }, timeoutMs);
    child.once('exit', code => {
      clearTimeout(timer);
      resolveRun({ exitCode: code, output, exitedOnItsOwn: true });
    });
  });
}

/**
 * 在示例项目的配置上临时注入字段（跑完还原）。
 *
 * 用示例目录而不是 tmpdir：`ubean.config.ts` 里 `import ... from 'ubean'` 要沿 node_modules
 * 向上解析到仓库工作区，系统临时目录解析不到（`preview-cli.test.ts` 头注释记录了这条）。
 */
function withInjectedConfig(project: string, inject: (src: string) => string): () => void {
  const configPath = join(project, 'ubean.config.ts');
  const original = readFileSync(configPath, 'utf-8');
  writeFileSync(configPath, inject(original), 'utf-8');
  return () => writeFileSync(configPath, original, 'utf-8');
}

describe('配置文件里的 server 语义（strictPort）真的生效', () => {
  it('dev：占住端口 + 配置 dev.strictPort: true → 进程退出', async () => {
    if (!existsSync(cliEntry)) throw new Error(`${cliEntry} 不存在：请先构建（pnpm build）`);
    const { port, release } = await occupyPort();
    cleanup.push(release);

    const restore = withInjectedConfig(fixtureDir, src =>
      src.replace(
        'export default defineConfig({',
        `export default defineConfig({\n  dev: { port: ${port}, strictPort: true },`
      )
    );
    cleanup.push(async () => restore());

    // 不传 --strictPort：完全靠配置文件表达
    const run = await runCli(['dev'], fixtureDir);
    expect(run.exitedOnItsOwn, `dev 应该因端口被占而退出，实际仍在运行：\n${run.output}`).toBe(true);
    expect(run.exitCode).not.toBe(0);
  }, 120_000);
});

describe('配置文件里的 preview.strictPort 真的生效', () => {
  it('preview：占住端口 + 配置 preview.strictPort: true → 进程退出', async () => {
    if (!existsSync(cliEntry)) throw new Error(`${cliEntry} 不存在：请先构建（pnpm build）`);
    const { port, release } = await occupyPort();
    cleanup.push(release);

    // preview 不需要真实产物：strictPort 判定在启动服务之前
    const project = join(fixtureDir, '.temp-strictport-preview');
    rmSync(project, { recursive: true, force: true });
    mkdirSync(project, { recursive: true });
    cleanup.push(async () => rmSync(project, { recursive: true, force: true }));
    writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'strictport-preview', type: 'module' }));
    writeFileSync(
      join(project, 'ubean.config.ts'),
      `import { defineConfig } from 'ubean';\n\nexport default defineConfig({\n  mode: 'spa',\n  preview: { port: ${port}, strictPort: true }\n});\n`
    );

    const run = await runCli(['preview'], project);
    expect(run.exitedOnItsOwn, `preview 应该因端口被占而退出，实际仍在运行：\n${run.output}`).toBe(true);
    expect(run.exitCode).not.toBe(0);
  }, 120_000);
});
