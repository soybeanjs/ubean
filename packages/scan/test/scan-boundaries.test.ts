/**
 * `@ubean/scan` 扫描边界加固（TS-31）。
 *
 * 本文件补的是**聚合层自己的边界**，不是页面扫描器的内部实现 —— 后者的完整测试随所有权
 * 迁到了 `@ubean/vue`（`parallel-routes.test.ts` / `route-path.test.ts` / `route-name.test.ts` /
 * `matchers.test.ts`）。这里要证明的是另一件事：**用户在 `src/` 里那样放文件时，
 * `scanProject` 聚合出来的结果对不对**，以及**委托链有没有把边界语义如实传下去**。
 *
 * 四类必备边界（TS-31 验收）：
 * 1. 路由组 `(group)/` —— 不贡献 URL 段（页面与 API 两侧）
 * 2. 并行路由 `@slot/` —— 抽插槽名、剥离 `@slot` 段算路径、与同名根页面共存
 * 3. matcher 语法 `[param=matcher]` / `[...slug=matcher]` / `[[param=matcher]]` —— 页面与 API 两侧
 * 4. 非法标记（拦截路由 `(.)` / `(..)` / `(...)`）—— **抛错**且错误信息给出可照做的修复建议
 *
 * 其余是对聚合层自身分支的加固（多目录叠加去重、目录名归一化回退、排序前缀、
 * locales 三种文件形态与 wrapper 判定、app/server 入口探测、ignore 覆盖）。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { detectHttpExportsFromCode } from '../src/detect-exports';
import { scanProject } from '../src/scan';
import type { ScanOptions } from '../src/types';

let tmpDir: string;
let srcDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ubean-scan-boundaries-'));
  srcDir = join(tmpDir, 'src');
  mkdirSync(srcDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function write(relPath: string, content = '<template><p>x</p></template>'): void {
  const full = join(srcDir, relPath);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
}

function scan(overrides: Partial<ScanOptions> = {}) {
  return scanProject({ cwd: tmpDir, srcDir: 'src', ...overrides });
}

// ---------------------------------------------------------------------------
// 1. 路由组
// ---------------------------------------------------------------------------

describe('TS-31 · 路由组 `(group)/` 不贡献 URL 段', () => {
  it('页面：中间与尾部的路由组都被剥离', async () => {
    write('pages/(marketing)/about.vue');
    write('pages/docs/(v2)/guide.vue');
    write('pages/(app)/dashboard/index.vue');

    const result = await scan();
    const routes = result.pages.map(p => p.route).sort();

    expect(routes).toEqual(['/about', '/dashboard', '/docs/guide']);
    expect(routes.some(r => r.includes('('))).toBe(false);
  });

  it('路由组不进入路由名（否则名字里会带括号）', async () => {
    write('pages/(marketing)/about.vue');

    const result = await scan();
    const page = result.pages.find(p => p.route === '/about');

    expect(page?.name).toBe('About');
    expect(page?.name).not.toContain('(');
  });

  it('API 路由侧同样剥离路由组', async () => {
    write('routes/(api)/v1/items/[id].get.ts', 'export const GET = 1;\n');

    const result = await scan();

    expect(result.apiRoutes.map(a => a.route)).toEqual(['/v1/items/:id']);
    expect(result.apiRoutes[0].relativePath).toBe('(api)/v1/items/[id].get.ts');
  });

  it('只有路由组包裹的目录仍能落到根路径之上（不产生空段）', async () => {
    write('pages/(root)/index.vue');

    const result = await scan();

    expect(result.pages.map(p => p.route)).toEqual(['/']);
  });
});

// ---------------------------------------------------------------------------
// 2. 并行路由
// ---------------------------------------------------------------------------

describe('TS-31 · 并行路由 `@slot/`', () => {
  it('抽出 slot 名，并用剥离 `@slot` 后的路径算路由', async () => {
    write('pages/@aside/parallel.vue');

    const result = await scan();
    const page = result.pages.find(p => p.slot === 'aside');

    expect(page).toBeDefined();
    expect(page?.route).toBe('/parallel');
    expect(page?.slot).toBe('aside');
  });

  it('插槽页与同名根页共存（两条记录，路由相同、仅 slot 不同）', async () => {
    write('pages/parallel.vue');
    write('pages/@aside/parallel.vue');

    const result = await scan();
    const atParallel = result.pages.filter(p => p.route === '/parallel');

    // 两条记录：一条带 slot，一条不带。断言按 slot 分桶，避免依赖扫描顺序。
    expect(atParallel).toHaveLength(2);
    expect(atParallel.filter(p => p.slot === 'aside')).toHaveLength(1);
    expect(atParallel.filter(p => p.slot === undefined)).toHaveLength(1);
    expect(new Set(atParallel.map(p => p.fullPath)).size).toBe(2);
  });

  it('嵌套插槽目录保留外层路径段，插槽段不出现在路由里', async () => {
    write('pages/dashboard/@analytics/index.vue');

    const result = await scan();
    const page = result.pages.find(p => p.slot === 'analytics');

    expect(page?.route).toBe('/dashboard');
    expect(page?.route).not.toContain('@');
  });

  it('插槽段在中间时，只抽掉插槽段本身', async () => {
    write('pages/users/@profile/settings.vue');

    const result = await scan();

    expect(result.pages.map(p => p.route)).toEqual(['/users/settings']);
  });

  it('无插槽的普通页面 slot 为 undefined（不会误标）', async () => {
    write('pages/about.vue');

    const result = await scan();

    expect(result.pages[0].slot).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. matcher 语法
// ---------------------------------------------------------------------------

describe('TS-31 · matcher 语法 `[param=matcher]`', () => {
  it('动态参数：路由用 `:id`，同时带 matchers 映射', async () => {
    write('pages/users/[id=numeric].vue');

    const result = await scan();
    const page = result.pages.find(p => p.matchers?.id === 'numeric');

    expect(page).toBeDefined();
    expect(page?.route).toBe('/users/:id');
    expect(page?.matchers).toEqual({ id: 'numeric' });
  });

  it('catch-all：`[...slug=any]` → `**:slug` + matchers', async () => {
    write('pages/blog/[...slug=any].vue');

    const result = await scan();
    const page = result.pages.find(p => p.route === '/blog/**:slug');

    expect(page).toBeDefined();
    expect(page?.matchers).toEqual({ slug: 'any' });
  });

  it('optional：`[[page=numeric]]` → `:page?` + matchers', async () => {
    write('pages/optional/[[page=numeric]].vue');

    const result = await scan();
    const page = result.pages.find(p => p.route === '/optional/:page?');

    expect(page).toBeDefined();
    expect(page?.matchers).toEqual({ page: 'numeric' });
  });

  it('无 matcher 语法的动态参数不带 matchers（不能凭空造映射）', async () => {
    write('pages/user/[id].vue');

    const result = await scan();
    const page = result.pages.find(p => p.route === '/user/:id');

    expect(page?.matchers).toBeUndefined();
  });

  it('API 路由侧同样解析 matcher 并保留在 scan 结果里', async () => {
    write('routes/users/[id=numeric].get.ts', 'export const GET = 1;\n');

    const result = await scan();

    expect(result.apiRoutes).toHaveLength(1);
    expect(result.apiRoutes[0].route).toBe('/users/:id');
    expect(result.apiRoutes[0].matchers).toEqual({ id: 'numeric' });
  });

  it('matcher 名会被剥掉，不残留在路由段里', async () => {
    write('pages/items/[sku=slug].vue');
    write('pages/orders/[orderId=numeric].vue');

    const result = await scan();

    for (const page of result.pages) {
      expect(page.route).not.toContain('=');
      expect(page.route).not.toContain('sku=slug');
      expect(page.route).not.toContain('orderId=numeric');
    }
    expect(result.pages.map(p => p.route).sort()).toEqual(['/items/:sku', '/orders/:orderId']);
  });
});

// ---------------------------------------------------------------------------
// 4. 非法标记（拦截路由）抛错
// ---------------------------------------------------------------------------

describe('TS-31 · 拦截路由标记段必须响亮失败', () => {
  const markers = ['(.)photo', '(..)photo', '(...)photo'];

  for (const marker of markers) {
    it(`页面目录里出现 ${marker}/ 时 scanProject 直接拒绝`, async () => {
      write(`pages/${marker}/[id].vue`);

      await expect(scan()).rejects.toThrow(/拦截路由目录约定不被支持/);
    });
  }

  it('嵌套在普通目录里的标记段同样被拒绝（不静默降级成字面路径）', async () => {
    write('pages/feed/(.)photo/[id].vue');

    await expect(scan()).rejects.toThrow(/拦截路由目录约定不被支持/);
  });

  it('不拦的话会退化成垃圾字面路径 —— 断言扫描结果里确实不存在这种路由', async () => {
    // 先证明「没有标记段时是正常扫描」，再用同一目录加标记段确认失败。
    write('pages/feed/photo/[id].vue');
    const ok = await scan();
    expect(ok.pages.map(p => p.route)).toEqual(['/feed/photo/:id']);
    rmSync(join(srcDir, 'pages', 'feed'), { recursive: true, force: true });

    write('pages/feed/(.)photo/[id].vue');
    await expect(scan()).rejects.toThrow(/拦截路由目录约定不被支持/);
  });

  it('错误信息含修复建议：ADR 出处、替代做法、具体目录示例（用户能照做）', async () => {
    write('pages/(.)photo/[id].vue');

    let message = '';
    try {
      await scan();
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).not.toBe('');
    expect(message).toContain('docs/adr/0010');
    expect(message).toContain('<SlotView');
    expect(message).toContain('@dialog');
  });

  it('并行路由与路由组不受此守卫影响（拒绝的只是带点号的标记段）', async () => {
    write('pages/@aside/parallel.vue');
    write('pages/(marketing)/about.vue');

    const result = await scan();

    expect(result.pages.map(p => p.route).sort()).toEqual(['/about', '/parallel']);
    expect(result.pages.find(p => p.slot === 'aside')?.route).toBe('/parallel');
  });
});

// ---------------------------------------------------------------------------
// 聚合层自身分支加固
// ---------------------------------------------------------------------------

describe('TS-31 · 多目录叠加与去重', () => {
  it('同一文件被多个 pagesDir 覆盖到只保留一条（按 fullPath 去重）', async () => {
    write('pages/index.vue');
    write('pages/nested/deep.vue');

    // `pages/nested` 与 `pages` 重叠：deep.vue 会被两次 glob 到，但 fullPath 相同。
    const result = await scan({ dirs: { pages: ['pages', 'pages/nested'] } });

    expect(result.pages.map(p => p.route).sort()).toEqual(['/', '/nested/deep']);
    expect(result.pages.filter(p => p.route === '/nested/deep')).toHaveLength(1);
  });

  it('不同目录里的同名文件产生同一路由的两条记录（去重键是 fullPath，不是 route）', async () => {
    write('pages/about.vue');
    write('views/about.vue', '<template><p>override</p></template>');

    const result = await scan({ dirs: { pages: ['pages', 'views'] } });
    const aboutPages = result.pages.filter(p => p.route === '/about');

    // 这是当前的真实语义：两个真实文件都进结果。路由冲突由下游（生成器/路由表）处理，
    // 扫描层只保证同一个文件不被重复收录。
    expect(aboutPages).toHaveLength(2);
    expect(aboutPages.map(p => p.relativePath)).toEqual(['about.vue', 'about.vue']);
    expect(new Set(aboutPages.map(p => p.fullPath)).size).toBe(2);
  });

  it('多个 pagesDir 叠加时，各自独有的页面都在结果里', async () => {
    write('pages/index.vue');
    write('views/extra.vue');

    const result = await scan({ dirs: { pages: ['pages', 'views'] } });

    expect(result.pages.map(p => p.route).sort()).toEqual(['/', '/extra']);
  });

  it('dirs 显式给空数组时回退到默认目录名（不会扫出 0 个页面）', async () => {
    write('pages/index.vue');

    const result = await scan({ dirs: { pages: [] } });

    expect(result.pages.map(p => p.route)).toEqual(['/']);
  });

  it('dirs 给空字符串同样回退到默认值', async () => {
    write('pages/index.vue');

    const result = await scan({ dirs: { pages: '' } });

    expect(result.pages).toHaveLength(1);
  });

  it('routes / middleware 等目录名给空数组时也回退到默认目录名', async () => {
    write('routes/users.ts', 'export const GET = 1;\n');
    write('middleware/logger.ts', 'export default 1;\n');
    write('crons/01.cleanup.ts', 'export default 1;\n');
    write('queues/emails.ts', 'export default 1;\n');
    write('plugins/analytics.ts', 'export default 1;\n');

    // 这些目录名由 scan.ts 自己的 normalizeDirs 归一化（不经过 @ubean/vue）
    const result = await scan({ dirs: { routes: [], middleware: [], crons: [], queues: [], plugins: [] } });

    expect(result.apiRoutes.map(a => a.route)).toEqual(['/users']);
    expect(result.middlewares.map(m => m.relativePath)).toEqual(['logger.ts']);
    expect(result.crons.map(c => c.name)).toEqual(['cleanup']);
    expect(result.queues.map(q => q.name)).toEqual(['emails']);
    expect(result.plugins).toHaveLength(1);
  });

  it('自定义目录名生效（screens/ 代替 pages/）', async () => {
    write('screens/index.vue');

    const result = await scan({ dirs: { pages: 'screens' } });

    expect(result.pages.map(p => p.route)).toEqual(['/']);
  });
});

describe('TS-31 · 排序前缀与目录扫描边界', () => {
  it('中间件的数字前缀被解析为 order，且从挂载名里剥掉', async () => {
    write('middleware/10.logger.ts', 'export default async () => {};\n');
    write('middleware/05.trace.ts', 'export default async () => {};\n');
    write('middleware/auth.ts', 'export default async () => {};\n');

    const result = await scan();
    const byBase = new Map(result.middlewares.map(m => [m.relativePath, m]));

    expect(byBase.get('10.logger.ts')?.order).toBe(10);
    expect(byBase.get('05.trace.ts')?.order).toBe(5);
    expect(byBase.get('auth.ts')?.order).toBe(0);
  });

  it('crons / queues 同样剥离数字前缀作为逻辑名', async () => {
    write('crons/01.cleanup.ts', 'export default 1;\n');
    write('crons/10.report.ts', 'export default 1;\n');
    write('queues/20.emails.ts', 'export default 1;\n');

    const result = await scan();

    expect(result.crons.map(c => c.name)).toEqual(['cleanup', 'report']);
    expect(result.queues.map(q => q.name)).toEqual(['emails']);
    // 磁盘上的排序前缀仍保留在 basename 里（用于加载顺序）
    expect(result.crons.map(c => c.basename)).toEqual(['01.cleanup.ts', '10.report.ts']);
  });

  it('plugins 目录也按数字前缀排序', async () => {
    write('plugins/analytics.ts', 'export default 1;\n');
    write('plugins/50.extra.ts', 'export default 1;\n');

    const result = await scan();

    expect(result.plugins.map(p => p.order).sort()).toEqual([0, 50]);
  });

  it('下划线前缀文件被忽略（私有文件约定）', async () => {
    write('pages/index.vue');
    write('pages/_helper.vue');
    write('routes/_private.ts', 'export const GET = 1;\n');
    write('middleware/_internal.ts', 'export default 1;\n');

    const result = await scan();

    expect(result.pages.map(p => p.route)).toEqual(['/']);
    expect(result.apiRoutes).toHaveLength(0);
    expect(result.middlewares).toHaveLength(0);
  });

  it('测试/spec/类型声明文件被默认忽略', async () => {
    write('pages/index.vue');
    write('pages/about.test.vue');
    write('pages/contact.spec.vue');
    write('pages/types.d.ts', 'export {};\n');

    const result = await scan();

    expect(result.pages.map(p => p.route)).toEqual(['/']);
  });

  it('pages/components/ 下的组件不被当作页面（组件目录约定）', async () => {
    write('pages/index.vue');
    write('pages/components/Widget.vue');

    const result = await scan();

    expect(result.pages.map(p => p.route)).toEqual(['/']);
  });

  it('默认忽略在未传 ignore 时生效（_ 前缀 / test / spec / .d.ts）', async () => {
    write('pages/index.vue');
    write('pages/_helper.vue');
    write('pages/about.test.vue');
    write('routes/thing.test.ts', 'export const GET = 1;\n');
    write('routes/real.ts', 'export const GET = 1;\n');

    const result = await scan();

    expect(result.pages.map(p => p.route)).toEqual(['/']);
    expect(result.apiRoutes.map(a => a.relativePath)).toEqual(['real.ts']);
  });

  it('用户传入 ignore 会**替换**默认列表（而不是合并）—— 已在 docs/test.md 记录为已知尖角', async () => {
    write('pages/index.vue');
    write('pages/legacy.vue');
    write('routes/thing.test.ts', 'export const GET = 1;\n');

    const result = await scan({ ignore: ['**/legacy.vue'] });

    // 用户 ignore 生效
    expect(result.pages.map(p => p.route)).toEqual(['/']);
    // 但 `scan.ts` 里是 `options.ignore || [默认]`：一旦传了 ignore，
    // `**/*.test.*` / `**/_*` 这组保护就不在列表里了（路由侧没有硬编码补充）。
    // 这是一个已确认的行为（不是本测试想固定的"正确"行为），见 docs/test.md 的 TS-31 台账。
    expect(result.apiRoutes.map(a => a.relativePath)).toEqual(['thing.test.ts']);
  });

  it('用户 ignore 命中路由与中间件目录时同样生效', async () => {
    write('routes/users.ts', 'export const GET = 1;\n');
    write('routes/admin.ts', 'export const GET = 1;\n');
    write('middleware/logger.ts', 'export default 1;\n');

    const result = await scan({ ignore: ['**/admin.ts', '**/logger.ts'] });

    expect(result.apiRoutes.map(a => a.relativePath)).toEqual(['users.ts']);
    expect(result.middlewares).toEqual([]);
  });
});

