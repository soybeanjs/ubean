import { describe, it, expect } from 'vitest';
import {
  VUE_PRESET,
  VUE_MACROS_PRESET,
  UBEAN_CLIENT_PRESET,
  VUE_ROUTER_PRESET,
  VUE_I18N_PRESET,
  UBEAN_SERVER_PRESET,
  HONO_OPENAPI_PRESET,
  BUILTIN_PRESETS,
  getBuiltinComposables,
  getAutoImportPresets,
  resolveAutoImportsConfig,
  resolveComponentsConfig
} from '../src/codegen/auto-imports';

describe('auto-import presets(自 @ubean/auto-imports 并入)', () => {
  it('UBEAN_CLIENT_PRESET 源自一等客户端入口 ubean/client', () => {
    expect(UBEAN_CLIENT_PRESET.from).toBe('ubean/client');
    const names = UBEAN_CLIENT_PRESET.imports as string[];
    // 内核核心符号抽查
    for (const sym of [
      'definePage',
      'defineApp',
      'setLocale',
      'useLocalePath',
      'useCacheViews',
      'enablePageCache',
      'usePageTransition',
      'reloadPage'
    ]) {
      expect(names).toContain(sym);
    }
    // 第三方 API 不再经 ubean 包装透传:useI18n 直源 vue-i18n,t 已移除
    expect(names).not.toContain('useI18n');
    expect(names).not.toContain('t');
  });

  it('UBEAN_SERVER_PRESET 源自主入口 ubean', () => {
    expect(UBEAN_SERVER_PRESET.from).toBe('ubean');
    expect(UBEAN_SERVER_PRESET.imports as string[]).toContain('defineHandlerMeta');
  });

  it('VUE_PRESET / VUE_MACROS_PRESET / HONO_OPENAPI_PRESET 形态完整', () => {
    expect(VUE_PRESET.from).toBe('vue');
    expect((VUE_PRESET.imports as string[]).length).toBeGreaterThan(40);
    expect(VUE_MACROS_PRESET.from).toBe('vue/macros');
    expect(HONO_OPENAPI_PRESET.imports).toEqual(['validator', 'describeRoute']);
  });

  it('VUE_ROUTER_PRESET / VUE_I18N_PRESET 直源第三方;client 预设不再透传 useRouter', () => {
    expect(VUE_ROUTER_PRESET.from).toBe('vue-router');
    expect(VUE_ROUTER_PRESET.imports).toContain('useRouter');
    expect(VUE_I18N_PRESET.from).toBe('vue-i18n');
    expect(VUE_I18N_PRESET.imports).toContain('useI18n');
    // 第三方 API 不再经 ubean 透传:useRouter 改由 vue-router 直源
    expect(UBEAN_CLIENT_PRESET.imports as string[]).not.toContain('useRouter');
  });

  it('resolveAutoImportsConfig:默认最小(仅 ubean);true/false/对象三态正确归一化', () => {
    // 默认与 true:仅 ubean 内置 API
    for (const input of [undefined, true]) {
      const resolved = resolveAutoImportsConfig(input);
      expect(resolved.enabled).toBe(true);
      expect(resolved.ubean).toBe(true);
      expect(resolved.vue).toBe(false);
      expect(resolved.vueRouter).toBe(false);
      expect(resolved.vueI18n).toBe(false);
      expect(resolved.honoOpenapi).toBe(false);
    }

    // false:整体关闭
    expect(resolveAutoImportsConfig(false).enabled).toBe(false);

    // 对象:分库开关 + 透传选项保留
    const obj = resolveAutoImportsConfig({ vue: true, vueI18n: true, dts: 'custom.d.ts' });
    expect(obj.vue).toBe(true);
    expect(obj.vueI18n).toBe(true);
    expect(obj.vueRouter).toBe(false);
    expect(obj.options.dts).toBe('custom.d.ts');
  });

  it('getAutoImportPresets:按分库开关组装内置预设', () => {
    const minimal = getAutoImportPresets(resolveAutoImportsConfig(undefined));
    expect(minimal).toEqual([UBEAN_CLIENT_PRESET, UBEAN_SERVER_PRESET]);

    const full = getAutoImportPresets(
      resolveAutoImportsConfig({ vue: true, vueRouter: true, vueI18n: true, honoOpenapi: true })
    );
    expect(full).toEqual([
      UBEAN_CLIENT_PRESET,
      UBEAN_SERVER_PRESET,
      VUE_PRESET,
      VUE_MACROS_PRESET,
      VUE_ROUTER_PRESET,
      VUE_I18N_PRESET,
      HONO_OPENAPI_PRESET
    ]);
  });

  it('resolveComponentsConfig:默认开启 dirs 扫描与内置组件;false 仅关扫描', () => {
    const def = resolveComponentsConfig(undefined);
    expect(def.enabled).toBe(true);
    expect(def.ubean).toBe(true);

    const off = resolveComponentsConfig(false);
    expect(off.enabled).toBe(false);
    expect(off.ubean).toBe(true);

    const noBuiltin = resolveComponentsConfig({ ubean: false, dirs: ['src/ui'] });
    expect(noBuiltin.enabled).toBe(true);
    expect(noBuiltin.ubean).toBe(false);
    expect(noBuiltin.options.dirs).toEqual(['src/ui']);
  });

  it('BUILTIN_PRESETS 聚合五组;getBuiltinComposables 展开为 Import[]', () => {
    expect(BUILTIN_PRESETS).toHaveLength(5);
    const imports = getBuiltinComposables();
    expect(imports.length).toBe(
      (UBEAN_CLIENT_PRESET.imports as string[]).length +
        (VUE_ROUTER_PRESET.imports as string[]).length +
        (VUE_I18N_PRESET.imports as string[]).length +
        (UBEAN_SERVER_PRESET.imports as string[]).length +
        (HONO_OPENAPI_PRESET.imports as string[]).length
    );
    expect(imports.every(i => typeof i.name === 'string' && typeof i.from === 'string')).toBe(true);
  });
});
