/**
 * 裸 `vite build` 的端到端验收（RM-V31，ADR-0012 的目标形态）。
 *
 * 三条裸命令里 `vite dev`（`dev-reload.test.ts`）与 `vite preview`（`preview-vite.test.ts`）已有
 * 用例；**`vite build` 一直只有口述证据**。这里把它补齐，且判据不是「退出 0」而是**产物完整**：
 * 服务端 bundle、预渲染 HTML、客户端入口 script 三者必须都在 —— 缺任何一项都是「构建成功但产物
 * 不可用」，而这一类失败在退出码上看不出来（本轮已两次踩到：资产标签内联为空、预渲染 HTML 落到
 * 另一个目录）。
 *
 * `vite build` 不接受 `--outDir`（`--outDir` 是 ubean CLI 的参数，实测被忽略），因此这里构建到
 * 示例项目的默认 `dist`，跑完用默认路径重建一次，保持 `analyze:check` 面对的产物形态不变。
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const fixtureDir = join(repoRoot, 'examples/ubean-test');
const vpEntry = join(repoRoot, 'node_modules/.bin/vp');
const cliEntry = join(repoRoot, 'packages/cli/dist/cli.js');

function run(command: string, args: string[], env: Record<string, string> = {}): Promise<string> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: fixtureDir,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    child.stdout?.on('data', chunk => (output += chunk));
    child.stderr?.on('data', chunk => (output += chunk));
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      rejectRun(new Error(`命令未在 300s 内退出：${command} ${args.join(' ')}\n${output.slice(-2000)}`));
    }, 300_000);
    child.once('exit', code => {
      clearTimeout(timer);
      if (code === 0) resolveRun(output);
      else rejectRun(new Error(`命令失败（exit ${code}）：${command} ${args.join(' ')}\n${output.slice(-2000)}`));
    });
  });
}

/** 递归拼接产物文本（`.mjs` / `.js` / `.html`）。 */
function readArtifactText(dir: string, prefix = ''): string {
  if (!existsSync(dir)) return '';
  let text = '';
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) text += readArtifactText(full, `${prefix}${entry.name}/`);
    else if (/\.(mjs|js|html)$/.test(entry.name)) text += readFileSync(full, 'utf-8');
  }
  return text;
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listFiles(full).map(f => `${entry}/${f}`));
    else out.push(entry);
  }
  return out;
}

describe('vite build（RM-V31：无 CLI 的完整构建）', () => {
  beforeAll(async () => {
    if (!existsSync(vpEntry)) throw new Error(`${vpEntry} 不存在：仓库根未安装依赖`);
    if (!existsSync(cliEntry)) throw new Error(`${cliEntry} 不存在：请先构建（pnpm build）再跑 CLI 集成测试`);
    // `NODE_ENV` 必须固定：vitest 会设 `NODE_ENV=test`，而 Vite 尊重显式设置的这个变量 ——
    // 客户端构建会打进 Vue 开发态代码（实测 entry 从 45.2 kB 涨到 75.9 kB），留下的 dist 会让
    // `analyze:check` 变红，且测的也不是用户拿到的产物。
    // 先删掉几个「以前只有 CLI 会生成」的类型声明：裸 `vite build` 必须自己把它们补回来。
    // 插件路径此前不跑 codegen，裸 Vite 用户的 `.ubean` 是残缺的（缺 routes / pages / i18n /
    // 虚拟组件声明，以及只在构建期产出的 openapi 类型），type-check 与编辑器补全直接不成立。
    for (const file of ['routes.d.ts', 'pages.d.ts', 'virtual-components.d.ts', 'openapi.d.ts']) {
      rmSync(join(fixtureDir, '.ubean', file), { force: true });
    }
    await run(vpEntry, ['build'], { NODE_ENV: 'production' });
  }, 300_000);

  afterAll(async () => {
    // 还原成默认路径的产物，避免把开关路径的 dist 留给 analyze:check（两条路径产物一致，但口径要统一）
    await run(process.execPath, [cliEntry, 'build'], { NODE_ENV: 'production' });
  }, 300_000);

  it('产出完整 dist：服务端 bundle、manifest、预渲染 HTML、岛屿产物', () => {
    const files = listFiles(join(fixtureDir, 'dist'));
    expect(files).toContain('manifest.json');
    expect(files).toContain('public/.vite/manifest.json');
    expect(
      files.some(f => f === 'server/entry.mjs'),
      '缺少服务端 entry'
    ).toBe(true);
    expect(
      files.some(f => f === 'server/server.mjs'),
      '缺少 node preset 包装'
    ).toBe(true);
    expect(
      files.some(f => f.endsWith('.html')),
      '缺少预渲染 HTML'
    ).toBe(true);
    // 岛屿 chunk 一类（RM-P23 的缺 chunk 门禁守的是客户端产物，这里守服务端产物里的标签）
    expect(
      files.some(f => f.includes('IslandClock')),
      '缺少岛屿产物'
    ).toBe(true);
  });

  it('裸 vite build 也生成完整的类型声明（与 CLI 等价，ADR-0012）', () => {
    // 判据是「先删掉、构建后必须回来」：`.ubean` 可能被同文件外的 dev 用例写过，
    // 只断言「文件存在」会被别人的产物蒙对。
    for (const file of [
      'routes.d.ts',
      'pages.d.ts',
      'virtual-components.d.ts',
      'openapi.d.ts',
      'codegen.manifest.json'
    ]) {
      expect(existsSync(join(fixtureDir, '.ubean', file)), `裸 vite build 后缺少 .ubean/${file}`).toBe(true);
    }
  });

  it('服务端产物内联了客户端入口 script 与预渲染 HTML 的 script', () => {
    const serverText = readArtifactText(join(fixtureDir, 'dist/server'));
    expect(/src=\\?"\/assets\//.test(serverText), '服务端产物里没有内联资产标签').toBe(true);

    const htmlText = readArtifactText(join(fixtureDir, 'dist/public')).replace(
      /<script id="__UBEAN_(STATE|PAGE_DATA|LOCALE)__"[\s\S]*?<\/script>/g,
      ''
    );
    expect(/<script type="module" src="\/assets\//.test(htmlText), '预渲染 HTML 里没有客户端入口').toBe(true);
  });
});
