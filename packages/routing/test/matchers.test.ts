/**
 * Task 7 (P1): Dynamic route matchers unit tests.
 *
 * Covers:
 * - `defineMatcher` / `getMatcher` / `hasMatcher` / `listMatcherNames` / `clearMatchers` registry API
 * - `validateParams` param validation logic (pass / reject / unregistered / throws / array params)
 * - `createMatcherGuard` vue-router beforeEach guard (pass / reject / no matchers / custom onReject)
 * - `parseMatchers` `[id=matcher]` syntax parsing
 * - `filePathToRoute` integration with `[id=matcher]` syntax
 * - `extractSlotAndIntercept` interaction with matcher syntax
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  defineMatcher,
  getMatcher,
  hasMatcher,
  listMatcherNames,
  clearMatchers,
  validateParams,
  createMatcherGuard,
  filePathToRoute,
  parseMatchers
} from '../src/index';

describe('Task 7: defineMatcher registry', () => {
  beforeEach(() => clearMatchers());
  afterEach(() => clearMatchers());

  it('registers and retrieves a matcher by name', () => {
    const fn = (v: string) => /^\d+$/.test(v);
    const returned = defineMatcher('numeric', fn);
    expect(returned).toBe(fn);
    expect(getMatcher('numeric')).toBe(fn);
    expect(hasMatcher('numeric')).toBe(true);
  });

  it('overwrites previous matcher with the same name', () => {
    const fn1 = () => true;
    const fn2 = () => false;
    defineMatcher('foo', fn1);
    expect(getMatcher('foo')).toBe(fn1);
    defineMatcher('foo', fn2);
    expect(getMatcher('foo')).toBe(fn2);
  });

  it('returns false from hasMatcher for unregistered names', () => {
    expect(hasMatcher('nonexistent')).toBe(false);
  });

  it('returns undefined from getMatcher for unregistered names', () => {
    expect(getMatcher('nonexistent')).toBeUndefined();
  });

  it('listMatcherNames returns all registered names', () => {
    defineMatcher('numeric', () => true);
    defineMatcher('slug', () => true);
    defineMatcher('uuid', () => true);
    expect(listMatcherNames().sort()).toEqual(['numeric', 'slug', 'uuid']);
  });

  it('clearMatchers empties the registry', () => {
    defineMatcher('a', () => true);
    defineMatcher('b', () => true);
    expect(listMatcherNames()).toHaveLength(2);
    clearMatchers();
    expect(listMatcherNames()).toEqual([]);
    expect(hasMatcher('a')).toBe(false);
  });

  it('throws TypeError for empty name', () => {
    expect(() => defineMatcher('', () => true)).toThrow(TypeError);
    expect(() => defineMatcher('', () => true)).toThrow(/non-empty string/);
  });

  it('throws TypeError for non-function fn', () => {
    expect(() => defineMatcher('bad', 'not a function' as any)).toThrow(TypeError);
    expect(() => defineMatcher('bad', 'not a function' as any)).toThrow(/must be a function/);
  });
});

describe('Task 7: validateParams', () => {
  beforeEach(() => clearMatchers());
  afterEach(() => clearMatchers());

  it('returns true when matchers is undefined', () => {
    expect(validateParams(undefined, { id: '42' })).toBe(true);
  });

  it('returns true when matchers is empty object', () => {
    expect(validateParams({}, { id: '42' })).toBe(true);
  });

  it('returns true when all matchers pass', () => {
    defineMatcher('numeric', (v) => /^\d+$/.test(v));
    defineMatcher('slug', (v) => /^[a-z0-9-]+$/.test(v));
    expect(validateParams({ id: 'numeric', slug: 'slug' }, { id: '42', slug: 'hello-world' })).toBe(true);
  });

  it('returns false when a matcher rejects', () => {
    defineMatcher('numeric', (v) => /^\d+$/.test(v));
    expect(validateParams({ id: 'numeric' }, { id: 'abc' })).toBe(false);
  });

  it('returns false when matcher name is not registered', () => {
    // 不注册 'numeric',验证 conservative 策略
    expect(validateParams({ id: 'numeric' }, { id: '42' })).toBe(false);
  });

  it('returns false when param is missing from params', () => {
    defineMatcher('numeric', () => true);
    expect(validateParams({ id: 'numeric' }, { other: '42' } as any)).toBe(false);
  });

  it('returns false when param value is undefined', () => {
    defineMatcher('numeric', () => true);
    expect(validateParams({ id: 'numeric' }, { id: undefined })).toBe(false);
  });

  it('returns false when param value is null', () => {
    defineMatcher('numeric', () => true);
    expect(validateParams({ id: 'numeric' }, { id: null as any })).toBe(false);
  });

  it('validates each element of array params (all pass)', () => {
    defineMatcher('numeric', (v) => /^\d+$/.test(v));
    expect(validateParams({ ids: 'numeric' }, { ids: ['1', '2', '3'] })).toBe(true);
  });

  it('validates each element of array params (one fails)', () => {
    defineMatcher('numeric', (v) => /^\d+$/.test(v));
    expect(validateParams({ ids: 'numeric' }, { ids: ['1', 'abc', '3'] })).toBe(false);
  });

  it('catches matcher exceptions and treats them as rejection', () => {
    defineMatcher('throwy', () => {
      throw new Error('boom');
    });
    expect(validateParams({ id: 'throwy' }, { id: '42' })).toBe(false);
  });

  it('handles matcher returning null as rejection', () => {
    defineMatcher('nullish', () => null);
    expect(validateParams({ id: 'nullish' }, { id: '42' })).toBe(false);
  });

  it('handles matcher returning undefined as rejection', () => {
    defineMatcher('undef', () => undefined);
    expect(validateParams({ id: 'undef' }, { id: '42' })).toBe(false);
  });

  it('handles matcher returning 0 as rejection (falsy)', () => {
    defineMatcher('zero', () => 0 as any);
    expect(validateParams({ id: 'zero' }, { id: '42' })).toBe(false);
  });

  it('handles matcher returning empty string as rejection (falsy)', () => {
    defineMatcher('empty', () => '' as any);
    expect(validateParams({ id: 'empty' }, { id: '42' })).toBe(false);
  });

  it('validates multiple matchers, all must pass', () => {
    defineMatcher('numeric', (v) => /^\d+$/.test(v));
    defineMatcher('positive', (v) => Number(v) > 0);
    expect(validateParams({ id: 'numeric', val: 'positive' }, { id: '42', val: '5' })).toBe(true);
    expect(validateParams({ id: 'numeric', val: 'positive' }, { id: '42', val: '-5' })).toBe(false);
    expect(validateParams({ id: 'numeric', val: 'positive' }, { id: 'abc', val: '5' })).toBe(false);
  });

  it('real-world numeric matcher', () => {
    defineMatcher('numeric', (v) => /^\d+$/.test(v));
    expect(validateParams({ id: 'numeric' }, { id: '42' })).toBe(true);
    expect(validateParams({ id: 'numeric' }, { id: '0' })).toBe(true);
    expect(validateParams({ id: 'numeric' }, { id: '123456789' })).toBe(true);
    expect(validateParams({ id: 'numeric' }, { id: 'abc' })).toBe(false);
    expect(validateParams({ id: 'numeric' }, { id: '42abc' })).toBe(false);
    expect(validateParams({ id: 'numeric' }, { id: '' })).toBe(false);
    expect(validateParams({ id: 'numeric' }, { id: '-1' })).toBe(false);
    expect(validateParams({ id: 'numeric' }, { id: '1.5' })).toBe(false);
  });

  it('real-world uuid matcher', () => {
    defineMatcher(
      'uuid',
      (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
    );
    expect(validateParams({ id: 'uuid' }, { id: '550e8400-e29b-41d4-a716-446655440000' })).toBe(true);
    expect(validateParams({ id: 'uuid' }, { id: 'not-a-uuid' })).toBe(false);
    expect(validateParams({ id: 'uuid' }, { id: '550e8400' })).toBe(false);
  });

  it('real-world slug matcher', () => {
    defineMatcher('slug', (v) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v));
    expect(validateParams({ slug: 'slug' }, { slug: 'hello-world' })).toBe(true);
    expect(validateParams({ slug: 'slug' }, { slug: 'hello' })).toBe(true);
    expect(validateParams({ slug: 'slug' }, { slug: 'Hello-World' })).toBe(false);
    expect(validateParams({ slug: 'slug' }, { slug: '-hello' })).toBe(false);
    expect(validateParams({ slug: 'slug' }, { slug: 'hello-' })).toBe(false);
    expect(validateParams({ slug: 'slug' }, { slug: 'hello world' })).toBe(false);
  });
});

describe('Task 7: createMatcherGuard', () => {
  beforeEach(() => clearMatchers());
  afterEach(() => clearMatchers());

  it('returns a function (NavigationGuard)', () => {
    const guard = createMatcherGuard();
    expect(typeof guard).toBe('function');
  });

  it('passes through when route has no matchers in meta', () => {
    const guard = createMatcherGuard();
    const result = guard({
      path: '/users/42',
      params: { id: '42' },
      meta: {}
    });
    // undefined / void means "continue navigation"
    expect(result).toBeUndefined();
  });

  it('passes through when route meta is undefined', () => {
    const guard = createMatcherGuard();
    const result = guard({
      path: '/users/42',
      params: { id: '42' },
      meta: undefined
    });
    expect(result).toBeUndefined();
  });

  it('passes through when matcher validates successfully', () => {
    defineMatcher('numeric', (v) => /^\d+$/.test(v));
    const guard = createMatcherGuard();
    const result = guard({
      path: '/users/42',
      params: { id: '42' },
      meta: { matchers: { id: 'numeric' } }
    });
    expect(result).toBeUndefined();
  });

  it('redirects to NotFound route when matcher rejects', () => {
    defineMatcher('numeric', (v) => /^\d+$/.test(v));
    const guard = createMatcherGuard();
    const result = guard({
      path: '/users/abc',
      params: { id: 'abc' },
      meta: { matchers: { id: 'numeric' } }
    });
    expect(result).toEqual({ name: 'NotFound' });
  });

  it('redirects to custom notFoundRouteName when provided', () => {
    defineMatcher('numeric', (v) => /^\d+$/.test(v));
    const guard = createMatcherGuard({ notFoundRouteName: 'Custom404' });
    const result = guard({
      path: '/users/abc',
      params: { id: 'abc' },
      meta: { matchers: { id: 'numeric' } }
    });
    expect(result).toEqual({ name: 'Custom404' });
  });

  it('returns false (cancel nav) when matcher unregistered', () => {
    // 不注册 matcher —— createMatcherGuard 仍然调用 validateParams,
    // 后者返回 false,守卫返回 { name: 'NotFound' }。
    const guard = createMatcherGuard();
    const result = guard({
      path: '/users/42',
      params: { id: '42' },
      meta: { matchers: { id: 'unregistered' } }
    });
    expect(result).toEqual({ name: 'NotFound' });
  });

  it('invokes onReject callback when matcher rejects', () => {
    defineMatcher('numeric', (v) => /^\d+$/.test(v));
    const calls: Array<{ path: string; matchers: Record<string, string> }> = [];
    const guard = createMatcherGuard({
      onReject: (to) => calls.push({ path: to.path, matchers: to.matchers })
    });
    guard({
      path: '/users/abc',
      params: { id: 'abc' },
      meta: { matchers: { id: 'numeric' } }
    });
    expect(calls).toEqual([{ path: '/users/abc', matchers: { id: 'numeric' } }]);
  });

  it('does not invoke onReject when matcher passes', () => {
    defineMatcher('numeric', (v) => /^\d+$/.test(v));
    const calls: unknown[] = [];
    const guard = createMatcherGuard({ onReject: () => calls.push(true) });
    guard({
      path: '/users/42',
      params: { id: '42' },
      meta: { matchers: { id: 'numeric' } }
    });
    expect(calls).toEqual([]);
  });

  it('handles empty matchers object in meta as pass-through', () => {
    const guard = createMatcherGuard();
    const result = guard({
      path: '/users/42',
      params: { id: '42' },
      meta: { matchers: {} }
    });
    expect(result).toBeUndefined();
  });
});

describe('Task 7: parseMatchers [id=name] syntax', () => {
  it('extracts matcher from [id=numeric]', () => {
    const { cleaned, matchers } = parseMatchers('users/[id=numeric]');
    expect(cleaned).toBe('users/[id]');
    expect(matchers).toEqual({ id: 'numeric' });
  });

  it('extracts matcher from catch-all [...slug=any]', () => {
    const { cleaned, matchers } = parseMatchers('blog/[...slug=any]');
    expect(cleaned).toBe('blog/[...slug]');
    expect(matchers).toEqual({ slug: 'any' });
  });

  it('extracts multiple matchers from different segments', () => {
    const { cleaned, matchers } = parseMatchers('users/[userId=numeric]/posts/[postId=numeric]');
    expect(cleaned).toBe('users/[userId]/posts/[postId]');
    expect(matchers).toEqual({ userId: 'numeric', postId: 'numeric' });
  });

  it('returns undefined matchers for plain [id] (no matcher)', () => {
    const { cleaned, matchers } = parseMatchers('users/[id]');
    expect(cleaned).toBe('users/[id]');
    expect(matchers).toBeUndefined();
  });

  it('returns undefined matchers for plain [...slug] (no matcher)', () => {
    const { cleaned, matchers } = parseMatchers('blog/[...slug]');
    expect(cleaned).toBe('blog/[...slug]');
    expect(matchers).toBeUndefined();
  });

  it('returns undefined matchers for path with no dynamic segments', () => {
    const { cleaned, matchers } = parseMatchers('about');
    expect(cleaned).toBe('about');
    expect(matchers).toBeUndefined();
  });

  it('preserves optional param syntax [[id]] without matcher', () => {
    const { cleaned, matchers } = parseMatchers('docs/[[page]]');
    expect(cleaned).toBe('docs/[[page]]');
    expect(matchers).toBeUndefined();
  });

  it('handles matcher on optional param [[id=numeric]]', () => {
    const { cleaned, matchers } = parseMatchers('docs/[[id=numeric]]');
    expect(cleaned).toBe('docs/[[id]]');
    expect(matchers).toEqual({ id: 'numeric' });
  });

  it('handles mixed matcher and non-matcher params', () => {
    const { cleaned, matchers } = parseMatchers('[lang]/posts/[id=numeric]');
    expect(cleaned).toBe('[lang]/posts/[id]');
    expect(matchers).toEqual({ id: 'numeric' });
  });

  it('returns input unchanged when no brackets present', () => {
    const { cleaned, matchers } = parseMatchers('plain/path');
    expect(cleaned).toBe('plain/path');
    expect(matchers).toBeUndefined();
  });

  it('handles matcher name with underscores and hyphens', () => {
    const { cleaned, matchers } = parseMatchers('[id=numeric-only]');
    expect(cleaned).toBe('[id]');
    expect(matchers).toEqual({ id: 'numeric-only' });
  });
});

describe('Task 7: filePathToRoute integration with matchers', () => {
  it('parses [id=numeric].vue and returns matchers', () => {
    const result = filePathToRoute('users/[id=numeric].vue');
    expect(result.route).toBe('/users/:id');
    expect(result.matchers).toEqual({ id: 'numeric' });
  });

  it('parses [...slug=any].vue and returns matchers', () => {
    const result = filePathToRoute('blog/[...slug=any].vue');
    expect(result.route).toBe('/blog/**:slug');
    expect(result.matchers).toEqual({ slug: 'any' });
  });

  it('parses [[page=numeric]].vue and returns matchers', () => {
    const result = filePathToRoute('docs/[[page=numeric]].vue');
    expect(result.route).toBe('/docs/:page?');
    expect(result.matchers).toEqual({ page: 'numeric' });
  });

  it('parses plain [id].vue without matchers (backward compat)', () => {
    const result = filePathToRoute('users/[id].vue');
    expect(result.route).toBe('/users/:id');
    expect(result.matchers).toBeUndefined();
  });

  it('parses plain path without matchers (backward compat)', () => {
    const result = filePathToRoute('about.vue');
    expect(result.route).toBe('/about');
    expect(result.matchers).toBeUndefined();
  });

  it('parses index.vue without matchers (backward compat)', () => {
    const result = filePathToRoute('index.vue');
    expect(result.route).toBe('/');
    expect(result.matchers).toBeUndefined();
  });

  it('handles multiple matcher params in nested route', () => {
    const result = filePathToRoute('users/[userId=numeric]/posts/[postId=numeric].vue');
    expect(result.route).toBe('/users/:userId/posts/:postId');
    expect(result.matchers).toEqual({ userId: 'numeric', postId: 'numeric' });
  });

  it('handles mixed matcher and non-matcher params', () => {
    const result = filePathToRoute('[lang]/posts/[id=numeric].vue');
    expect(result.route).toBe('/:lang/posts/:id');
    expect(result.matchers).toEqual({ id: 'numeric' });
  });

  it('handles API route with method suffix and matcher', () => {
    const result = filePathToRoute('api/users/[id=numeric].get.ts');
    expect(result.route).toBe('/api/users/:id');
    expect(result.method).toBe('get');
    expect(result.matchers).toEqual({ id: 'numeric' });
  });

  it('handles API route with mixed method+env suffix and matcher', () => {
    const result = filePathToRoute('api/users/[id=numeric].get.dev.ts');
    expect(result.route).toBe('/api/users/:id');
    expect(result.method).toBe('get');
    expect(result.env).toBe('dev');
    expect(result.matchers).toEqual({ id: 'numeric' });
  });

  it('does not break catch-all [...slug].vue (no matcher, backward compat)', () => {
    const result = filePathToRoute('[...slug].vue');
    expect(result.route).toBe('/**:slug');
    expect(result.matchers).toBeUndefined();
  });

  it('does not break route groups with matcher', () => {
    const result = filePathToRoute('(marketing)/users/[id=numeric].vue');
    expect(result.route).toBe('/users/:id');
    expect(result.matchers).toEqual({ id: 'numeric' });
  });
});

describe('Task 7: real-world matcher scenarios', () => {
  beforeEach(() => clearMatchers());
  afterEach(() => clearMatchers());

  it('numeric matcher accepts digits only', () => {
    defineMatcher('numeric', (v) => /^\d+$/.test(v));
    expect(validateParams({ id: 'numeric' }, { id: '0' })).toBe(true);
    expect(validateParams({ id: 'numeric' }, { id: '42' })).toBe(true);
    expect(validateParams({ id: 'numeric' }, { id: '99999999' })).toBe(true);
    expect(validateParams({ id: 'numeric' }, { id: '' })).toBe(false);
    expect(validateParams({ id: 'numeric' }, { id: 'abc' })).toBe(false);
    expect(validateParams({ id: 'numeric' }, { id: '42a' })).toBe(false);
    expect(validateParams({ id: 'numeric' }, { id: 'a42' })).toBe(false);
    expect(validateParams({ id: 'numeric' }, { id: '4.2' })).toBe(false);
    expect(validateParams({ id: 'numeric' }, { id: '-42' })).toBe(false);
    expect(validateParams({ id: 'numeric' }, { id: '+42' })).toBe(false);
  });

  it('uuid matcher accepts valid UUIDs', () => {
    defineMatcher(
      'uuid',
      (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
    );
    const validUuids = [
      '550e8400-e29b-41d4-a716-446655440000',
      '00000000-0000-0000-0000-000000000000',
      'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF'
    ];
    for (const uuid of validUuids) {
      expect(validateParams({ id: 'uuid' }, { id: uuid })).toBe(true);
    }
    const invalidUuids = ['not-a-uuid', '550e8400', '550e8400-e29b-41d4-a716', 'gggggggg-gggg-gggg-gggg-gggggggggggg'];
    for (const uuid of invalidUuids) {
      expect(validateParams({ id: 'uuid' }, { id: uuid })).toBe(false);
    }
  });

  it('slug matcher accepts kebab-case lowercase', () => {
    defineMatcher('slug', (v) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v));
    expect(validateParams({ slug: 'slug' }, { slug: 'hello' })).toBe(true);
    expect(validateParams({ slug: 'slug' }, { slug: 'hello-world' })).toBe(true);
    expect(validateParams({ slug: 'slug' }, { slug: 'hello-world-foo' })).toBe(true);
    expect(validateParams({ slug: 'slug' }, { slug: 'h2llo' })).toBe(true);
    expect(validateParams({ slug: 'slug' }, { slug: 'Hello' })).toBe(false);
    expect(validateParams({ slug: 'slug' }, { slug: '-hello' })).toBe(false);
    expect(validateParams({ slug: 'slug' }, { slug: 'hello-' })).toBe(false);
    expect(validateParams({ slug: 'slug' }, { slug: 'hello world' })).toBe(false);
    expect(validateParams({ slug: 'slug' }, { slug: 'hello_world' })).toBe(false);
  });

  it('base64 matcher accepts URL-safe base64', () => {
    defineMatcher('base64', (v) => /^[A-Za-z0-9_-]+$/.test(v) && v.length > 0);
    expect(validateParams({ token: 'base64' }, { token: 'abc123' })).toBe(true);
    expect(validateParams({ token: 'base64' }, { token: 'ABC_-xyz' })).toBe(true);
    expect(validateParams({ token: 'base64' }, { token: '' })).toBe(false);
    expect(validateParams({ token: 'base64' }, { token: 'has space' })).toBe(false);
    expect(validateParams({ token: 'base64' }, { token: 'has/slash' })).toBe(false);
    expect(validateParams({ token: 'base64' }, { token: 'has+plus' })).toBe(false);
  });
});
