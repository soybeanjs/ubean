/**
 * dev watch 判据（content 插件）。
 *
 * 回归的是「改任何文件都整页重载」这个症状：`server.watcher` 监听整个项目，早期实现里
 * `change` / `add` / `unlink` 三个 handler 都不看文件是谁，于是改页面组件正文也会被
 * `full-reload` 刷掉（实测 `examples/ubean-test`：改 `src/pages/index.vue` 时浏览器收到
 * content 插件发的那条 `{"type":"full-reload"}`，把 Vue 的 HMR 顶掉）。
 */
import { describe, it, expect } from 'vitest';
import { createContentChangeFilter } from '../src/vite';

const ROOT = '/proj';
const filter = createContentChangeFilter({
  rootDir: ROOT,
  sources: {
    content: { dir: 'content' },
    blog: { dir: 'content/blog' }
  },
  defaultDir: 'content'
});

describe('createContentChangeFilter', () => {
  it('内容源目录里的 md / mdx / json / yaml 变更算内容变更', () => {
    expect(filter('/proj/content/index.md')).toBe(true);
    expect(filter('/proj/content/guide/intro.mdx')).toBe(true);
    expect(filter('/proj/content/blog/post.json')).toBe(true);
    expect(filter('/proj/content/blog/post.yaml')).toBe(true);
    expect(filter('/proj/content/blog/post.yml')).toBe(true);
  });

  it('页面组件 / 样式 / 入口文件不算内容变更（否则会整页重载）', () => {
    expect(filter('/proj/src/pages/index.vue')).toBe(false);
    expect(filter('/proj/src/app.ts')).toBe(false);
    expect(filter('/proj/src/styles/global.css')).toBe(false);
    expect(filter('/proj/content/index.vue')).toBe(false);
  });

  it('内容源目录之外的同名文件不算（前缀相同但不是子路径）', () => {
    expect(filter('/proj/content-extra/post.md')).toBe(false);
    expect(filter('/proj/src/content/post.md')).toBe(false);
  });

  it('未配置 sources 时退回 defaultDir', () => {
    const fallback = createContentChangeFilter({ rootDir: ROOT, defaultDir: 'content' });
    expect(fallback('/proj/content/post.md')).toBe(true);
    expect(fallback('/proj/pages/post.md')).toBe(false);
  });
});
