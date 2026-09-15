/**
 * 浏览器侧运行时指标（docs/perf-regression-net.md RM-P07）。
 *
 * 用真实 Chromium 打开 dev server 的页面，采集两项用户可感知的延迟。口径依赖机器，
 * 因此与生命周期基准一样**不进 CI 阻塞**，只作整改前后对照。
 *
 * 指标定义：
 * - hydration   导航到 islands 页面 → 第一个岛屿带上 `data-hydrated` 的墙钟
 *   （`performance.now()` 的 timeOrigin 就是导航起点，所以该值即「导航 → 水合完成」）。
 *   取「第一个」而不是「全部」：页面上的岛屿刻意用了 idle / visible 等指令，
 *   等全部水合会把 2s idle 超时算进来，噪声远大于信号。首个水合的岛屿走的是 eager
 *   路径，包含 islands 首次 mount 的双 rAF 调度。
 * - navigation  在首页点击 `<Link to="/about">` → 新页面 DOM 提交完成的墙钟
 *   （在页面内装 MutationObserver，用合成的 MouseEvent 触发，不依赖坐标与窗口尺寸）。
 */
import { chromium } from 'playwright';

/** 探针页面与选择器：都取自 `examples/ubean-test` 这个测试床，改 fixture 时需同步。 */
export const HYDRATION_URL = '/islands-test';
export const NAVIGATION_URL = '/';
export const NAVIGATION_SELECTOR = 'a[href="/about"]';
/** `/about` 页面的根元素：出现即视为导航已提交（SPA 切换或整页刷新都适用）。 */
export const NAVIGATION_COMMITTED_SELECTOR = '.about';
export const HYDRATED_SELECTOR = 'ubean-island[data-hydrated]';

const RESOLVE_TIMEOUT_MS = 15_000;

/**
 * 在页面脚本执行前装好观察器：`document` 上的 attribute 观察可以覆盖解析全过程，
 * 避免「水合发生在 DOMContentLoaded 之前」导致漏采。
 */
function hydrationProbe() {
  const selector = 'ubean-island[data-hydrated]';
  const finish = () => {
    if (window.__ubeanPerfHydration !== undefined) return true;
    if (document.querySelector(selector)) {
      window.__ubeanPerfHydration = performance.now();
      return true;
    }
    return false;
  };
  if (finish()) return;
  const observer = new MutationObserver(() => {
    if (finish()) observer.disconnect();
  });
  observer.observe(document, { subtree: true, attributes: true, attributeFilter: ['data-hydrated'] });
}

/**
 * @returns {{ available: boolean, reason?: string, hydrationMs?: number, navigationMs?: number }}
 */
export async function createBrowserSession(options = {}) {
  const browser = await chromium.launch(options.launchOptions);
  const context = await browser.newContext();
  await context.addInitScript(hydrationProbe);
  return {
    context,
    browser,
    async close() {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    }
  };
}

/** 导航到 islands 页面，读取首个岛屿水合完成时刻（页面时钟 ms）。 */
export async function measureHydration(session, baseUrl) {
  const page = await session.context.newPage();
  try {
    await page.goto(`${baseUrl}${HYDRATION_URL}`, { waitUntil: 'commit' });
    const value = await page
      .waitForFunction(() => window.__ubeanPerfHydration !== undefined, null, { timeout: RESOLVE_TIMEOUT_MS })
      .then(() => page.evaluate(() => window.__ubeanPerfHydration))
      .catch(() => undefined);
    if (typeof value !== 'number') return { observed: false, reason: '首个岛屿未在超时内水合' };
    return { observed: true, latencyMs: value };
  } finally {
    await page.close().catch(() => {});
  }
}

/** 首页点击站内链接 → 新页面标记元素挂载完成。 */
export async function measureNavigation(session, baseUrl) {
  const page = await session.context.newPage();
  try {
    await page.goto(`${baseUrl}${NAVIGATION_URL}`, { waitUntil: 'load', timeout: RESOLVE_TIMEOUT_MS });
    const started = Date.now();
    await page.click(NAVIGATION_SELECTOR, { timeout: RESOLVE_TIMEOUT_MS });
    // 不用页面内 evaluate 包住点击：SPA 导航之外的整页刷新会销毁 JS 上下文，
    // 让那个 promise 永不结算。这里用 Playwright 原生 API，两种导航方式都能正常结束。
    await page.waitForSelector(NAVIGATION_COMMITTED_SELECTOR, { state: 'attached', timeout: RESOLVE_TIMEOUT_MS });
    return { observed: true, latencyMs: Date.now() - started };
  } catch (error) {
    return { observed: false, reason: error instanceof Error ? error.message : String(error) };
  } finally {
    await page.close().catch(() => {});
  }
}
