import { describe, it, expect } from 'vitest';
import { mergeMetadata, buildMetaTags, buildLinkTags, buildTitle } from 'ubean';
import type { SeoMetadata } from 'ubean';
import { api } from './helper';

describe('SEO system', () => {
  describe('mergeMetadata()', () => {
    it('merges two metadata objects', () => {
      const base: SeoMetadata = { title: 'Base', description: 'Base desc' };
      const override: SeoMetadata = { title: 'Override' };
      const merged = mergeMetadata(base, override);
      expect(merged.title).toBe('Override');
      expect(merged.description).toBe('Base desc');
    });

    it('handles undefined values', () => {
      const merged = mergeMetadata(undefined, { title: 'Test' }, undefined);
      expect(merged.title).toBe('Test');
    });

    it('handles null values', () => {
      const merged = mergeMetadata(null, { title: 'Test' });
      expect(merged.title).toBe('Test');
    });

    it('merges meta arrays', () => {
      const base: SeoMetadata = {
        meta: [{ name: 'description', content: 'base' }]
      };
      const override: SeoMetadata = {
        meta: [{ name: 'keywords', content: 'test' }]
      };
      const merged = mergeMetadata(base, override);
      expect(merged.meta).toHaveLength(2);
    });

    it('merges link arrays', () => {
      const base: SeoMetadata = {
        link: [{ rel: 'canonical', href: 'https://example.com' }]
      };
      const override: SeoMetadata = {
        link: [{ rel: 'icon', href: '/favicon.ico' }]
      };
      const merged = mergeMetadata(base, override);
      expect(merged.link).toHaveLength(2);
    });

    it('merges openGraph', () => {
      const base: SeoMetadata = {
        openGraph: { title: 'OG Title', type: 'website' }
      };
      const override: SeoMetadata = {
        openGraph: { description: 'OG Description' }
      };
      const merged = mergeMetadata(base, override);
      expect(merged.openGraph?.title).toBe('OG Title');
      expect(merged.openGraph?.description).toBe('OG Description');
      expect(merged.openGraph?.type).toBe('website');
    });

    it('merges twitter', () => {
      const base: SeoMetadata = {
        twitter: { card: 'summary', site: '@user' }
      };
      const override: SeoMetadata = {
        twitter: { title: 'Twitter Title' }
      };
      const merged = mergeMetadata(base, override);
      expect(merged.twitter?.card).toBe('summary');
      expect(merged.twitter?.title).toBe('Twitter Title');
    });

    it('titleTemplate from override wins', () => {
      const base: SeoMetadata = { titleTemplate: 'Base - %s' };
      const override: SeoMetadata = { titleTemplate: 'Override - %s' };
      const merged = mergeMetadata(base, override);
      expect(merged.titleTemplate).toBe('Override - %s');
    });

    it('handles empty inputs', () => {
      const merged = mergeMetadata();
      expect(merged).toEqual({});
    });
  });

  describe('buildMetaTags()', () => {
    it('builds description meta tag', () => {
      const tags = buildMetaTags({ description: 'Test description' });
      expect(tags).toContainEqual({ name: 'description', content: 'Test description' });
    });

    it('builds keywords meta tag', () => {
      const tags = buildMetaTags({ keywords: 'test, keywords' });
      expect(tags.some(t => t.name === 'keywords')).toBe(true);
    });

    it('builds author meta tag', () => {
      const tags = buildMetaTags({ author: 'John' });
      expect(tags.some(t => t.name === 'author')).toBe(true);
    });

    it('returns empty array for empty metadata', () => {
      const tags = buildMetaTags({});
      expect(tags).toEqual([]);
    });
  });

  describe('buildLinkTags()', () => {
    it('builds canonical link', () => {
      const links = buildLinkTags({ canonical: 'https://example.com/page' });
      expect(links).toContainEqual({ rel: 'canonical', href: 'https://example.com/page' });
    });

    it('returns empty array for empty metadata', () => {
      const links = buildLinkTags({});
      expect(links).toEqual([]);
    });
  });

  describe('buildTitle()', () => {
    it('returns title as-is', () => {
      const title = buildTitle({ title: 'My Page' });
      expect(title).toBe('My Page');
    });

    it('applies string titleTemplate', () => {
      const title = buildTitle({
        title: 'My Page',
        titleTemplate: '%s - My Site'
      });
      expect(title).toContain('My Page');
      expect(title).toContain('My Site');
    });

    it('applies function titleTemplate', () => {
      const title = buildTitle({
        title: 'My Page',
        titleTemplate: t => `${t} - Function Site`
      });
      expect(title).toBe('My Page - Function Site');
    });

    it('uses fallback title when no title set', () => {
      const title = buildTitle({}, 'Fallback Title');
      expect(title).toBe('Fallback Title');
    });

    it('returns empty string when no title', () => {
      const title = buildTitle({});
      expect(title).toBe('');
    });
  });

  describe('HTTP integration - SEO meta page', () => {
    it('seo-meta page renders with proper title', async () => {
      const res = await api('/seo-meta');
      expect(res.status).toBe(200);
      expect(res.text).toContain('<title');
    });

    it('seo-meta page contains meta tags', async () => {
      const res = await api('/seo-meta');
      expect(res.status).toBe(200);
      expect(res.text.toLowerCase()).toContain('meta');
    });
  });

  describe('HTTP integration - robots.txt', () => {
    it('robots.txt route returns text/plain', async () => {
      const res = await api('/robots.txt');
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/plain');
      expect(res.text).toContain('User-agent');
    });
  });

  describe('HTTP integration - sitemap.xml', () => {
    it('sitemap.xml route returns XML', async () => {
      const res = await api('/sitemap.xml');
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('xml');
      expect(res.text).toContain('<urlset');
    });
  });
});
