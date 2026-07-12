import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseIconName,
  normalizeIconName,
  registerCollection,
  registerCollectionLoader,
  getIconSync,
  resolveIconData,
  generateSvg,
  escapeHtml,
  scanVueSfcForIcons,
  clearCollections,
  resolveAlias,
  listLoadedCollections
} from '../src/core';
import type { IconifyCollection } from '../src/types';

const TEST_COLLECTION: IconifyCollection = {
  prefix: 'test',
  width: 24,
  height: 24,
  icons: {
    home: {
      body: '<path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>'
    },
    user: {
      body: '<circle cx="12" cy="8" r="4"/><path d="M12 14c-4 0-8 2-8 6v2h16v-2c0-4-4-6-8-6z"/>'
    },
    'arrow-left': {
      body: '<path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>',
      width: 24,
      height: 24
    }
  },
  aliases: {
    house: {
      parent: 'home'
    },
    person: {
      parent: 'user'
    }
  }
};

describe('ubean-icon core', () => {
  beforeEach(() => {
    clearCollections();
  });

  describe('parseIconName', () => {
    it('parses valid icon names with collection prefix', () => {
      expect(parseIconName('lucide:home')).toEqual({
        collection: 'lucide',
        icon: 'home'
      });
      expect(parseIconName('mdi:account-circle')).toEqual({
        collection: 'mdi',
        icon: 'account-circle'
      });
    });

    it('returns null for invalid names', () => {
      expect(parseIconName('')).toBeNull();
      expect(parseIconName('home')).toBeNull();
      expect(parseIconName(':home')).toBeNull();
      expect(parseIconName('lucide:')).toBeNull();
      expect(parseIconName(null as any)).toBeNull();
      expect(parseIconName(undefined as any)).toBeNull();
    });
  });

  describe('normalizeIconName', () => {
    it('normalizes icon names to lowercase with valid chars only', () => {
      expect(normalizeIconName('Lucide:Home')).toBe('lucide:home');
      expect(normalizeIconName('mdi:Account-Circle!')).toBe('mdi:account-circle');
      expect(normalizeIconName('  test:icon  ')).toBe('test:icon');
    });
  });

  describe('collections', () => {
    it('registers and retrieves collections', () => {
      registerCollection(TEST_COLLECTION);
      expect(listLoadedCollections()).toContain('test');
    });

    it('supports collection loaders', async () => {
      registerCollectionLoader({
        prefix: 'lazy',
        load: async () => ({
          prefix: 'lazy',
          icons: {
            test: { body: '<path/>' }
          }
        })
      });

      const { loadCollection } = await import('../src/core');
      const col = await loadCollection('lazy');
      expect(col).not.toBeNull();
      expect(col?.prefix).toBe('lazy');
    });
  });

  describe('resolveAlias', () => {
    beforeEach(() => {
      registerCollection(TEST_COLLECTION);
    });

    it('resolves direct icons', () => {
      const col = TEST_COLLECTION;
      const icon = resolveAlias(col, 'home');
      expect(icon).not.toBeNull();
      expect(icon?.body).toContain('M10 20v-6h4v6');
    });

    it('resolves aliases to parent icons', () => {
      const col = TEST_COLLECTION;
      const icon = resolveAlias(col, 'house');
      expect(icon).not.toBeNull();
      expect(icon?.body).toContain('M10 20v-6h4v6');
    });

    it('returns null for non-existent icons', () => {
      const col = TEST_COLLECTION;
      expect(resolveAlias(col, 'nonexistent')).toBeNull();
    });
  });

  describe('resolveIconData', () => {
    beforeEach(() => {
      registerCollection(TEST_COLLECTION);
    });

    it('resolves icon data with default dimensions', () => {
      const data = resolveIconData(TEST_COLLECTION, 'home');
      expect(data).not.toBeNull();
      expect(data?.width).toBe(24);
      expect(data?.height).toBe(24);
      expect(data?.viewBox).toBe('0 0 24 24');
      expect(data?.body).toContain('<path');
    });

    it('applies rotation transform', () => {
      const data = resolveIconData(TEST_COLLECTION, 'home', { rotate: 1 });
      expect(data?.body).toContain('rotate(90');
    });

    it('applies horizontal flip', () => {
      const data = resolveIconData(TEST_COLLECTION, 'home', { hFlip: true });
      expect(data?.body).toContain('scale(-1 1)');
    });

    it('applies vertical flip', () => {
      const data = resolveIconData(TEST_COLLECTION, 'home', { vFlip: true });
      expect(data?.body).toContain('scale(1 -1)');
    });

    it('resolves aliases', () => {
      const data = resolveIconData(TEST_COLLECTION, 'house');
      expect(data).not.toBeNull();
      expect(data?.body).toContain('<path');
    });
  });

  describe('generateSvg', () => {
    it('generates valid SVG string', () => {
      const resolved = resolveIconData(TEST_COLLECTION, 'home');
      expect(resolved).not.toBeNull();

      const svg = generateSvg(resolved!);
      expect(svg).toContain('<svg');
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain('viewBox="0 0 24 24"');
      expect(svg).toContain('width="24"');
      expect(svg).toContain('height="24"');
      expect(svg).toContain('aria-hidden="true"');
      expect(svg).toContain('</svg>');
    });

    it('includes className when provided', () => {
      const resolved = resolveIconData(TEST_COLLECTION, 'home')!;
      const svg = generateSvg(resolved, { className: 'my-icon' });
      expect(svg).toContain('class="my-icon"');
    });

    it('includes aria-label when provided', () => {
      const resolved = resolveIconData(TEST_COLLECTION, 'home')!;
      const svg = generateSvg(resolved, { ariaLabel: 'Home' });
      expect(svg).toContain('role="img"');
      expect(svg).toContain('aria-label="Home"');
      expect(svg).not.toContain('aria-hidden');
    });

    it('includes title when provided', () => {
      const resolved = resolveIconData(TEST_COLLECTION, 'home')!;
      const svg = generateSvg(resolved, { title: 'Home Icon' });
      expect(svg).toContain('<title>Home Icon</title>');
    });
  });

  describe('escapeHtml', () => {
    it('escapes HTML special characters', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      expect(escapeHtml("it's & that")).toBe('it&#39;s &amp; that');
    });
  });

  describe('getIconSync', () => {
    beforeEach(() => {
      registerCollection(TEST_COLLECTION);
    });

    it('returns null for unregistered collections', () => {
      expect(getIconSync('nonexistent:icon')).toBeNull();
    });

    it('returns null for invalid names', () => {
      expect(getIconSync('invalid')).toBeNull();
    });

    it('returns resolved icon data for registered icons', () => {
      const data = getIconSync('test:home');
      expect(data).not.toBeNull();
      expect(data?.body).toContain('<path');
    });

    it('returns null for non-existent icons', () => {
      expect(getIconSync('test:nonexistent')).toBeNull();
    });

    it('resolves aliases', () => {
      const data = getIconSync('test:house');
      expect(data).not.toBeNull();
    });
  });

  describe('scanVueSfcForIcons', () => {
    it('scans icon attributes in Vue templates', () => {
      const source = `
<template>
  <div>
    <SIcon icon="lucide:home" />
    <Icon name="mdi:user" :size="24" />
    <button><SIcon icon="lucide:arrow-left" />Back</button>
  </div>
</template>
<script setup>
import { SIcon } from '@soybeanjs/ui';
const icon = 'lucide:settings';
</script>
`;
      const icons = scanVueSfcForIcons(source);
      expect(icons.has('lucide:home')).toBe(true);
      expect(icons.has('mdi:user')).toBe(true);
      expect(icons.has('lucide:arrow-left')).toBe(true);
    });

    it('ignores icon names without collection prefix', () => {
      const source = `<Icon icon="home" />`;
      const icons = scanVueSfcForIcons(source);
      expect(icons.size).toBe(0);
    });

    it('scans icon function calls', () => {
      const source = `
const icon = getIcon('lucide:search');
const other = useIcon('mdi:close');
`;
      const icons = scanVueSfcForIcons(source);
      expect(icons.has('lucide:search')).toBe(true);
      expect(icons.has('mdi:close')).toBe(true);
    });
  });
});
