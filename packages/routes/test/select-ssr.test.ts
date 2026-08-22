import { describe, it, expect } from 'vitest';
import { resolveSelectSsr, ssrModeHeader } from '../src/select-ssr';

describe('resolveSelectSsr', () => {
  it('page ssr:false skips loader (marketing CSR)', () => {
    const resolved = resolveSelectSsr({
      pageSsr: false,
      excludedByGlob: false,
      streaming: false
    });
    expect(resolved).toEqual({ mode: 'csr', runLoader: false, useRenderer: false });
    expect(ssrModeHeader(resolved.mode)).toBe('csr');
  });

  it('data-only runs loader without HTML SSR', () => {
    const resolved = resolveSelectSsr({
      routeRuleSsr: 'data-only',
      excludedByGlob: false,
      streaming: true
    });
    expect(resolved).toEqual({ mode: 'data-only', runLoader: true, useRenderer: false });
    expect(ssrModeHeader(resolved.mode)).toBe('data-only');
  });

  it('page meta wins over routeRules', () => {
    const resolved = resolveSelectSsr({
      pageSsr: true,
      routeRuleSsr: false,
      excludedByGlob: true,
      streaming: false
    });
    expect(resolved.mode).toBe('ssr');
    expect(resolved.useRenderer).toBe(true);
  });

  it('glob exclude keeps loader (backward compatible CSR shell)', () => {
    const resolved = resolveSelectSsr({
      excludedByGlob: true,
      streaming: false
    });
    expect(resolved).toEqual({ mode: 'csr', runLoader: true, useRenderer: false });
  });

  it('ppr forces streaming SSR', () => {
    const resolved = resolveSelectSsr({
      ppr: true,
      excludedByGlob: true,
      streaming: false
    });
    expect(resolved.mode).toBe('streaming');
    expect(resolved.useRenderer).toBe(true);
  });
});
