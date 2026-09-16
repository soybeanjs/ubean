/**
 * dev DX 走查（RM-V15）：在**真实浏览器**里走一遍交互型能力。
 *
 * 与其余集成测试的分工：`dev-topology` / `dev-reload` 用纯 HTTP 覆盖请求拓扑与热重载链路，
 * 这里补的是「只有浏览器 + 交互才成立」的三件事，避免把「自动化测试过了」当成「DX 走查过了」：
 * 0. **Server Action 表单在浏览器内提交**（页面级 `actions` + `useFormAction`）—— RM-V15 走查时
 *    示例缺这样一页，只有 HTTP 层覆盖，这里补齐「点击 → 无整页刷新 → 结果上屏」；
 * 1. 页面内切换语言（`setLocale` → load + cookie + 路由跳转，全程不整页刷新）；
 * 2. DevTools 外壳能从 CLI banner 给的地址进去；
 * 3. 改客户端文件后浏览器**整页重载** —— 这是 R3 修正后确认的语义（旧实现也是整页刷新，
 *    「保留状态」指的是服务端模块实例，由基准脚本的 reload 对照覆盖）。
 *
 * 刻意不在断言里依赖 DevTools 面板的内部结构：那是 UI 细节，改动频繁且不属于框架契约。
 */
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';

const repoRoot = resolve(import.meta.dirname, '../../..');
const fixtureDir = join(repoRoot, 'examples/ubean-test');
const cliEntry = join(repoRoot, 'packages/cli/dist/cli.js');
/** 客户端文件：改动它既要触发 rescan，也要让浏览器整页重载。 */
const clientFile = join(fixtureDir, 'src/app.ts');

let child: ChildProcess | undefined;
let baseUrl: string;
let browser: Browser | undefined;
let output = '';
let clientOriginal: string | null = null;

async function findFreePort(): Promise<number> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const port = 10_000 + Math.floor(Math.random() * 20_000);
    const free = await new Promise<boolean>(resolveFree => {
      const server = createServer();
      server.unref();
      server.once('error', () => resolveFree(false));
      server.listen(port, '127.0.0.1', () => server.close(() => resolveFree(true)));
    });
    if (free) return port;
  }
  throw new Error('找不到可用端口');
}

