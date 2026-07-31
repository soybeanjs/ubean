/**
 * P9-07 JSON-LD / Schema.org 单元测试
 */
import { describe, it, expect } from 'vitest';
import {
  renderJsonLdScript,
  renderJsonLdScripts,
  mergeJsonLd,
  defineJsonLd,
  useSchemaOrg,
  schemaOrg
} from '../src/json-ld';

describe('P9-07 JSON-LD / Schema.org', () => {
  describe('renderJsonLdScript', () => {
    it('renders a single schema as <script> tag', () => {
      const html = renderJsonLdScript({
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'ubean'
      });
      expect(html.startsWith('<script type="application/ld+json">')).toBe(true);
      expect(html.endsWith('</script>')).toBe(true);
      const json = html.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
      const parsed = JSON.parse(json);
      expect(parsed['@type']).toBe('Organization');
      expect(parsed.name).toBe('ubean');
    });

    it('escapes < and > to prevent script injection', () => {
      const html = renderJsonLdScript({
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: '</script><script>alert(1)</script>'
      });
      // The </script> in the value should be escaped, so the outer tag remains intact
      expect(html.match(/<\/script>/g)?.length).toBe(1);
    });

    it('escapes U+2028 and U+2029', () => {
      const html = renderJsonLdScript({
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: `line1\u2028line2\u2029line3`
      });
      expect(html).not.toContain('\u2028');
      expect(html).not.toContain('\u2029');
    });

    it('handles @graph array', () => {
      const html = renderJsonLdScript({
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'Organization', name: 'Org1' },
          { '@type': 'WebSite', name: 'Site1' }
        ]
      });
      const json = html.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
      const parsed = JSON.parse(json);
      expect(parsed['@graph']).toHaveLength(2);
    });
  });

  describe('renderJsonLdScripts', () => {
    it('renders multiple schemas joined by newline', () => {
      const html = renderJsonLdScripts([
        { '@context': 'https://schema.org', '@type': 'Organization', name: 'Org' },
        { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Site' }
      ]);
      const scripts = html.split('\n');
      expect(scripts).toHaveLength(2);
      expect(scripts[0]).toContain('Organization');
      expect(scripts[1]).toContain('WebSite');
    });
  });

  describe('mergeJsonLd', () => {
    it('returns empty object for empty array', () => {
      const merged = mergeJsonLd([]);
      expect(merged).toEqual({});
    });

    it('returns single schema as-is (no @graph wrapping)', () => {
      const schema = { '@context': 'https://schema.org', '@type': 'Organization', name: 'Org' };
      const merged = mergeJsonLd([schema]);
      expect(merged).toEqual(schema);
    });

    it('merges schemas with same @context into @graph', () => {
      const merged = mergeJsonLd([
        { '@context': 'https://schema.org', '@type': 'Organization', name: 'Org1' },
        { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Site1' }
      ]);
      expect(merged).toHaveProperty('@context', 'https://schema.org');
      expect(merged).toHaveProperty('@graph');
      const graph = (merged as { '@graph': unknown[] })['@graph'];
      expect(graph).toHaveLength(2);
    });

    it('falls back to @graph array when contexts differ', () => {
      const merged = mergeJsonLd([
        { '@context': 'https://schema.org', '@type': 'Organization' },
        { '@context': 'https://schema.org/docs', '@type': 'WebSite' }
      ]);
      expect(merged).toHaveProperty('@graph');
      // Different contexts — should NOT hoist @context to outer
      expect(merged).not.toHaveProperty('@context');
    });
  });

  describe('defineJsonLd', () => {
    it('returns the schema as-is (identity function)', () => {
      const schema = { '@context': 'https://schema.org', '@type': 'Organization', name: 'X' };
      const result = defineJsonLd(schema);
      expect(result).toBe(schema);
    });

    it('accepts function schema', () => {
      const fn = () => ({ '@context': 'https://schema.org', '@type': 'Article' });
      const result = defineJsonLd(fn);
      expect(result).toBe(fn);
    });
  });

  describe('useSchemaOrg', () => {
    it('returns schema when no head instance is registered', () => {
      const schema = { '@context': 'https://schema.org', '@type': 'Organization', name: 'X' };
      const result = useSchemaOrg(schema);
      expect(result).toBe(schema);
    });

    it('pushes to global head when available', () => {
      const pushed: unknown[] = [];
      (globalThis as any).__UBEAN_HEAD__ = { push: (entry: unknown) => pushed.push(entry) };
      try {
        useSchemaOrg({ '@context': 'https://schema.org', '@type': 'Organization', name: 'X' });
        expect(pushed).toHaveLength(1);
        const entry = pushed[0] as { script: Array<{ type: string; innerHTML: string }> };
        expect(entry.script[0].type).toBe('application/ld+json');
        expect(entry.script[0].innerHTML).toContain('Organization');
      } finally {
        delete (globalThis as any).__UBEAN_HEAD__;
      }
    });
  });

  describe('schemaOrg factories', () => {
    it('organization() builds Organization schema', () => {
      const schema = schemaOrg.organization({
        name: 'ubean',
        url: 'https://ubean.dev',
        logo: 'https://ubean.dev/logo.png',
        sameAs: ['https://twitter.com/ubean']
      });
      expect(schema['@type']).toBe('Organization');
      expect(schema.name).toBe('ubean');
      expect(schema.url).toBe('https://ubean.dev');
      expect(schema.logo).toBe('https://ubean.dev/logo.png');
      expect(schema.sameAs).toEqual(['https://twitter.com/ubean']);
    });

    it('website() builds WebSite schema', () => {
      const schema = schemaOrg.website({
        name: 'ubean',
        url: 'https://ubean.dev',
        description: 'Vue meta-framework'
      });
      expect(schema['@type']).toBe('WebSite');
      expect(schema.name).toBe('ubean');
      expect(schema.description).toBe('Vue meta-framework');
    });

    it('article() builds Article schema with nested author', () => {
      const schema = schemaOrg.article({
        headline: 'My Article',
        author: 'John Doe',
        datePublished: '2026-07-31',
        image: 'https://example.com/img.png',
        publisher: 'ubean Blog'
      });
      expect(schema['@type']).toBe('Article');
      expect(schema.headline).toBe('My Article');
      expect((schema.author as { name: string }).name).toBe('John Doe');
      expect(schema.datePublished).toBe('2026-07-31');
      expect((schema.publisher as { name: string }).name).toBe('ubean Blog');
    });

    it('breadcrumb() builds BreadcrumbList with positions', () => {
      const schema = schemaOrg.breadcrumb([
        { name: 'Home', url: 'https://example.com' },
        { name: 'Blog', url: 'https://example.com/blog' },
        { name: 'Post', url: 'https://example.com/blog/post' }
      ]);
      expect(schema['@type']).toBe('BreadcrumbList');
      const items = schema.itemListElement as Array<{ position: number; name: string }>;
      expect(items).toHaveLength(3);
      expect(items[0].position).toBe(1);
      expect(items[2].position).toBe(3);
      expect(items[1].name).toBe('Blog');
    });

    it('product() builds Product schema with offers', () => {
      const schema = schemaOrg.product({
        name: 'Widget',
        description: 'A widget',
        brand: 'ubean',
        sku: 'W-001',
        price: '19.99',
        priceCurrency: 'USD',
        availability: 'InStock'
      });
      expect(schema['@type']).toBe('Product');
      expect(schema.name).toBe('Widget');
      expect((schema.brand as { name: string }).name).toBe('ubean');
      const offers = schema.offers as { price: string; priceCurrency: string; availability: string };
      expect(offers.price).toBe('19.99');
      expect(offers.priceCurrency).toBe('USD');
      expect(offers.availability).toBe('https://schema.org/InStock');
    });
  });
});
