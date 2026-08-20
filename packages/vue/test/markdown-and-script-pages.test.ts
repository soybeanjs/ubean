/**
 * markdown 选项形态与 tsx/jsx 脚本页面测试。
 *
 * 覆盖:
 * - `markdown: boolean | 'mdx' | 'md'` 三种形态的扩展名解析行为
 * - 默认页面扩展名 `['vue', 'tsx', 'jsx']`(`.ts` 不再作为页面扩展名)
 * - `.reuse.ts` 元数据文件独立于页面扩展名约定,始终被扫描
 * - tsx/jsx 页面的 definePage 提取(name/path/cache/layout 等构建期能力)
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { extractDefinePageFromCode } from '../src/extract-page';
import { scanPages } from '../src/scan-pages';

let tmpDir: string;
let pagesDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ubean-vue-ext-'));
  pagesDir = join(tmpDir, 'src', 'pages');
  mkdirSync(pagesDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(relPath: string, content: string): void {
  const full = join(pagesDir, relPath);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
}

function scan(markdown?: boolean | 'mdx' | 'md') {
  return scanPages({ cwd: tmpDir, srcDir: 'src', pagesDir: 'pages', layoutsDir: 'layouts', markdown });
}

describe('markdown 选项形态', () => {
  it('默认 false:.md / .mdx 均不扫描', async () => {
    writeFile('guide.md', `# Guide`);
    writeFile('api.mdx', `# API`);
    const result = await scan();
    expect(result.pages).toHaveLength(0);
  });

  it("markdown: 'md' 仅扫描 .md", async () => {
    writeFile('guide.md', `# Guide`);
    writeFile('api.mdx', `# API`);
    const result = await scan('md');
    expect(result.pages.map(p => p.route)).toEqual(['/guide']);
    expect(result.pages[0].isMarkdown).toBe(true);
  });

  it("markdown: 'mdx' 仅扫描 .mdx", async () => {
    writeFile('guide.md', `# Guide`);
    writeFile('api.mdx', `# API`);
    const result = await scan('mdx');
    expect(result.pages.map(p => p.route)).toEqual(['/api']);
    expect(result.pages[0].isMarkdown).toBe(true);
  });

  it('markdown: true 同时扫描 .md 与 .mdx', async () => {
    writeFile('guide.md', `# Guide`);
    writeFile('api.mdx', `# API`);
    const result = await scan(true);
    expect(result.pages.map(p => p.route).sort()).toEqual(['/api', '/guide']);
    expect(result.pages.every(p => p.isMarkdown)).toBe(true);
  });
});

describe('默认页面扩展名(vue/tsx/jsx)', () => {
  it('tsx / jsx 页面被扫描', async () => {
    writeFile('about.tsx', `export default { render() { return null; } }`);
    writeFile('contact.jsx', `export default { render() { return null; } }`);
    const result = await scan();
    expect(result.pages.map(p => p.route).sort()).toEqual(['/about', '/contact']);
  });

  it('.ts 不再作为默认页面扩展名', async () => {
    writeFile('legacy.ts', `export default {}`);
    const result = await scan();
    expect(result.pages).toHaveLength(0);
  });

  it('extensions 可显式加回 ts', async () => {
    writeFile('legacy.ts', `export default {}`);
    const result = await scanPages({
      cwd: tmpDir,
      srcDir: 'src',
      pagesDir: 'pages',
      layoutsDir: 'layouts',
      extensions: ['vue', 'ts']
    });
    expect(result.pages.map(p => p.route)).toEqual(['/legacy']);
  });

  it('嵌套目录的 tsx 页面正确派生路由', async () => {
    writeFile('users/[id].tsx', `export default { render() { return null; } }`);
    const result = await scan();
    expect(result.pages[0].route).toBe('/users/:id');
    expect(result.pages[0].name).toBe('UsersId');
  });
});

describe('.reuse.ts / .reuse.js 独立约定', () => {
  it('默认扩展去掉 ts 后 .reuse.ts 仍被扫描', async () => {
    writeFile('about.vue', `<template>About</template>`);
    writeFile('about2.reuse.ts', `definePage({ reuse: 'About' });`);
    const result = await scan();
    const reuse = result.pages.find(p => p.isReuse);
    expect(reuse).toBeDefined();
    expect(reuse?.reuseTarget).toBe('About');
  });

  it('.reuse.js 同样被扫描(JS 元数据变体)', async () => {
    writeFile('about.vue', `<template>About</template>`);
    writeFile('about2.reuse.js', `definePage({ reuse: 'About' });`);
    const result = await scan();
    expect(result.pages.filter(p => p.isReuse)).toHaveLength(1);
  });

  it('markdown 关闭时 .reuse.ts 仍被扫描', async () => {
    writeFile('about.vue', `<template>About</template>`);
    writeFile('about2.reuse.ts', `definePage({ reuse: 'About' });`);
    const result = await scan(false);
    expect(result.pages.filter(p => p.isReuse)).toHaveLength(1);
  });

  it('.reuse.vue 不参与 reuse 约定(普通页面)', async () => {
    writeFile('about.vue', `<template>About</template>`);
    writeFile('copy.reuse.vue', `<template>Copy</template>`);
    const result = await scan();
    expect(result.pages.filter(p => p.isReuse)).toHaveLength(0);
    expect(result.pages.find(p => p.path === '/copy.reuse')).toBeDefined();
  });
});

describe('tsx/jsx 的 definePage 提取', () => {
  it('tsx 顶层 definePage 提取 name/path/cache/layout', () => {
    const code = [
      `import { defineComponent } from 'vue';`,
      `definePage({`,
      `  name: 'UserProfile',`,
      `  path: '/u/profile',`,
      `  cache: true,`,
      `  layout: ['default', 'admin'],`,
      `  transition: 'fade'`,
      `});`,
      `export default defineComponent({`,
      `  setup() {`,
      `    return () => <div class="page">Profile</div>;`,
      `  }`,
      `});`
    ].join('\n');
    const meta = extractDefinePageFromCode(code);
    expect(meta).not.toBeNull();
    expect(meta!.name).toBe('UserProfile');
    expect(meta!.path).toBe('/u/profile');
    expect(meta!.cache).toBe(true);
    expect(meta!.layout).toEqual(['default', 'admin']);
    expect(meta!.transition).toBe('fade');
  });

  it('jsx definePage 提取(含 JSX 元素的源码不受括号平衡影响)', () => {
    const code = [
      `definePage({ cache: false, requiresAuth: true });`,
      `export function Page() {`,
      `  const items = [{ id: 1, label: 'a)' }];`,
      `  return <ul>{items.map(i => <li key={i.id}>{i.label}</li>)}</ul>;`,
      `}`
    ].join('\n');
    const meta = extractDefinePageFromCode(code);
    expect(meta).not.toBeNull();
    expect(meta!.cache).toBe(false);
    expect(meta!.requiresAuth).toBe(true);
  });

  it('扫描管线:tsx 页面的 definePage 元数据进入扫描结果', async () => {
    writeFile(
      'settings.tsx',
      [
        `definePage({ name: 'Settings', cache: true, layout: 'admin' });`,
        `export default { setup() { return () => null; } };`
      ].join('\n')
    );
    const result = await scan();
    const page = result.pages.find(p => p.route === '/settings')!;
    expect(page.name).toBe('Settings');
    expect(page.cache).toBe(true);
    expect(page.layout).toBe('admin');
  });
});
