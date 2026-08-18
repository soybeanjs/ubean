/**
 * OPT-08 — @ubean/shared 路径工具单元测试
 *
 * 覆盖 path.ts 主路径：normalizePath / getDirname / getBasename /
 * getExtension / getStem / pathToTitle。
 * (路由相关函数 stripRouteGroups / parseMatchers / filePathToRoute 已下沉至
 *  @ubean/scan,见 packages/vue/test/route-path.test.ts)
 */
import { describe, it, expect } from 'vitest';
import { normalizePath, getDirname, getBasename, getExtension, getStem, pathToTitle } from '../src/path';

describe('normalizePath()', () => {
  it('替换反斜杠', () => {
    expect(normalizePath('a\\b\\c')).toBe('/a/b/c');
  });

  it('去除首尾多余斜杠', () => {
    expect(normalizePath('///a/b///')).toBe('/a/b');
  });

  it('合并连续斜杠', () => {
    expect(normalizePath('a//b///c')).toBe('/a/b/c');
  });

  it('空字符串 → /', () => {
    expect(normalizePath('')).toBe('/');
  });
});

describe('getDirname()', () => {
  it('返回目录部分', () => {
    expect(getDirname('a/b/c.ts')).toBe('a/b');
  });

  it('无目录时返回 /', () => {
    expect(getDirname('file.ts')).toBe('/');
  });
});

describe('getBasename()', () => {
  it('返回文件名（含扩展名）', () => {
    expect(getBasename('a/b/c.ts')).toBe('c.ts');
  });

  it('无目录时返回自身', () => {
    expect(getBasename('file.ts')).toBe('file.ts');
  });
});

describe('getExtension()', () => {
  it('返回小写扩展名（不含点）', () => {
    expect(getExtension('a/b/c.TS')).toBe('ts');
  });

  it('无扩展名时返回空字符串', () => {
    expect(getExtension('README')).toBe('');
  });
});

describe('getStem()', () => {
  it('去除最后一个扩展名（保留路径其余部分）', () => {
    // getStem 直接对入参做 replace，不先提取 basename
    expect(getStem('a/b/c.ts')).toBe('a/b/c');
  });

  it('对纯文件名去除扩展名', () => {
    expect(getStem('c.ts')).toBe('c');
  });

  it('无扩展名时原样返回', () => {
    expect(getStem('README')).toBe('README');
  });
});

describe('pathToTitle()', () => {
  it('普通文件名 → 首字母大写', () => {
    expect(pathToTitle('about.vue')).toBe('About');
  });

  it('kebab-case → 各段首字母大写并以空格连接', () => {
    expect(pathToTitle('user-profile.vue')).toBe('User Profile');
  });

  it('index 文件 → 取父目录名', () => {
    expect(pathToTitle('users/index.vue')).toBe('Users');
  });

  it('根 index → home', () => {
    expect(pathToTitle('index.vue')).toBe('Home');
  });
});