describe('TS-31 · app / server 入口探测', () => {
  it('server 入口：server.ts / server.dev.ts 各自被识别到正确字段', async () => {
    write('server.ts', 'export default 1;\n');
    write('server.dev.ts', 'export default 1;\n');

    const result = await scan();

    expect(result.serverEntry.shared.exists).toBe(true);
    expect(result.serverEntry.shared.relativePath).toBe('server.ts');
    expect(result.serverEntry.dev.exists).toBe(true);
    expect(result.serverEntry.dev.relativePath).toBe('server.dev.ts');
    expect(result.serverEntry.prod.exists).toBe(false);
  });

  it('只认约定扩展名：app.vue 是根组件，app.txt 不是', async () => {
    write('app.vue');
    const withVue = await scan();
    expect(withVue.appEntry.root?.relativePath).toBe('app.vue');

    rmSync(join(srcDir, 'app.vue'));
    write('app.txt', 'not a component');
    const withoutVue = await scan();
    expect(withoutVue.appEntry.root).toBeUndefined();
  });

  it('src/ 不存在时 scanProject 不抛错，返回空结果', async () => {
    rmSync(srcDir, { recursive: true, force: true });

    const result = await scan();

    expect(result.pages).toEqual([]);
    expect(result.apiRoutes).toEqual([]);
    expect(result.middlewares).toEqual([]);
    expect(result.appEntry.shared.exists).toBe(false);
    expect(result.serverEntry.shared.exists).toBe(false);
  });
});

