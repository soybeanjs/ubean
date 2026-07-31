/**
 * P9-18: Parallel Routes / Intercepting Routes — scanning unit tests
 *
 * Tests `extractSlotAndIntercept` for:
 * - Parallel route slots: `@slotName` segments
 * - Intercepting routes: `(..)target`, `(.)target`, `(...)target`
 * - Combinations of slot + intercept
 * - Paths without slot/intercept (passthrough)
 */
import { describe, it, expect } from 'vitest';
import { extractSlotAndIntercept } from '../src/scan';

describe('P9-18: extractSlotAndIntercept — parallel routes', () => {
  it('extracts slot from @slotName segment', () => {
    const result = extractSlotAndIntercept('@modal/login');
    expect(result.slot).toBe('modal');
    expect(result.cleanedBase).toBe('login');
    expect(result.interceptFrom).toBeUndefined();
    expect(result.interceptTarget).toBeUndefined();
  });

  it('extracts slot from nested @slotName segment', () => {
    const result = extractSlotAndIntercept('dashboard/@analytics/index');
    expect(result.slot).toBe('analytics');
    expect(result.cleanedBase).toBe('dashboard/index');
  });

  it('handles path without slot (passthrough)', () => {
    const result = extractSlotAndIntercept('about/index');
    expect(result.slot).toBeUndefined();
    expect(result.cleanedBase).toBe('about/index');
  });

  it('handles root index without slot', () => {
    const result = extractSlotAndIntercept('index');
    expect(result.slot).toBeUndefined();
    expect(result.cleanedBase).toBe('index');
  });

  it('handles multiple segments with slot in middle', () => {
    const result = extractSlotAndIntercept('users/@profile/settings');
    expect(result.slot).toBe('profile');
    expect(result.cleanedBase).toBe('users/settings');
  });
});

describe('P9-18: extractSlotAndIntercept — intercepting routes', () => {
  it('extracts (..) intercept (one level up)', () => {
    const result = extractSlotAndIntercept('photos/(..)photo/[id]');
    expect(result.interceptTarget).toBe('photo');
    // (..) means one level up from the current directory.
    // Current dir is 'photos' (prefix before intercept segment), so
    // one level up removes it → '/'
    expect(result.interceptFrom).toBe('/');
    expect(result.cleanedBase).toBe('photos/[id]');
  });

  it('extracts (.) intercept (same level)', () => {
    const result = extractSlotAndIntercept('photos/(.)photo/[id]');
    expect(result.interceptTarget).toBe('photo');
    // (.) means same level as current directory
    expect(result.interceptFrom).toBe('/photos');
    expect(result.cleanedBase).toBe('photos/[id]');
  });

  it('extracts (...) intercept (root level)', () => {
    const result = extractSlotAndIntercept('dashboard/settings/(...)photo/[id]');
    expect(result.interceptTarget).toBe('photo');
    // (...) means intercept from root
    expect(result.interceptFrom).toBe('/');
    expect(result.cleanedBase).toBe('dashboard/settings/[id]');
  });

  it('handles intercept at root level', () => {
    const result = extractSlotAndIntercept('(..)photo/[id]');
    expect(result.interceptTarget).toBe('photo');
    // No prefix segments, so one level up from empty → '/'
    expect(result.interceptFrom).toBe('/');
    expect(result.cleanedBase).toBe('[id]');
  });

  it('handles (..) with multiple prefix segments', () => {
    const result = extractSlotAndIntercept('dashboard/users/(..)user/[id]');
    expect(result.interceptTarget).toBe('user');
    // prefix = ['dashboard', 'users'], one level up removes 'users'
    expect(result.interceptFrom).toBe('/dashboard');
    expect(result.cleanedBase).toBe('dashboard/users/[id]');
  });
});

describe('P9-18: extractSlotAndIntercept — combinations', () => {
  it('handles slot + intercept together', () => {
    const result = extractSlotAndIntercept('dashboard/@modal/(..)photo/[id]');
    expect(result.slot).toBe('modal');
    expect(result.interceptTarget).toBe('photo');
    expect(result.interceptFrom).toBe('/');
    expect(result.cleanedBase).toBe('dashboard/[id]');
  });

  it('handles intercept + slot together', () => {
    const result = extractSlotAndIntercept('(..)photo/@modal/[id]');
    expect(result.slot).toBe('modal');
    expect(result.interceptTarget).toBe('photo');
    expect(result.cleanedBase).toBe('[id]');
  });

  it('returns no metadata for plain path', () => {
    const result = extractSlotAndIntercept('users/[id]/settings');
    expect(result.slot).toBeUndefined();
    expect(result.interceptFrom).toBeUndefined();
    expect(result.interceptTarget).toBeUndefined();
    expect(result.cleanedBase).toBe('users/[id]/settings');
  });

  it('handles empty string', () => {
    const result = extractSlotAndIntercept('');
    expect(result.slot).toBeUndefined();
    expect(result.interceptFrom).toBeUndefined();
    expect(result.interceptTarget).toBeUndefined();
    expect(result.cleanedBase).toBe('');
  });
});
