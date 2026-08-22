import { describe, it, expect } from 'vitest';
import {
  VUE_PRESET,
  VUE_MACROS_PRESET,
  UBEAN_CLIENT_PRESET,
  UBEAN_SERVER_PRESET,
  HONO_OPENAPI_PRESET,
  BUILTIN_PRESETS,
  getBuiltinComposables
} from '../src/codegen/auto-imports';

describe('auto-import presets(自 @ubean/auto-imports 并入)', () => {
  it('UBEAN_CLIENT_PRESET 源自一等客户端入口 ubean/client', () => {
    expect(UBEAN_CLIENT_PRESET.from).toBe('ubean/client');
    const names = UBEAN_CLIENT_PRESET.imports as string[];
    // 内核核心符号抽查
    for (const sym of [
      'definePage',
      'defineApp',
      't',
      'useI18n',
      'setLocale',
      'useLocalePath',
      'useCacheViews',
      'enablePageCache',
      'usePageTransition',
      'reloadPage'
    ]) {
      expect(names).toContain(sym);
    }
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

  it('BUILTIN_PRESETS 聚合三组;getBuiltinComposables 展开为 Import[]', () => {
    expect(BUILTIN_PRESETS).toHaveLength(3);
    const imports = getBuiltinComposables();
    expect(imports.length).toBe(
      (UBEAN_CLIENT_PRESET.imports as string[]).length +
        (UBEAN_SERVER_PRESET.imports as string[]).length +
        (HONO_OPENAPI_PRESET.imports as string[]).length
    );
    expect(imports.every(i => typeof i.name === 'string' && typeof i.from === 'string')).toBe(true);
  });
});
