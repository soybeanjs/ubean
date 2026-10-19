/**
 * `@ubean/integrations/ui` 首帧主题脚本注入测试。
 *
 * 锁住三件事：
 * 1. `ui: true` 时脚本被注册进 registry（这是项目无需手动 `useHead()` 的唯一机制）；
 * 2. 注册发生在**插件工厂调用时**，不是 `buildStart` —— `prepareBuild()` 的
 *    `generateVirtualModulesToDisk()` 读 registry 生成服务端/ssg 入口，而它运行在
 *    任何 `buildStart` 之前。曾经写在 `buildStart` 里，dev 正常、产物全丢。
 * 3. 两条逃生口（`theme: false` / `theme: { initScript: false }`）确实不注册，
 *    让用户能退回手动注入。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { getHeadScripts, getCssImports, resetModuleRegistry } from '@ubean/build';
import { ubeanUiPlugin } from '../src/ui/index';

describe('ubeanUiPlugin() 首帧主题脚本', () => {
  beforeEach(() => {
    resetModuleRegistry();
  });

  it('ui 启用时立即注册脚本（不依赖 buildStart）', () => {
    const plugins = ubeanUiPlugin({});
    // 还没跑任何插件钩子，registry 里就应该有内容
    const scripts = getHeadScripts();
    expect(scripts).toContain('<script>');
    expect(plugins.some(p => p.name === 'ubean:ui')).toBe(true);
  });

  it('生成的脚本是可执行的 vean 主题初始化代码', () => {
    ubeanUiPlugin({});
    const scripts = getHeadScripts();
    // createThemeInitScript 的产物会读写主题信封，并打补丁到 <style id="vean-theme">
    expect(scripts).toContain('vean-theme');
  });

  it('自定义 darkSelector 反映到脚本里', () => {
    ubeanUiPlugin({ theme: { darkSelector: 'media' } });
    const scripts = getHeadScripts();
    expect(scripts).toContain('prefers-color-scheme');
  });

  it('theme: false → 不注册脚本（colorMode 可继续使用）', () => {
    ubeanUiPlugin({ theme: false });
    expect(getHeadScripts()).toBe('');
  });

  it('theme: { initScript: false } → 不注册脚本', () => {
    ubeanUiPlugin({ theme: { initScript: false } });
    expect(getHeadScripts()).toBe('');
  });

  it('enabled: false → 不注册任何东西', () => {
    ubeanUiPlugin({ enabled: false });
    expect(getHeadScripts()).toBe('');
    expect(getCssImports()).toEqual([]);
  });

  it('enabled 未设置（配置面只有 disabled）时默认启用', () => {
    // 配置面的 `disabled` 会被 extractBuiltinOptions() 剥掉，工厂看到的是 {}
    ubeanUiPlugin({});
    expect(getHeadScripts()).not.toBe('');
  });
});

describe('ubeanUiPlugin() CSS 注册', () => {
  beforeEach(() => {
    resetModuleRegistry();
  });

  it('默认注入 @vean/ui/styles.css', () => {
    ubeanUiPlugin({});
    expect(getCssImports()).toContain('@vean/ui/styles.css');
  });

  it('css: false → 不注入（UnoCSS 模式）', () => {
    ubeanUiPlugin({ css: false });
    expect(getCssImports()).toEqual([]);
  });
});