beforeAll(async () => {
  if (!existsSync(cliEntry)) {
    throw new Error(`${cliEntry} 不存在：请先构建（pnpm build）再跑 DX 走查`);
  }
  clientOriginal = readFileSync(clientFile, 'utf8');

  const port = await findFreePort();
  child = spawn(process.execPath, [cliEntry, 'dev', '--port', String(port), '--strictPort'], {
    cwd: fixtureDir,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout?.on('data', chunk => (output += chunk));
  child.stderr?.on('data', chunk => (output += chunk));

  const started = Date.now();
  while (Date.now() - started < 180_000) {
    for (const host of ['::1', '127.0.0.1']) {
      const candidate = host.includes(':') ? `http://[${host}]:${port}` : `http://${host}:${port}`;
      try {
        const res = await fetch(`${candidate}/_health`, { signal: AbortSignal.timeout(2_000) });
        if (res.status > 0) {
          baseUrl = candidate;
          break;
        }
      } catch {
        /* 换下一个候选 */
      }
    }
    if (baseUrl) break;
    if (child.exitCode != null) throw new Error(`dev server 提前退出（exit ${child.exitCode}）\n${output}`);
    await new Promise(resolveDelay => setTimeout(resolveDelay, 150));
  }
  if (!baseUrl) throw new Error(`dev server 在 180s 内不可达\n${output}`);

  browser = await chromium.launch();
}, 240_000);

afterAll(async () => {
  await browser?.close();
  if (child && child.exitCode == null) {
    child.kill('SIGTERM');
    await new Promise<void>(resolveExit => {
      const timer = setTimeout(() => {
        child?.kill('SIGKILL');
        resolveExit();
      }, 5_000);
      child?.once('exit', () => {
        clearTimeout(timer);
        resolveExit();
      });
    });
  }
  // 改过示例项目源码，必须还原
  if (clientOriginal !== null) {
    const current = readFileSync(clientFile, 'utf8');
    if (current !== clientOriginal) writeFileSync(clientFile, clientOriginal);
    clientOriginal = null;
  }
});

async function openPage(timeout = 20_000): Promise<Page> {
  const page = await browser!.newPage();
  page.setDefaultTimeout(timeout);
  return page;
}

describe('dev DX 走查（浏览器内真实交互）', () => {
  it('页面内切换语言：URL 与文案都切到中文，且没有整页刷新', async () => {
    const page = await openPage();
    // 整页重载计数器：SPA 的 history 跳转不触发 `load`，整页刷新会
    let loads = 0;
    page.on('load', () => (loads += 1));
    try {
      await page.goto(`${baseUrl}/i18n`, { waitUntil: 'domcontentloaded' });
      // 等应用水合完成再交互：SSR 首屏的按钮此时还没有监听器，早点击会被丢掉。
      // 同时把「首个整页重载」等掉 —— dev server 首次请求后依赖预构建完成会触发一次，
      // 它会在随机时刻打断 page.evaluate（实测报 Execution context was destroyed）。
      await page.waitForFunction(
        () => Boolean((document.querySelector('#app') as never as Record<string, unknown>)?.__vue_app__),
        undefined,
        { timeout: 30_000 }
      );
      await page.waitForTimeout(1_500);
      const loadsBefore = loads;

      await page.getByRole('button', { name: 'zh', exact: true }).click();

      // setLocale 走 router.replace(switchLocalePath)：URL 变为语言前缀路径。
      // 用轮询 page.url() 而不是 `waitForURL` —— 后者默认等 `load` 事件，而 SPA 的
      // history 跳转根本不触发 load，会一直等到超时（实测踩过）。
      await expect.poll(() => new URL(page.url()).pathname, { timeout: 15_000 }).toContain('/zh');
      await expect.poll(() => page.locator('h1').first().textContent(), { timeout: 15_000 }).toContain('Ubean 测试');

      // 期间没有整页重载 ⇒ 是客户端路由跳转（而不是刷新后落到 /zh）
      expect(loads).toBe(loadsBefore);
    } finally {
      await page.close();
    }
  }, 120_000);

  it('动态路由 matcher：服务端 404 + 客户端守卫拦下 SPA 导航', async () => {
    // 服务端：`[id=numeric]` 不匹配时由 router 中间件直接 404（不是渲染页面再报错）
    expect((await fetch(`${baseUrl}/order/123`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/order/abc`)).status).toBe(404);

    const page = await openPage();
    try {
      await page.goto(`${baseUrl}/order/123`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(
        () => Boolean((document.querySelector('#app') as never as Record<string, unknown>)?.__vue_app__),
        undefined,
        { timeout: 30_000 }
      );
      await page.waitForTimeout(1_500);

      // 客户端：同名 matcher 由 `router.beforeEach(createMatcherGuard())` 校验 —— 用 history 跳转
      // 触发一次真正的 SPA 导航（不带整页刷新），非法 id 应被拦下并落到 404 路由。
      await page.evaluate(() => {
        window.history.pushState({}, '', '/order/abc');
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      await expect.poll(() => page.url(), { timeout: 15_000 }).not.toContain('/order/abc');
      const body = await page.textContent('body');
      expect(body ?? '').not.toContain('订单号：abc');
    } finally {
      await page.close();
    }
  }, 120_000);

  it('Server / Client Components 的水合行为：占位符被替换、配对组件切到客户端变体', async () => {
    const page = await openPage();
    // 只收两类信号：**未捕获异常**与**水合不匹配**。不去数全部 console 错误 —— 页面里的
    // 图标走外网（api.iconify.design），离线/带代理的环境下会刷一屏 CORS 错误，与本次验证无关
    // （实测：把它算进去会让这条用例在无外网时假红）。
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(`pageerror: ${String(e).slice(0, 120)}`));
    page.on('console', m => {
      if (m.type() === 'error' && /hydrat|mismatch/i.test(m.text())) errors.push(m.text().slice(0, 120));
    });
    try {
      await page.goto(`${baseUrl}/server-components`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(
        () => Boolean((document.querySelector('#app') as never as Record<string, unknown>)?.__vue_app__),
        undefined,
        { timeout: 30_000 }
      );
      await page.waitForTimeout(1_200);

      // `.client.vue`：SSR 的 `<div data-client-only>` 占位符被真实内容替换
      expect(await page.locator('[data-client-only]').count()).toBe(0);
      expect(await page.locator('.sc-client').count()).toBe(1);
      // 配对组件：首帧的服务端变体被客户端变体替换
      expect(await page.locator('.paired-server').count()).toBe(0);
      expect(await page.locator('.paired-client').count()).toBe(1);
      expect(errors, errors[0] ?? '').toHaveLength(0); // 无未捕获异常、无水合不匹配
    } finally {
      await page.close();
    }
  }, 120_000);

  it('PPR（routeRules.ppr）：响应带流式标记，且 loader-only 页面在浏览器里能水合', async () => {
    // `/ppr-demo` 同时覆盖两件事：
    //  1. `routeRules.ppr: true` 的**服务端**行为 —— 强制流式 SSR，响应头给出可验证的标记；
    //  2. 「loader 写在 <script>、definePage 写在 <script setup>」这一**页面约定形状**在浏览器里真能跑。
    //     该形状剥离宏后会得到空的 setup 块，曾让生产构建报 MISSING_EXPORT "default"
    //     （见 builder/test/macros.test.ts）；这里从运行时再守一道。
    const response = await fetch(`${baseUrl}/ppr-demo`);
    expect(response.status).toBe(200);
    expect(response.headers.get('x-ppr')).toBe('streaming');
    expect(response.headers.get('x-ssr-mode')).toBe('streaming');
    expect(await response.text()).toContain('ppr-body');

    const page = await openPage();
    // 客户端图省事会掩盖问题：loader 页若没有默认导出，浏览器报的是**模块链接期**错误
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(`pageerror: ${String(e).slice(0, 120)}`));
    page.on('console', m => {
      if (m.type() === 'error' && /hydrat|mismatch|does not provide an export/i.test(m.text())) {
        errors.push(m.text().slice(0, 120));
      }
    });
    try {
      await page.goto(`${baseUrl}/ppr-demo`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(
        () => Boolean((document.querySelector('#app') as never as Record<string, unknown>)?.__vue_app__),
        undefined,
        { timeout: 30_000 }
      );
      await page.waitForTimeout(1_000);
      // 组件真的挂上了（该页的 setup 只有 definePage，剥离宏后靠宏转换保留块才有默认导出：
      // 缺默认导出时这里会是「路由组件解析失败」，不是断言失败 —— 所以两种信号都要）
      expect(await page.locator('.ppr-demo').count()).toBe(1);
      expect(errors, errors[0] ?? '').toHaveLength(0);
    } finally {
      await page.close();
    }
  }, 120_000);

  it('服务端岛屿：SSR 输出渲染后的内容，浏览器水合不出错', async () => {
    const response = await fetch(`${baseUrl}/server-island-demo`);
    expect(response.status).toBe(200);
    const html = await response.text();
    // 异步组件解析完成后的真实内容在 SSR HTML 里（不是 fallback）
    expect(html).toContain('island-resolved');

    const page = await openPage();
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(`pageerror: ${String(e).slice(0, 120)}`));
    try {
      await page.goto(`${baseUrl}/server-island-demo`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(
        () => Boolean((document.querySelector('#app') as never as Record<string, unknown>)?.__vue_app__),
        undefined,
        { timeout: 30_000 }
      );
      await page.waitForTimeout(1_000);
      expect(await page.locator('.slow-widget').count()).toBe(1);
      expect(errors, errors[0] ?? '').toHaveLength(0);
    } finally {
      await page.close();
    }
  }, 120_000);

  it('流式延迟数据：SSR 首屏是 fallback，水合后采用 payload 且无 mismatch', async () => {
    // `defer()` + `useDeferredData()`：SSR 不阻塞首屏（渲染 fallback），payload 以
    // `__UBEAN_DEFERRED__` 流式注入；客户端挂载后采用它，**不再发第二次请求**。
    // 这里守的是**水合安全**这一条：早先实现在 setup 里同步应用 payload，客户端首帧渲染
    // resolved 分支而 SSR 渲染 fallback —— Vue 报 `Hydration completed but contains mismatches`，
    // 且被匹配上的元素留着 SSR 的旧 class（页面上是「fallback 的 class + resolved 的文本」）。
    const response = await fetch(`${baseUrl}/deferred-demo`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('deferred-pending'); // 首屏是非关键数据的 fallback
    expect(html).toContain('__UBEAN_DEFERRED__'); // payload 随之注入
    expect(html).toContain('deferred-resolved');

    const page = await openPage();
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(`pageerror: ${String(e).slice(0, 120)}`));
    page.on('console', m => {
      if (m.type() === 'error' && /hydrat|mismatch/i.test(m.text())) errors.push(m.text().slice(0, 120));
    });
    try {
      await page.goto(`${baseUrl}/deferred-demo`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(
        () => Boolean((document.querySelector('#app') as never as Record<string, unknown>)?.__vue_app__),
        undefined,
        { timeout: 30_000 }
      );
      // 挂载后切到 resolved 分支：class 与文本都必须是 resolved 那一支
      await expect.poll(() => page.locator('.deferred-value').count(), { timeout: 15_000 }).toBe(1);
      expect(await page.locator('.deferred-value').textContent()).toContain('deferred-resolved');
      expect(await page.locator('.deferred-pending').count()).toBe(0);
      expect(errors, errors[0] ?? '').toHaveLength(0);
    } finally {
      await page.close();
    }
  }, 120_000);

  it('DevTools 外壳可以从 /_devtools 进入', async () => {
    const response = await fetch(`${baseUrl}/_devtools`, { redirect: 'follow' });
    expect(response.status).toBe(200);
    const html = await response.text();
    // 外壳是预构建 SPA：能返回 HTML 且引用了脚本即算可进入（不锁 UI 结构）
    expect(html).toContain('<script');
    expect(response.url).toContain('/__devtools');
  }, 60_000);

  it('Server Action 表单：浏览器内提交、无整页刷新、错误回填', async () => {
    const page = await openPage();
    let loads = 0;
    page.on('load', () => (loads += 1));
    try {
      await page.goto(`${baseUrl}/action-demo`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(
        () => Boolean((document.querySelector('#app') as never as Record<string, unknown>)?.__vue_app__),
        undefined,
        { timeout: 30_000 }
      );
      // 等掉 dev server 首轮的预构建重载，之后观察到的 load 才算「本次提交触发」
      await page.waitForTimeout(1_500);
      const loadsBefore = loads;

      // 成功路径：action 的返回值进客户端状态，列表里出现一行
      await page.fill('#email', 'browser@example.com');
      await page.getByRole('button', { name: '订阅' }).click();
      await expect
        .poll(() => page.locator('.action-log li').first().textContent(), { timeout: 15_000 })
        .toContain('已订阅：browser@example.com');
      expect(loads, 'SPA 提交不应触发整页刷新').toBe(loadsBefore);

      // 字段错误路径：`fail(400, ...)` 的 errors 回到表单状态。
      // 先把 input 的 type 改成 text —— `type="email"` 的原生校验会在提交前拦下非法值，
      // 我们的 @submit 处理函数根本不会跑（服务端校验本来就该由服务端测；无 JS 路径由
      // 示例套件里的 HTTP 用例覆盖，这里测的是 SPA 提交后错误回填上屏）。
      await page.evaluate(() => document.querySelector('#email')?.setAttribute('type', 'text'));
      await page.fill('#email', 'not-an-email');
      await page.getByRole('button', { name: '订阅' }).click();
      await expect
        .poll(() => page.locator('.action-error').first().textContent(), { timeout: 15_000 })
        .toContain('请输入合法邮箱');
      expect(loads, '错误路径也不应整页刷新').toBe(loadsBefore);
    } finally {
      await page.close();
    }
  }, 120_000);

  it('改客户端文件后浏览器整页重载（文档化语义）', async () => {
    const page = await openPage(30_000);
    let loads = 0;
    page.on('load', () => (loads += 1));
    try {
      await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(
        () => Boolean((document.querySelector('#app') as never as Record<string, unknown>)?.__vue_app__),
        undefined,
        { timeout: 30_000 }
      );
      // 先把 dev server 自己的首次重载等掉，之后观察到的 load 才算「本次改动触发」
      await page.waitForTimeout(1_500);
      const loadsBefore = loads;

      // 追加一行注释：既触发 rescan（app.ts 是入口文件），也让协调器发 full-reload
      const current = readFileSync(clientFile, 'utf8');
      writeFileSync(clientFile, `${current}\n// dx-probe-${Date.now()}\n`);

      await expect.poll(() => loads, { timeout: 30_000, interval: 200 }).toBeGreaterThan(loadsBefore);
    } finally {
      await page.close();
      writeFileSync(clientFile, clientOriginal!);
    }
  }, 120_000);
});
