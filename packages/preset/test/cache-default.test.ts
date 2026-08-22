import { describe, expect, it } from 'vitest';
import { isEphemeralCachePreset, resolveProductionCacheStore } from '../src/cache-default';

describe('resolveProductionCacheStore', () => {
  it('defaults Node-like presets to fs', () => {
    expect(resolveProductionCacheStore('node')).toEqual({ store: 'fs', dir: '.ubean/cache' });
    expect(resolveProductionCacheStore('bun')).toEqual({ store: 'fs', dir: '.ubean/cache' });
    expect(resolveProductionCacheStore('deno')).toEqual({ store: 'fs', dir: '.ubean/cache' });
    expect(resolveProductionCacheStore('standard')).toEqual({ store: 'fs', dir: '.ubean/cache' });
  });

  it('keeps serverless / edge presets on memory', () => {
    for (const name of ['cloudflare', 'cf', 'vercel', 'vercel-edge', 'netlify', 'aws', 'azure']) {
      expect(isEphemeralCachePreset(name)).toBe(true);
      expect(resolveProductionCacheStore(name)).toEqual({ store: 'memory' });
    }
  });

  it('honors explicit store over auto', () => {
    expect(resolveProductionCacheStore('vercel', { store: 'fs', dir: '/data/cache' })).toEqual({
      store: 'fs',
      dir: '/data/cache'
    });
    expect(resolveProductionCacheStore('node', { store: 'memory' })).toEqual({ store: 'memory' });
  });
});
