/**
 * 首帧 `<head>` 脚本的注册表通道（`registerHeadScript` / `composeHeadScripts`）。
 *
 * 三条注入路径（dev `transformIndexHtml`、fullstack 服务端入口、ssg 静态入口）
 * 都从这一对函数取值 —— 它们必须看到同一份内容，否则 dev 与产物不一致，
 * 而这种不一致只在生产暴露（dev 每次请求重读注册表，产物是构建时快照）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { getHeadScripts, registerHeadScript, resetModuleRegistry } from '../src/registry';
import { composeHeadScripts } from '../src/vue-virtual-modules';

describe('registerHeadScript() / getHeadScripts()', () => {
  beforeEach(() => {
    resetModuleRegistry();
  });

  it('未注册时返回空串', () => {
    expect(getHeadScripts()).toBe('');
  });

  it('注册后可读回', () => {
    registerHeadScript('<script>1</script>');
    expect(getHeadScripts()).toBe('<script>1</script>');
  });

  it('相同脚本重复注册只保留一份', () => {
    registerHeadScript('<script>1</script>');
    registerHeadScript('<script>1</script>');
    expect(getHeadScripts()).toBe('<script>1</script>');
  });

  it('多个脚本按注册顺序拼接', () => {
    registerHeadScript('<script>1</script>');
    registerHeadScript('<script>2</script>');
    expect(getHeadScripts()).toBe('<script>1</script>\n<script>2</script>');
  });

  it('空串被忽略', () => {
    registerHeadScript('');
    expect(getHeadScripts()).toBe('');
  });

  it('resetModuleRegistry 清空', () => {
    registerHeadScript('<script>1</script>');
    resetModuleRegistry();
    expect(getHeadScripts()).toBe('');
  });
});

describe('composeHeadScripts()', () => {
  beforeEach(() => {
    resetModuleRegistry();
  });

  it('两边都空 → 空串（colorMode: false 且 ui 未启用）', () => {
    expect(composeHeadScripts('')).toBe('');
  });

  it('只有 colorMode（ui 未启用）→ 原样返回', () => {
    expect(composeHeadScripts('<script>cm</script>')).toBe('<script>cm</script>');
  });

  it('只有 ui 脚本（colorMode 被配置层关闭）→ 原样返回', () => {
    registerHeadScript('<script>vean</script>');
    expect(composeHeadScripts('')).toBe('<script>vean</script>');
  });

  it('两个都有时 ui 在前（先注册先执行）', () => {
    registerHeadScript('<script>vean</script>');
    expect(composeHeadScripts('<script>cm</script>')).toBe('<script>vean</script>\n<script>cm</script>');
  });
});