describe('TS-31 · locales 扫描', () => {
  it('JSON locale：普通命名空间文件保留 messages 键（不误判为 wrapper）', async () => {
    write('locales/en.json', JSON.stringify({ hello: 'world', messages: { nested: 'x' } }));
    write('locales/default.json', JSON.stringify({ hi: 'x' }));

    const result = await scan();
    const en = result.locales.find(l => l.relativePath === 'en.json');

    // 文件里没有 name/dir/isDefault，所以 `messages` 是普通命名空间，不是 wrapper
    expect(en?.code).toBe('en');
    expect(en?.isDefault).toBe(false);
    expect(en?.namespace).toBeUndefined();
  });

  it('YAML locale：name 是 wrapper 元数据（不是命名空间），dir/isDefault 一并取下', async () => {
    write('locales/zh.yaml', 'name: 中文\ndir: rtl\nisDefault: true\nmessages:\n  hi: 你好\n');

    const result = await scan();
    const zh = result.locales.find(l => l.relativePath === 'zh.yaml');

    expect(zh?.name).toBe('中文');
    expect(zh?.dir).toBe('rtl');
    expect(zh?.isDefault).toBe(true);
    expect(result.defaultLocale).toBe('zh');
  });

  it('带数字前缀的 locale 文件名：前缀只影响顺序，code 取干净名', async () => {
    write('locales/20.fr.json', JSON.stringify({ name: 'Français', dir: 'ltr', messages: { hi: 'salut' } }));

    const result = await scan();
    const fr = result.locales.find(l => l.relativePath === '20.fr.json');

    expect(fr?.code).toBe('fr');
    expect(fr?.name).toBe('Français');
  });

  it('子目录 locale：目录名成为 code，文件名成为命名空间', async () => {
    write('locales/admin/index.json', JSON.stringify({ title: 'Admin' }));
    write('locales/admin/users.json', JSON.stringify({ title: 'Users' }));

    const result = await scan();
    const admin = result.locales.filter(l => l.code === 'admin');
    const index = admin.find(l => l.relativePath === 'admin/index.json');
    const users = admin.find(l => l.relativePath === 'admin/users.json');

    expect(admin).toHaveLength(2);
    // index 文件是「该目录本身」，不进命名空间
    expect(index?.namespace).toBeUndefined();
    expect(users?.namespace).toBe('users');
  });

  it('无 locale 文件时 defaultLocale 为 undefined（不是空字符串）', async () => {
    write('pages/index.vue');

    const result = await scan();

    expect(result.locales).toEqual([]);
    expect(result.defaultLocale).toBeUndefined();
  });
});

