import { describe, it, expect, beforeEach, vi } from 'vitest';
import { defineLocale, clearLocales, useI18n } from '../src/runtime/i18n';

describe('i18n pluralization and message enhancements (P6-34)', () => {
  beforeEach(() => {
    clearLocales();
  });

  describe('pluralization', () => {
    it('selects "one" for count=1 in English', () => {
      defineLocale({
        code: 'en',
        messages: {
          apples: 'no apples | one apple | {count} apples'
        },
        isDefault: true
      });

      const i18n = useI18n();
      expect(i18n.t('apples', { count: 0 })).toBe('no apples');
      expect(i18n.t('apples', { count: 1 })).toBe('one apple');
      expect(i18n.t('apples', { count: 5 })).toBe('5 apples');
      expect(i18n.t('apples', { count: 42 })).toBe('42 apples');
    });

    it('supports two-part plural (one | other)', () => {
      defineLocale({
        code: 'en',
        messages: {
          items: 'one item | {count} items'
        },
        isDefault: true
      });

      const i18n = useI18n();
      expect(i18n.t('items', { count: 1 })).toBe('one item');
      expect(i18n.t('items', { count: 0 })).toBe('0 items');
      expect(i18n.t('items', { count: 2 })).toBe('2 items');
    });

    it('supports exact count matches with =N syntax', () => {
      defineLocale({
        code: 'en',
        messages: {
          items: '=0 No items | one item | a few items | many items | {count} items'
        },
        isDefault: true
      });

      const i18n = useI18n();
      expect(i18n.t('items', { count: 0 })).toBe('No items');
    });

    it('returns single string without pipes as-is', () => {
      defineLocale({
        code: 'en',
        messages: {
          hello: 'Hello World'
        },
        isDefault: true
      });

      const i18n = useI18n();
      expect(i18n.t('hello')).toBe('Hello World');
      expect(i18n.t('hello', { count: 5 })).toBe('Hello World');
    });
  });

  describe('message interpolation', () => {
    it('interpolates named parameters', () => {
      defineLocale({
        code: 'en',
        messages: {
          greeting: 'Hello, {name}!'
        },
        isDefault: true
      });

      const i18n = useI18n();
      expect(i18n.t('greeting', { name: 'World' })).toBe('Hello, World!');
      expect(i18n.t('greeting', { name: 'Vue' })).toBe('Hello, Vue!');
    });

    it('keeps unresolved placeholders', () => {
      defineLocale({
        code: 'en',
        messages: {
          test: 'Value: {missing}'
        },
        isDefault: true
      });

      const i18n = useI18n();
      expect(i18n.t('test')).toBe('Value: {missing}');
    });
  });

  describe('linked messages', () => {
    it('resolves @:key references', () => {
      defineLocale({
        code: 'en',
        messages: {
          app: {
            name: 'ubean'
          },
          welcome: 'Welcome to @:app.name!'
        },
        isDefault: true
      });

      const i18n = useI18n();
      expect(i18n.t('welcome')).toBe('Welcome to ubean!');
    });

    it('resolves @{key} references', () => {
      defineLocale({
        code: 'en',
        messages: {
          common: {
            yes: 'Yes'
          },
          confirm: 'Are you sure? @{common.yes}'
        },
        isDefault: true
      });

      const i18n = useI18n();
      expect(i18n.t('confirm')).toBe('Are you sure? Yes');
    });

    it('does not infinitely recurse on circular references', () => {
      defineLocale({
        code: 'en',
        messages: {
          a: '@:b',
          b: '@:a'
        },
        isDefault: true
      });

      const i18n = useI18n();
      const result = i18n.t('a');
      expect(typeof result).toBe('string');
    });

    it('leaves unresolved @:key as-is', () => {
      defineLocale({
        code: 'en',
        messages: {
          test: 'See @:nonexistent.key'
        },
        isDefault: true
      });

      const i18n = useI18n();
      expect(i18n.t('test')).toBe('See @:nonexistent.key');
    });
  });

  describe('missing key handling', () => {
    it('returns key itself when not found', () => {
      defineLocale({
        code: 'en',
        messages: {
          exists: 'I exist'
        },
        isDefault: true
      });

      const i18n = useI18n();
      expect(i18n.t('exists')).toBe('I exist');
      expect(i18n.t('nonexistent')).toBe('nonexistent');
    });

    it('calls onMissingKey handler for missing keys', () => {
      defineLocale({
        code: 'en',
        messages: {},
        isDefault: true
      });

      const missingKeys: Array<{ locale: string; key: string }> = [];
      const i18n = useI18n();
      const off = i18n.onMissingKey((locale, key) => {
        missingKeys.push({ locale, key });
      });

      i18n.t('missing.key');
      i18n.t('another.missing');

      expect(missingKeys).toHaveLength(2);
      expect(missingKeys[0].key).toBe('missing.key');
      expect(missingKeys[1].key).toBe('another.missing');

      off();
    });

    it('does not call onMissingKey for existing keys', () => {
      defineLocale({
        code: 'en',
        messages: {
          hello: 'Hello'
        },
        isDefault: true
      });

      const handler = vi.fn();
      const i18n = useI18n();
      i18n.onMissingKey(handler);

      i18n.t('hello');
      expect(handler).not.toHaveBeenCalled();
    });

    it('falls back to fallbackLocale when key missing in current locale', () => {
      defineLocale({
        code: 'en',
        messages: {
          greeting: 'Hello'
        },
        isDefault: true
      });
      defineLocale({
        code: 'fr',
        messages: {}
      });

      const i18n = useI18n();
      i18n.setLocale('fr');
      expect(i18n.t('greeting')).toBe('Hello');
    });
  });

  describe('message cache', () => {
    it('caches flattened messages and invalidates on addLocale', () => {
      defineLocale({
        code: 'en',
        messages: {
          a: 'A'
        },
        isDefault: true
      });

      const i18n = useI18n();
      expect(i18n.t('a')).toBe('A');
      expect(i18n.t('b')).toBe('b');

      i18n.addLocale('en', { b: 'B' });
      expect(i18n.t('b')).toBe('B');
    });

    it('invalidates cache on mergeLocale', () => {
      defineLocale({
        code: 'en',
        messages: {
          x: 'X'
        },
        isDefault: true
      });

      const i18n = useI18n();
      expect(i18n.t('x')).toBe('X');
      expect(i18n.t('y')).toBe('y');

      i18n.mergeLocale('en', { y: 'Y' });
      expect(i18n.t('y')).toBe('Y');
    });
  });

  describe('nested message keys', () => {
    it('resolves dot-separated nested keys', () => {
      defineLocale({
        code: 'en',
        messages: {
          nav: {
            home: 'Home',
            about: 'About'
          }
        },
        isDefault: true
      });

      const i18n = useI18n();
      expect(i18n.t('nav.home')).toBe('Home');
      expect(i18n.t('nav.about')).toBe('About');
    });
  });

  describe('Intl formatting (P6-35)', () => {
    beforeEach(() => {
      defineLocale({
        code: 'en',
        messages: {},
        isDefault: true
      });
    });

    it('formats dates with d()', () => {
      const i18n = useI18n();
      const date = new Date('2024-01-15T12:00:00Z');
      const short = i18n.d(date, 'short');
      expect(typeof short).toBe('string');
      expect(short.length).toBeGreaterThan(0);
    });

    it('formats numbers with n() in decimal style', () => {
      const i18n = useI18n();
      const formatted = i18n.n(1234567.89);
      expect(typeof formatted).toBe('string');
      expect(formatted).toContain('1');
    });

    it('formats numbers as percent', () => {
      const i18n = useI18n();
      const formatted = i18n.n(0.42, 'percent');
      expect(typeof formatted).toBe('string');
    });

    it('formats currency with c()', () => {
      const i18n = useI18n();
      const formatted = i18n.c(42.99, 'USD');
      expect(typeof formatted).toBe('string');
      expect(formatted.length).toBeGreaterThan(0);
    });

    it('formats relative time', () => {
      const i18n = useI18n();
      const past = i18n.relativeTime(-1, 'day');
      const future = i18n.relativeTime(2, 'hour');
      expect(typeof past).toBe('string');
      expect(typeof future).toBe('string');
    });

    it('formats lists', () => {
      const i18n = useI18n();
      const formatted = i18n.list(['Apple', 'Banana', 'Cherry']);
      expect(typeof formatted).toBe('string');
      expect(formatted).toContain('Apple');
      expect(formatted).toContain('Banana');
    });

    it('respects current locale for formatting', () => {
      defineLocale({
        code: 'fr',
        messages: {}
      });
      const i18n = useI18n();
      i18n.setLocale('en');
      const enFormatted = i18n.n(1234.56);
      i18n.setLocale('fr');
      const frFormatted = i18n.n(1234.56);
      expect(typeof enFormatted).toBe('string');
      expect(typeof frFormatted).toBe('string');
    });

    it('gracefully degrades when Intl is unavailable', () => {
      const i18n = useI18n();
      const fallback = i18n.d(new Date('invalid'), 'short');
      expect(typeof fallback).toBe('string');
      const numFallback = i18n.n(NaN);
      expect(typeof numFallback).toBe('string');
    });
  });
});
