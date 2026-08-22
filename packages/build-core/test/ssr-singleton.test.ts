import { describe, expect, it } from 'vitest';
import {
  SSR_SINGLETON_PACKAGES,
  ssrSingletonDevPolicy,
  ssrSingletonProdOptimizeExclude,
  ssrSingletonProdSsr
} from '../src/ssr-singleton';

describe('ssr singleton policy', () => {
  it('lists the packages that must stay single-copy', () => {
    expect(SSR_SINGLETON_PACKAGES).toContain('@ubean/i18n');
    expect(SSR_SINGLETON_PACKAGES).toContain('@ubean/client');
    expect(SSR_SINGLETON_PACKAGES).toContain('ubean');
  });

  it('dev externalizes @ubean/i18n and noExternals ubean', () => {
    const policy = ssrSingletonDevPolicy();
    expect(policy.ssr.external).toEqual(['@ubean/i18n']);
    expect(policy.ssr.noExternal).toContain('ubean');
    expect(policy.optimizeDeps.exclude).toContain('@ubean/client');
  });

  it('prod bundles ubean and does not externalize @ubean/i18n', () => {
    const policy = ssrSingletonProdSsr();
    expect(policy.noExternal).toContain('ubean');
    expect(policy).not.toHaveProperty('external');
  });

  it('prod optimize exclude includes singleton packages plus extras', () => {
    const exclude = ssrSingletonProdOptimizeExclude(['virtual:ubean-pages']);
    expect(exclude).toContain('ubean');
    expect(exclude).toContain('virtual:ubean-pages');
  });
});
