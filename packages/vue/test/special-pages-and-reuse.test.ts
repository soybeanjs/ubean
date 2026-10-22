/**
 * 特殊页 + reuse 路由扫描集成测试(页面路由所有权归属 @ubean/vue)。
 *
 * 覆盖 scanPages 对特殊页（404/loading/error）的检测与 reuse 路由
 * （.reuse.ts）的扫描、target 校验、cache 继承。
 * `@ubean/scan` 的 `scanProject` 委托本扫描器(聚合层另有委托测试)。
 *
 * 用临时目录创建 fixture 文件 + afterEach 清理（ADR-0002 测试边界）。
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { scanPages } from '../src/scan-pages';

let tmpDir: string;
let pagesDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ubean-vue-scan-'));
  pagesDir = join(tmpDir, 'src', 'pages');
  mkdirSync(pagesDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

async function scan() {
  // 框架聚合等价配置:markdown 开启、head 开启
  return scanPages({
    cwd: tmpDir,
    srcDir: 'src',
    pagesDir: 'pages',
    layoutsDir: 'layouts',
    markdown: true,
    head: true
  });
}

function writeFile(relPath: string, content: string): void {
  const full = join(pagesDir, relPath);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
}

describe('scanPages — 内置全局路由', () => {
  it('404.vue → pages 里的内置全局捕获条目（名字 NotFound）', async () => {
    writeFile('404.vue', '<template><div>Not Found</div></template>');
    const result = await scan();
    const page = result.pages.find(p => p.name === 'NotFound');
    expect(page).toBeDefined();
    expect(page?.route).toBe('/:pathMatch(.*)*');
    expect(page?.isBuiltin).toBe(true);
    expect(page?.isGlobalCatchAll).toBe(true);
    expect(page?.routable).toBe(true);
    // 公开契约字段保留（别名指向同一条目）
    expect(result.notFoundPage).toBe(page);
  });

  it('404/index.vue → 同样识别为内置全局捕获路由', async () => {
    writeFile('404/index.vue', '<template>Not Found</template>');
    const result = await scan();
    expect(result.notFoundPage?.name).toBe('NotFound');
    expect(result.notFoundPage?.isGlobalCatchAll).toBe(true);
  });

  it('not-found.vue → NotFound 的别名声明形态', async () => {
    writeFile('not-found.vue', '<template>Not Found</template>');
    const result = await scan();
    expect(result.notFoundPage?.name).toBe('NotFound');
    expect(result.notFoundPage?.route).toBe('/:pathMatch(.*)*');
  });

  it('404.vue + not-found.vue 同时存在 → 只注册一条，不重复', async () => {
    writeFile('404.vue', '<template>Not Found A</template>');
    writeFile('not-found.vue', '<template>Not Found B</template>');
    const result = await scan();
    expect(result.pages.filter(p => p.name === 'NotFound')).toHaveLength(1);
  });

  it('pages/index.vue → Root 内置路由（名字 Index，路径 /）', async () => {
    writeFile('index.vue', '<template>Home</template>');
    const result = await scan();
    const page = result.pages.find(p => p.route === '/');
    expect(page?.name).toBe('Index');
    expect(page?.isBuiltin).toBe(true);
    expect(page?.isGlobalCatchAll).toBeUndefined();
    expect(page?.routable).toBe(true);
  });

  it('pages/root.vue 与 pages/root/index.vue 也是 Root 的声明形态', async () => {
    writeFile('root.vue', '<template>Home</template>');
    const a = await scan();
    expect(a.pages.find(p => p.route === '/')?.name).toBe('Index');
    expect(a.pages.find(p => p.route === '/')?.isBuiltin).toBe(true);

    rmSync(join(pagesDir, 'root.vue'));
    writeFile('root/index.vue', '<template>Home</template>');
    const b = await scan();
    expect(b.pages.find(p => p.route === '/')?.name).toBe('Index');
  });

  it('显式 definePage({ name: "NotFound" }) 撞保留名 → 警告并跳过注册', async () => {
    writeFile('404.vue', '<template>Not Found</template>');
    writeFile('ghost.vue', `<script setup>definePage({ name: 'NotFound' });</script><template>ghost</template>`);
    const result = await scan();
    const ghost = result.pages.find(p => p.relativePath === 'ghost.vue');
    expect(ghost?.routable).toBe(false);
    // 条目仍在清单里（宿主菜单/目录仍能消费）
    expect(result.pages.filter(p => p.name === 'NotFound')).toHaveLength(2);
  });

  it('loading.vue / error.vue → 组件槽位，留在 pages 但不参与路由', async () => {
    writeFile('loading.vue', '<template>Loading...</template>');
    writeFile('error.vue', '<template>Error</template>');
    const result = await scan();
    expect(result.loadingPage?.name).toBe('Loading');
    expect(result.loadingPage?.routable).toBe(false);
    expect(result.errorPage?.name).toBe('Error');
    expect(result.errorPage?.routable).toBe(false);
    expect(result.pages.find(p => p.name === 'Loading')?.routable).toBe(false);
    expect(result.pages.find(p => p.name === 'Error')?.routable).toBe(false);
  });

  it('404.tsx 也被识别为内置全局捕获路由(默认扩展含 tsx)', async () => {
    writeFile('404.tsx', `export default { name: 'NotFound' }`);
    const result = await scan();
    expect(result.notFoundPage?.isGlobalCatchAll).toBe(true);
  });

  it('404.md 也被识别为内置全局捕获路由', async () => {
    writeFile('404.md', `# Not Found`);
    const result = await scan();
    expect(result.notFoundPage?.isGlobalCatchAll).toBe(true);
  });

  it('同时存在 404/loading/error → 三者均设置', async () => {
    writeFile('404.vue', '<template>404</template>');
    writeFile('loading.vue', '<template>loading</template>');
    writeFile('error.vue', '<template>error</template>');
    const result = await scan();
    expect(result.notFoundPage).toBeDefined();
    expect(result.loadingPage).toBeDefined();
    expect(result.errorPage).toBeDefined();
  });

  it('嵌套 users/404.vue → 常规路由，非内置路由', async () => {
    mkdirSync(join(pagesDir, 'users'), { recursive: true });
    writeFileSync(join(pagesDir, 'users', '404.vue'), '<template>users 404</template>');
    const result = await scan();
    expect(result.notFoundPage).toBeUndefined();
    // users/404.vue 作为常规路由存在
    const page = result.pages.find(p => p.route === '/users/404');
    expect(page).toBeDefined();
    expect(page?.isBuiltin).toBeUndefined();
  });

  it('无内置页 → notFoundPage/loadingPage/errorPage 均 undefined', async () => {
    writeFile('about.vue', '<template>About</template>');
    const result = await scan();
    expect(result.notFoundPage).toBeUndefined();
    expect(result.loadingPage).toBeUndefined();
    expect(result.errorPage).toBeUndefined();
  });
});

describe('scanPages — reuse 路由', () => {
  it('about.reuse.ts → pageKind=reuse, reuseTarget=About', async () => {
    writeFile('about.vue', '<template>About</template>');
    writeFile('about2.reuse.ts', `definePage({ reuse: 'About' });`);
    const result = await scan();
    const reusePage = result.pages.find(p => p.pageKind === 'reuse');
    expect(reusePage).toBeDefined();
    expect(reusePage?.pageKind).toBe('reuse');
    expect(reusePage?.reuseTarget).toBe('About');
  });

  it('reuse 页不出现在常规路由名集合中（pageKind 区分）', async () => {
    writeFile('about.vue', '<template>About</template>');
    writeFile('about2.reuse.ts', `definePage({ reuse: 'About' });`);
    const result = await scan();
    const reusePages = result.pages.filter(p => p.pageKind === 'reuse');
    const regularPages = result.pages.filter(p => p.pageKind !== 'reuse');
    expect(reusePages).toHaveLength(1);
    expect(regularPages).toHaveLength(1);
    expect(regularPages[0].name).toBe('About');
  });

  it('reuse target 不存在 → 仍扫描，reuseTarget 保留', async () => {
    // 只有 reuse 文件，没有 target
    writeFile('ghost.reuse.ts', `definePage({ reuse: 'NonExistent' });`);
    const result = await scan();
    const reusePage = result.pages.find(p => p.pageKind === 'reuse');
    expect(reusePage).toBeDefined();
    expect(reusePage?.reuseTarget).toBe('NonExistent');
  });

  it('reuse cache 继承：target cache:true → reuse cache:true', async () => {
    writeFile('about.vue', `<script setup>definePage({ cache: true });</script>`);
    writeFile('about2.reuse.ts', `definePage({ reuse: 'About' });`);
    const result = await scan();
    const reusePage = result.pages.find(p => p.pageKind === 'reuse');
    expect(reusePage?.cache).toBe(true);
  });

  it('reuse cache 显式 false → 不继承 target 的 true', async () => {
    writeFile('about.vue', `<script setup>definePage({ cache: true });</script>`);
    writeFile('about2.reuse.ts', `definePage({ reuse: 'About', cache: false });`);
    const result = await scan();
    const reusePage = result.pages.find(p => p.pageKind === 'reuse');
    expect(reusePage?.cache).toBe(false);
  });

  it('reuse cache 显式 true → 保持 true（即使 target 无 cache）', async () => {
    writeFile('about.vue', '<template>About</template>');
    writeFile('about2.reuse.ts', `definePage({ reuse: 'About', cache: true });`);
    const result = await scan();
    const reusePage = result.pages.find(p => p.pageKind === 'reuse');
    expect(reusePage?.cache).toBe(true);
  });

  it('target 无 cache → reuse cache 保持 undefined', async () => {
    writeFile('about.vue', '<template>About</template>');
    writeFile('about2.reuse.ts', `definePage({ reuse: 'About' });`);
    const result = await scan();
    const reusePage = result.pages.find(p => p.pageKind === 'reuse');
    expect(reusePage?.cache).toBeUndefined();
  });

  it('多个 reuse 页复用同一 target', async () => {
    writeFile('about.vue', '<template>About</template>');
    writeFile('about2.reuse.ts', `definePage({ reuse: 'About' });`);
    writeFile('about3.reuse.ts', `definePage({ reuse: 'About' });`);
    const result = await scan();
    const reusePages = result.pages.filter(p => p.pageKind === 'reuse');
    expect(reusePages).toHaveLength(2);
    expect(reusePages.every(p => p.reuseTarget === 'About')).toBe(true);
  });

  it('about.reuse.js → 同样识别为 reuse 元数据页', async () => {
    writeFile('about.vue', '<template>About</template>');
    writeFile('about2.reuse.js', `definePage({ reuse: 'About' });`);
    const result = await scan();
    const reusePage = result.pages.find(p => p.pageKind === 'reuse');
    expect(reusePage).toBeDefined();
    expect(reusePage?.reuseTarget).toBe('About');
    expect(reusePage?.route).toBe('/about2');
  });

  it('xxx.reuse.vue 不匹配 reuse 约定,按普通页面处理', async () => {
    // `.reuse.vue` 是带模板的真实组件,不是元数据文件 —— 不应有 reuse 语义
    writeFile('about.vue', '<template>About</template>');
    writeFile('copy.reuse.vue', '<template>Copy of About</template>');
    const result = await scan();
    expect(result.pages.filter(p => p.pageKind === 'reuse')).toHaveLength(0);
    const copy = result.pages.find(p => p.path === '/copy.reuse');
    expect(copy).toBeDefined();
    expect(copy?.reuseTarget).toBeUndefined();
  });
});

describe('scanPages — 内置路由与 reuse 混合', () => {
  it('内置路由 + reuse + 常规页共存', async () => {
    writeFile('404.vue', '<template>404</template>');
    writeFile('about.vue', '<template>About</template>');
    writeFile('about2.reuse.ts', `definePage({ reuse: 'About' });`);
    const result = await scan();
    expect(result.notFoundPage?.isGlobalCatchAll).toBe(true);
    const regular = result.pages.filter(p => p.pageKind !== 'reuse');
    const reuse = result.pages.filter(p => p.pageKind === 'reuse');
    // 常规 = About + 内置 NotFound
    expect(regular.map(p => p.name).sort()).toEqual(['About', 'NotFound']);
    expect(reuse).toHaveLength(1);
    expect(reuse[0].reuseTarget).toBe('About');
  });
});
