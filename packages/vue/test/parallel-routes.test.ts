/**
 * Parallel Routes — scanning unit tests；以及**拦截路由被刻意拒绝**的守卫。
 *
 * 覆盖：
 * - 并行路由插槽：`@slotName` 段（含嵌套、与普通段混合）
 * - 无插槽的路径原样透传（`cleanedBase` 不变）
 * - 拦截路由标记段（`(.)` / `(..)` / `(...)`）**抛错**，并给出替代做法指引
 *
 * 拦截路由为什么被移除：本仓一度按约定扫出 `interceptFrom` / `interceptTarget` 并把页面注册成
 * `__intercept_*` 路由，但全仓没有消费者 —— 拦截页只能落在一个谁也不会访问的废 URL 上。
 * 真要接线，代价在运行时（守卫 + 同 URL 双记录 + 故意的 SSR/客户端分叉），而核心价值
 * （URL 可分享、back 关闭对话框）用并行路由在应用侧就能拿到，因此按 [docs/adr/0010]
 * 「单独『竞品有』→ 刻意不做」处理，并让标记段**响亮失败**（不拦的话会退化成
 * `/feed/(.)photo/:id` 这种字面垃圾路径 —— 路由组正则只吞整段 `(group)/`）。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { extractSlotFromPath, scanPages } from '../src/scan-pages';

describe('extractSlotFromPath — parallel routes', () => {
  it('extracts slot from @slotName segment', () => {
    const result = extractSlotFromPath('@modal/login');
    expect(result.slot).toBe('modal');
    expect(result.cleanedBase).toBe('login');
  });

  it('extracts slot from nested @slotName segment', () => {
    const result = extractSlotFromPath('dashboard/@analytics/index');
    expect(result.slot).toBe('analytics');
    expect(result.cleanedBase).toBe('dashboard/index');
  });

  it('handles path without slot (passthrough)', () => {
    const result = extractSlotFromPath('about/index');
    expect(result.slot).toBeUndefined();
    expect(result.cleanedBase).toBe('about/index');
  });

  it('handles root index without slot', () => {
    const result = extractSlotFromPath('index');
    expect(result.slot).toBeUndefined();
    expect(result.cleanedBase).toBe('index');
  });

  it('handles multiple segments with slot in middle', () => {
    const result = extractSlotFromPath('users/@profile/settings');
    expect(result.slot).toBe('profile');
    expect(result.cleanedBase).toBe('users/settings');
  });

  it('routes groups（`(group)/`，无点号）不受影响', () => {
    const result = extractSlotFromPath('(marketing)/about');
    expect(result.slot).toBeUndefined();
    expect(result.cleanedBase).toBe('(marketing)/about');
  });

  it('returns no metadata for plain path', () => {
    const result = extractSlotFromPath('users/[id]/settings');
    expect(result.slot).toBeUndefined();
    expect(result.cleanedBase).toBe('users/[id]/settings');
  });

  it('handles empty string', () => {
    const result = extractSlotFromPath('');
    expect(result.slot).toBeUndefined();
    expect(result.cleanedBase).toBe('');
  });
});

describe('extractSlotFromPath — 拦截路由标记段被拒绝', () => {
  const markers = ['(.)photo/[id]', '(..)photo/[id]', '(...)photo/[id]', 'photos/(.)photo/[id]'];

  for (const marker of markers) {
    it(`拒绝 ${marker}`, () => {
      expect(() => extractSlotFromPath(marker)).toThrow(/拦截路由目录约定不被支持/);
    });
  }

  it('错误信息给出替代做法与文档位置（用户能照做，而不是只知道不能做）', () => {
    let message = '';
    try {
      extractSlotFromPath('dashboard/@modal/(..)photo/[id]');
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain('docs/adr/0010');
    expect(message).toContain('<SlotView');
    expect(message).toContain('@dialog');
  });
});

/**
 * 扫描集成：真实走一遍 `scanPages`（用户在 `src/pages/` 里放一个标记目录就该看到这条错误，
 * 而不是拿到一条 `/feed/(.)photo/:id` 的垃圾路由）。
 */
describe('scanPages — 拦截路由标记目录（集成）', () => {
  let tmpDir: string;
  let pagesDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ubean-vue-intercept-'));
    pagesDir = join(tmpDir, 'src', 'pages');
    mkdirSync(pagesDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  async function scan() {
    return scanPages({
      cwd: tmpDir,
      srcDir: 'src',
      pagesDir: 'pages',
      layoutsDir: 'layouts',
      markdown: false,
      head: false
    });
  }

  it('页面目录里出现 (.)photo/[id].vue → 扫描直接报错并指路', async () => {
    const target = join(pagesDir, '(.)photo');
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, '[id].vue'), '<template><p>x</p></template>');

    await expect(scan()).rejects.toThrow(/拦截路由目录约定不被支持/);
  });

  it('并行路由 @slot 目录照旧可用（回归：拒绝标记段不影响插槽）', async () => {
    const slotDir = join(pagesDir, '@aside');
    mkdirSync(slotDir, { recursive: true });
    writeFileSync(join(slotDir, 'parallel.vue'), '<template><p>slot</p></template>');
    writeFileSync(join(pagesDir, 'parallel.vue'), '<template><p>page</p></template>');

    const result = await scan();
    const slotPage = result.pages.find(p => p.slot === 'aside');
    expect(slotPage?.route).toBe('/parallel');
  });
});
