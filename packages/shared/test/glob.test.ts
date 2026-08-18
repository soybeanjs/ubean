/**
 * OPT-08 — @ubean/shared glob 匹配单元测试
 *
 * 覆盖 matchGlob / matchAnyGlob 主路径与边界（高扇入符号）。
 */
import { describe, it, expect } from 'vitest';
import { matchGlob, matchAnyGlob } from '../src/glob';

describe('matchGlob()', () => {
  describe('字面量匹配', () => {
    it('完全相等时匹配', () => {
      expect(matchGlob('/about', '/about')).toBe(true);
    });

    it('不完全相等时不匹配', () => {
      expect(matchGlob('/about', '/about/me')).toBe(false);
      expect(matchGlob('/about', '/aboutus')).toBe(false);
    });
  });

  describe('** 多段递归', () => {
    it('pattern === "**" 匹配任意 route', () => {
      expect(matchGlob('/anything', '**')).toBe(true);
      expect(matchGlob('/a/b/c', '**')).toBe(true);
      expect(matchGlob('/', '**')).toBe(true);
    });

    it('pattern === "/**" 匹配任意 route', () => {
      expect(matchGlob('/anything', '/**')).toBe(true);
      expect(matchGlob('/a/b/c', '/**')).toBe(true);
    });

    it('以 "/**" 结尾时匹配前缀目录及其子路径', () => {
      expect(matchGlob('/blog/a', '/blog/**')).toBe(true);
      expect(matchGlob('/blog/a/b/c', '/blog/**')).toBe(true);
      expect(matchGlob('/blog', '/blog/**')).toBe(true);
    });

    it('以 "/**" 结尾时不匹配其他前缀', () => {
      expect(matchGlob('/news/a', '/blog/**')).toBe(false);
    });
  });

  describe('* 单段', () => {
    it('以 "/*" 结尾时匹配单段子路径', () => {
      expect(matchGlob('/blog/a', '/blog/*')).toBe(true);
    });

    it('以 "/*" 结尾时不匹配多段', () => {
      expect(matchGlob('/blog/a/b', '/blog/*')).toBe(false);
    });

    it('以 "/*" 结尾时不匹配前缀本身', () => {
      expect(matchGlob('/blog', '/blog/*')).toBe(false);
    });
  });

  describe('一般 glob（正则转换）', () => {
    it('* 转换为 [^/]*（不跨段）', () => {
      expect(matchGlob('/abc', '/*')).toBe(true);
      expect(matchGlob('/a/b', '/*')).toBe(false);
    });

    it('转义正则元字符', () => {
      expect(matchGlob('/a.b', '/a.b')).toBe(true);
      expect(matchGlob('/aXb', '/a.b')).toBe(false);
    });

    it('** 转换为 .*（跨段）', () => {
      expect(matchGlob('/a/b/c', '/a/**/c')).toBe(true);
    });
  });
});

describe('matchAnyGlob()', () => {
  it('任一 pattern 匹配即返回 true', () => {
    expect(matchAnyGlob('/blog/a', ['/news/*', '/blog/*'])).toBe(true);
  });

  it('全部 pattern 不匹配时返回 false', () => {
    expect(matchAnyGlob('/blog/a', ['/news/*', '/pages/*'])).toBe(false);
  });

  it('空 patterns 数组返回 false', () => {
    expect(matchAnyGlob('/any', [])).toBe(false);
  });

  it('含 "**" 通配时总是 true', () => {
    expect(matchAnyGlob('/anything/at/all', ['**'])).toBe(true);
  });
});