describe('TS-31 · API 路由导出探测（detectHttpExports）', () => {
  it('命名导出的大写方法名被识别为 HTTP 方法', () => {
    const result = detectHttpExportsFromCode('export const GET = 1;\nexport const POST = 1;\n');

    expect(result.exports.sort()).toEqual(['GET', 'POST']);
    expect(result.httpMethods.sort()).toEqual(['get', 'post']);
    expect(result.hasMeta).toBe(false);
  });

  it('无可识别方法时 httpMethods 为空（由扫描器决定回退到全部方法）', () => {
    const result = detectHttpExportsFromCode('export const foo = 1;\n');

    expect(result.exports).toEqual(['foo']);
    expect(result.httpMethods).toEqual([]);
  });

  it('export { … } 列表形态：取 `as` 之后的别名', () => {
    const result = detectHttpExportsFromCode('const handler = 1;\nexport { handler as GET, handler as POST };\n');

    expect(result.exports).toContain('GET');
    expect(result.httpMethods).toContain('get');
    expect(result.httpMethods).toContain('post');
  });

  it('export 列表的大小写不敏感：别名会被转大写后匹配 HTTP 方法', () => {
    const result = detectHttpExportsFromCode('const handler = 1;\nexport { handler as get };\n');

    // 列表分支对别名做 `toUpperCase()` 再比对，因此小写别名同样被识别。
    expect(result.exports).toContain('get');
    expect(result.httpMethods).toEqual(['get']);
  });

  it('export 列表里非方法的别名不进入 httpMethods', () => {
    const result = detectHttpExportsFromCode('const handler = 1;\nexport { handler as loadData };\n');

    expect(result.exports).toContain('loadData');
    expect(result.httpMethods).toEqual([]);
  });

  it('命名导出区分大小写：只有大写方法名算 HTTP 方法', () => {
    // `export const get = ...` 走命名导出分支，按原样比对 HTTP_METHODS（全大写）
    expect(detectHttpExportsFromCode('export const get = 1;\n').httpMethods).toEqual([]);
    expect(detectHttpExportsFromCode('export function get() {}\n').httpMethods).toEqual([]);
  });

  it('defineHandlerMeta 被调用即 hasMeta 为 true', () => {
    const result = detectHttpExportsFromCode(
      `import { defineHandlerMeta } from '@ubean/routes';\nexport const GET = defineHandlerMeta({ requiresAuth: true });\n`
    );

    expect(result.hasMeta).toBe(true);
  });

  it('仅仅 import defineHandlerMeta（没有调用）不算 hasMeta', () => {
    const result = detectHttpExportsFromCode(`import { defineHandlerMeta } from '@ubean/routes';\n`);

    expect(result.hasMeta).toBe(false);
  });

  it('探测是文本级的：注释里提到 defineHandlerMeta( 也会命中（已知边界，记录在案）', () => {
    const result = detectHttpExportsFromCode('// defineHandlerMeta( 暂时不用\nexport const GET = 1;\n');

    // 这是正则匹配的已知副作用。写在这里是为了让「方法探测不全等 AST 分析」这件事
    // 有可追踪的断言，而不是某天被当成 bug 顺手改掉。
    expect(result.hasMeta).toBe(true);
  });

  it('export const meta 的 requiresAuth 被提取为 fileMeta', () => {
    const result = detectHttpExportsFromCode('export const meta = { requiresAuth: true };\nexport const GET = 1;\n');

    expect(result.fileMeta).toEqual({ requiresAuth: true });
    expect(result.hasMeta).toBe(true);
  });

  it('export const meta = { requiresAuth: false } 也记录（显式 false 不等于未声明）', () => {
    const result = detectHttpExportsFromCode('export const meta = { requiresAuth: false };\n');

    expect(result.fileMeta).toEqual({ requiresAuth: false });
  });

  it('空文件不抛错，各项均为空', () => {
    const result = detectHttpExportsFromCode('');

    expect(result.exports).toEqual([]);
    expect(result.httpMethods).toEqual([]);
    expect(result.hasMeta).toBe(false);
    expect(result.fileMeta).toBeUndefined();
  });

  it('多次调用共享的正则不会残留 lastIndex（连续调用结果一致）', () => {
    const code = 'export const GET = 1;\n';
    const first = detectHttpExportsFromCode(code);
    const second = detectHttpExportsFromCode(code);

    expect(second.httpMethods).toEqual(first.httpMethods);
    expect(second.exports).toEqual(first.exports);
  });
});
