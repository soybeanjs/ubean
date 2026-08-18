/**
 * OPT-08 — @ubean/shared 字符串工具单元测试
 *
 * 覆盖 capitalize 主路径与边界。
 */
import { describe, it, expect } from 'vitest';
import { capitalize } from '../src/string';

describe('capitalize()', () => {
  it('首字母大写', () => {
    expect(capitalize('hello')).toBe('Hello');
  });

  it('已大写时保持不变', () => {
    expect(capitalize('Hello')).toBe('Hello');
  });

  it('空字符串返回空', () => {
    expect(capitalize('')).toBe('');
  });

  it('仅首字母大写，其余保持原样', () => {
    expect(capitalize('hELLO')).toBe('HELLO');
  });

  it('单字符', () => {
    expect(capitalize('a')).toBe('A');
  });

  it('数字开头不变', () => {
    expect(capitalize('1abc')).toBe('1abc');
  });
});
