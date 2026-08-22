import { describe, expect, it } from 'vitest';
import { getScaffoldManifest, SCAFFOLD_CONTRACT_VERSION } from '../src/scaffold-manifest';

describe('getScaffoldManifest', () => {
  it('exposes a versioned catalog of scaffold types', () => {
    const manifest = getScaffoldManifest();
    expect(manifest.contractVersion).toBe(SCAFFOLD_CONTRACT_VERSION);
    const types = manifest.types.map(t => t.type);
    expect(types).toEqual(['page', 'api', 'layout', 'middleware', 'cron', 'plugin', 'reuse']);
    expect(manifest.types.find(t => t.type === 'reuse')?.cli).toBe(false);
    expect(manifest.types.find(t => t.type === 'api')?.args.some(a => a.name === 'method')).toBe(true);
  });
});
