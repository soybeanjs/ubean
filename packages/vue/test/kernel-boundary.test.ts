import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('@ubean/vue kernel boundary', () => {
  it('does not depend on @ubean/i18n', () => {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.['@ubean/i18n']).toBeUndefined();
    expect(pkg.peerDependencies?.['@ubean/i18n']).toBeUndefined();
  });
});
