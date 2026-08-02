import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
/**
 * OPT-05 5b — @ubean/routing 特殊页 + reuse 路由扫描集成测试
 *
 * 覆盖 scanProject 对特殊页（404/loading/error）的检测与 reuse 路由
 * （.reuse.ts）的扫描、target 校验、cache 继承。
 *
 * 用临时目录创建 fixture 文件 + afterEach 清理（ADR-0002 测试边界）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { scanProject } from '../src/scan';

let tmpDir: string;
let pagesDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ubean-routing-scan-'));
  pagesDir = join(tmpDir, 'src', 'pages');
  mkdirSync(pagesDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

async function scan() {
  return scanProject({ cwd: tmpDir, srcDir: 'src' });
}

function writeFile(relPath: string, content: string): void {
  const full = join(pagesDir, relPath);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
}

describe('scanProject — 特殊页检测', () => {
  it('404.vue → notFoundPage 设置', async () => {
    writeFile('404.vue', '<template><div>Not Found</div></template>');
    const result = await scan();
    expect(result.notFoundPage).toBeDefined();
    expect(result.notFoundPage?.name).toBe('NotFound');
    // 404 不出现在常规 pages 列表
    expect(result.pages.find(p => p.name === 'NotFound')).toBeUndefined();
  });

  it('loading.vue → loadingPage 设置', async () => {
    writeFile('loading.vue', '<template><div>Loading...</div></template>');
    const result = await scan();
    expect(result.loadingPage).toBeDefined();
    expect(result.loadingPage?.name).toBe('Loading');
    expect(result.pages.find(p => p.name === 'Loading')).toBeUndefined();
  });

  it('error.vue → errorPage 设置', async () => {
    writeFile('error.vue', '<template><div>Error</div></template>');
    const result = await scan();
    expect(result.errorPage).toBeDefined();
    expect(result.errorPage?.name).toBe('Error');
    expect(result.pages.find(p => p.name === 'Error')).toBeUndefined();
  });

  it('404.ts 也被识别为特殊页', async () => {
    writeFile('404.ts', `export default { name: 'NotFound' }`);
    const result = await scan();
    expect(result.notFoundPage).toBeDefined();
  });

  it('404.md 也被识别为特殊页', async () => {
    writeFile('404.md', `# Not Found`);
    const result = await scan();
    expect(result.notFoundPage).toBeDefined();
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

  it('嵌套 users/404.vue → 常规路由，非特殊页', async () => {
    mkdirSync(join(pagesDir, 'users'), { recursive: true });
    writeFileSync(join(pagesDir, 'users', '404.vue'), '<template>users 404</template>');
    const result = await scan();
    expect(result.notFoundPage).toBeUndefined();
    // users/404.vue 作为常规路由存在
    const page = result.pages.find(p => p.route === '/users/404');
    expect(page).toBeDefined();
  });

  it('无特殊页 → notFoundPage/loadingPage/errorPage 均 undefined', async () => {
    writeFile('about.vue', '<template>About</template>');
    const result = await scan();
    expect(result.notFoundPage).toBeUndefined();
    expect(result.loadingPage).toBeUndefined();
    expect(result.errorPage).toBeUndefined();
  });
});

describe('scanProject — reuse 路由', () => {
  it('about.reuse.ts → isReuse=true, reuseTarget=About', async () => {
    writeFile('about.vue', '<template>About</template>');
    writeFile('about2.reuse.ts', `export default definePage({ reuse: 'About' });`);
    const result = await scan();
    const reusePage = result.pages.find(p => p.isReuse);
    expect(reusePage).toBeDefined();
    expect(reusePage?.isReuse).toBe(true);
    expect(reusePage?.reuseTarget).toBe('About');
  });

  it('reuse 页不出现在常规路由名集合中（isReuse 区分）', async () => {
    writeFile('about.vue', '<template>About</template>');
    writeFile('about2.reuse.ts', `export default definePage({ reuse: 'About' });`);
    const result = await scan();
    const reusePages = result.pages.filter(p => p.isReuse);
    const regularPages = result.pages.filter(p => !p.isReuse);
    expect(reusePages).toHaveLength(1);
    expect(regularPages).toHaveLength(1);
    expect(regularPages[0].name).toBe('About');
  });

  it('reuse target 不存在 → 仍扫描，reuseTarget 保留', async () => {
    // 只有 reuse 文件，没有 target
    writeFile('ghost.reuse.ts', `export default definePage({ reuse: 'NonExistent' });`);
    const result = await scan();
    const reusePage = result.pages.find(p => p.isReuse);
    expect(reusePage).toBeDefined();
    expect(reusePage?.reuseTarget).toBe('NonExistent');
  });

  it('reuse cache 继承：target cache:true → reuse cache:true', async () => {
    writeFile('about.vue', `<script setup>definePage({ cache: true });</script>`);
    writeFile('about2.reuse.ts', `export default definePage({ reuse: 'About' });`);
    const result = await scan();
    const reusePage = result.pages.find(p => p.isReuse);
    expect(reusePage?.cache).toBe(true);
  });

  it('reuse cache 显式 false → 不继承 target 的 true', async () => {
    writeFile('about.vue', `<script setup>definePage({ cache: true });</script>`);
    writeFile('about2.reuse.ts', `export default definePage({ reuse: 'About', cache: false });`);
    const result = await scan();
    const reusePage = result.pages.find(p => p.isReuse);
    expect(reusePage?.cache).toBe(false);
  });

  it('reuse cache 显式 true → 保持 true（即使 target 无 cache）', async () => {
    writeFile('about.vue', '<template>About</template>');
    writeFile('about2.reuse.ts', `export default definePage({ reuse: 'About', cache: true });`);
    const result = await scan();
    const reusePage = result.pages.find(p => p.isReuse);
    expect(reusePage?.cache).toBe(true);
  });

  it('target 无 cache → reuse cache 保持 undefined', async () => {
    writeFile('about.vue', '<template>About</template>');
    writeFile('about2.reuse.ts', `export default definePage({ reuse: 'About' });`);
    const result = await scan();
    const reusePage = result.pages.find(p => p.isReuse);
    expect(reusePage?.cache).toBeUndefined();
  });

  it('多个 reuse 页复用同一 target', async () => {
    writeFile('about.vue', '<template>About</template>');
    writeFile('about2.reuse.ts', `export default definePage({ reuse: 'About' });`);
    writeFile('about3.reuse.ts', `export default definePage({ reuse: 'About' });`);
    const result = await scan();
    const reusePages = result.pages.filter(p => p.isReuse);
    expect(reusePages).toHaveLength(2);
    expect(reusePages.every(p => p.reuseTarget === 'About')).toBe(true);
  });
});

describe('scanProject — 特殊页与 reuse 混合', () => {
  it('特殊页 + reuse + 常规页共存', async () => {
    writeFile('404.vue', '<template>404</template>');
    writeFile('about.vue', '<template>About</template>');
    writeFile('about2.reuse.ts', `export default definePage({ reuse: 'About' });`);
    const result = await scan();
    expect(result.notFoundPage).toBeDefined();
    const regular = result.pages.filter(p => !p.isReuse);
    const reuse = result.pages.filter(p => p.isReuse);
    expect(regular).toHaveLength(1);
    expect(reuse).toHaveLength(1);
    expect(regular[0].name).toBe('About');
    expect(reuse[0].reuseTarget).toBe('About');
  });
});
