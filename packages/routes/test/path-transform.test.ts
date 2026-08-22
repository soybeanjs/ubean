import { describe, expect, it } from 'vitest';
import { applyPathTransform } from '../src/path-transform';

describe('applyPathTransform', () => {
  it('rewrites an exact path', () => {
    expect(applyPathTransform('/old', '/old', '/new')).toBe('/new');
  });

  it('substitutes /** suffix', () => {
    expect(applyPathTransform('/blog/a/b', '/blog/**', '/news/**')).toBe('/news/a/b');
  });

  it('substitutes $1', () => {
    expect(applyPathTransform('/v1/users', '/v1/**', '/v2/$1')).toBe('/v2/users');
  });

  it('maps proxy origin + suffix', () => {
    expect(applyPathTransform('/api/users', '/api/**', 'https://example.com/**')).toBe('https://example.com/users');
  });

  it('appends nothing when suffix is empty', () => {
    expect(applyPathTransform('/blog', '/blog/**', '/news/**')).toBe('/news');
  });
});
