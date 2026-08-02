/**
 * Task 8 — metadata 自动 dedupe 单元测试
 *
 * 覆盖:
 * - dedupeMetaTags:按 name / property 去重(last-wins)
 * - dedupeLinkTags:按 rel + hreflang/type/sizes 去重(last-wins)
 * - mergeMetadata:meta / link 数组自动去重
 * - mergeSeoLayers:全局 → 布局 → 页面 三层合并优先级
 * - 不变性:入参数组不被修改
 */
import { describe, it, expect } from 'vitest';
import { dedupeMetaTags, dedupeLinkTags, mergeMetadata, mergeSeoLayers } from '../src/index';
import type { MetaTag, LinkTag, SeoMetadata } from '../src/index';

describe('Task 8 — metadata 自动 dedupe', () => {
  describe('dedupeMetaTags()', () => {
    it('按 name 去重,保留最后一个', () => {
      const tags: MetaTag[] = [
        { name: 'description', content: 'first' },
        { name: 'description', content: 'second' },
        { name: 'description', content: 'third' }
      ];
      const result = dedupeMetaTags(tags);
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('third');
    });

    it('不同 name 共存', () => {
      const tags: MetaTag[] = [
        { name: 'description', content: 'desc' },
        { name: 'keywords', content: 'kw' },
        { name: 'author', content: 'John' }
      ];
      const result = dedupeMetaTags(tags);
      expect(result).toHaveLength(3);
    });

    it('按 property 去重(og:title),保留最后一个', () => {
      const tags: MetaTag[] = [
        { property: 'og:title', content: 'Global Title' },
        { property: 'og:title', content: 'Page Title' }
      ];
      const result = dedupeMetaTags(tags);
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Page Title');
    });

    it('不同 property 共存(og:title / og:description / og:image)', () => {
      const tags: MetaTag[] = [
        { property: 'og:title', content: 'T' },
        { property: 'og:description', content: 'D' },
        { property: 'og:image', content: 'img.png' }
      ];
      const result = dedupeMetaTags(tags);
      expect(result).toHaveLength(3);
    });

    it('name 与 property 独立去重,不互相影响', () => {
      const tags: MetaTag[] = [
        { name: 'twitter:card', content: 'summary' },
        { property: 'og:title', content: 'OG' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { property: 'og:title', content: 'OG Page' }
      ];
      const result = dedupeMetaTags(tags);
      expect(result).toHaveLength(2);
      expect(result.find(t => t.name === 'twitter:card')?.content).toBe('summary_large_image');
      expect(result.find(t => t.property === 'og:title')?.content).toBe('OG Page');
    });

    it('twitter:* (name) 与 og:* (property) 混合正确去重', () => {
      const tags: MetaTag[] = [
        { name: 'twitter:title', content: 'TW Global' },
        { property: 'og:title', content: 'OG Global' },
        { name: 'twitter:title', content: 'TW Page' },
        { property: 'og:title', content: 'OG Page' }
      ];
      const result = dedupeMetaTags(tags);
      expect(result).toHaveLength(2);
      expect(result.find(t => t.name === 'twitter:title')?.content).toBe('TW Page');
      expect(result.find(t => t.property === 'og:title')?.content).toBe('OG Page');
    });

    it('无 name/property 的 tag 保留全部(无法去重)', () => {
      const tags: MetaTag[] = [{ content: 'a' }, { content: 'b' }, { content: 'c' }];
      const result = dedupeMetaTags(tags);
      expect(result).toHaveLength(3);
    });

    it('空数组返回空数组', () => {
      expect(dedupeMetaTags([])).toEqual([]);
    });

    it('保留首次出现的位置(后定义覆盖值,但顺序不变)', () => {
      const tags: MetaTag[] = [
        { name: 'description', content: 'first' },
        { name: 'keywords', content: 'kw' },
        { name: 'description', content: 'second' }
      ];
      const result = dedupeMetaTags(tags);
      expect(result).toHaveLength(2);
      // description 保留在原首次位置,但 content 被覆盖
      expect(result[0].name).toBe('description');
      expect(result[0].content).toBe('second');
      expect(result[1].name).toBe('keywords');
    });

    it('不修改入参数组', () => {
      const original: MetaTag[] = [
        { name: 'description', content: 'first' },
        { name: 'description', content: 'second' }
      ];
      const snapshot = original.map(t => ({ ...t }));
      dedupeMetaTags(original);
      expect(original).toEqual(snapshot);
    });
  });

  describe('dedupeLinkTags()', () => {
    it('按 rel 去重 canonical(last-wins)', () => {
      const tags: LinkTag[] = [
        { rel: 'canonical', href: 'https://example.com/layout' },
        { rel: 'canonical', href: 'https://example.com/page' }
      ];
      const result = dedupeLinkTags(tags);
      expect(result).toHaveLength(1);
      expect(result[0].href).toBe('https://example.com/page');
    });

    it('不同 rel 共存(canonical + icon)', () => {
      const tags: LinkTag[] = [
        { rel: 'canonical', href: 'https://example.com' },
        { rel: 'icon', href: '/favicon.ico' }
      ];
      const result = dedupeLinkTags(tags);
      expect(result).toHaveLength(2);
    });

    it('rel + hreflang 去重 alternate(不同 hreflang 共存)', () => {
      const tags: LinkTag[] = [
        { rel: 'alternate', href: 'https://example.com/en', hreflang: 'en' },
        { rel: 'alternate', href: 'https://example.com/fr', hreflang: 'fr' },
        { rel: 'alternate', href: 'https://example.com/de', hreflang: 'de' }
      ];
      const result = dedupeLinkTags(tags);
      expect(result).toHaveLength(3);
    });

    it('同 rel + 同 hreflang 的 alternate 去重(last-wins)', () => {
      const tags: LinkTag[] = [
        { rel: 'alternate', href: 'https://example.com/en-old', hreflang: 'en' },
        { rel: 'alternate', href: 'https://example.com/en-new', hreflang: 'en' }
      ];
      const result = dedupeLinkTags(tags);
      expect(result).toHaveLength(1);
      expect(result[0].href).toBe('https://example.com/en-new');
    });

    it('rel + sizes 去重 icon(不同尺寸共存)', () => {
      const tags: LinkTag[] = [
        { rel: 'icon', href: '/icon-16.png', sizes: '16x16' },
        { rel: 'icon', href: '/icon-32.png', sizes: '32x32' },
        { rel: 'icon', href: '/icon-64.png', sizes: '64x64' }
      ];
      const result = dedupeLinkTags(tags);
      expect(result).toHaveLength(3);
    });

    it('同 rel + 同 sizes 的 icon 去重(last-wins)', () => {
      const tags: LinkTag[] = [
        { rel: 'icon', href: '/icon-16-old.png', sizes: '16x16' },
        { rel: 'icon', href: '/icon-16-new.png', sizes: '16x16' }
      ];
      const result = dedupeLinkTags(tags);
      expect(result).toHaveLength(1);
      expect(result[0].href).toBe('/icon-16-new.png');
    });

    it('rel + type 去重(不同 type 共存)', () => {
      const tags: LinkTag[] = [
        { rel: 'alternate', href: '/feed.xml', type: 'application/rss+xml' },
        { rel: 'alternate', href: '/feed.json', type: 'application/json' }
      ];
      const result = dedupeLinkTags(tags);
      expect(result).toHaveLength(2);
    });

    it('同 rel + 同 type 去重(last-wins)', () => {
      const tags: LinkTag[] = [
        { rel: 'alternate', href: '/feed-old.xml', type: 'application/rss+xml' },
        { rel: 'alternate', href: '/feed-new.xml', type: 'application/rss+xml' }
      ];
      const result = dedupeLinkTags(tags);
      expect(result).toHaveLength(1);
      expect(result[0].href).toBe('/feed-new.xml');
    });

    it('无 rel 的 link 保留全部(无法去重)', () => {
      const tags: LinkTag[] = [{ rel: '', href: 'a' } as LinkTag, { rel: '', href: 'b' } as LinkTag];
      const result = dedupeLinkTags(tags);
      expect(result).toHaveLength(2);
    });

    it('空数组返回空数组', () => {
      expect(dedupeLinkTags([])).toEqual([]);
    });

    it('不修改入参数组', () => {
      const original: LinkTag[] = [
        { rel: 'canonical', href: 'https://example.com/a' },
        { rel: 'canonical', href: 'https://example.com/b' }
      ];
      const snapshot = original.map(t => ({ ...t }));
      dedupeLinkTags(original);
      expect(original).toEqual(snapshot);
    });
  });

  describe('mergeMetadata() — 自动去重', () => {
    it('meta 数组按 name 自动去重(last-wins)', () => {
      const layout: SeoMetadata = {
        meta: [{ name: 'description', content: 'layout desc' }]
      };
      const page: SeoMetadata = {
        meta: [{ name: 'description', content: 'page desc' }]
      };
      const merged = mergeMetadata(layout, page);
      expect(merged.meta).toHaveLength(1);
      expect(merged.meta![0].content).toBe('page desc');
    });

    it('meta 数组按 property 自动去重(og:title)', () => {
      const layout: SeoMetadata = {
        meta: [{ property: 'og:title', content: 'Layout Title' }]
      };
      const page: SeoMetadata = {
        meta: [{ property: 'og:title', content: 'Page Title' }]
      };
      const merged = mergeMetadata(layout, page);
      expect(merged.meta).toHaveLength(1);
      expect(merged.meta![0].content).toBe('Page Title');
    });

    it('不同 name 的 meta 共存(不丢失)', () => {
      const layout: SeoMetadata = {
        meta: [{ name: 'description', content: 'desc' }]
      };
      const page: SeoMetadata = {
        meta: [
          { name: 'keywords', content: 'kw' },
          { name: 'author', content: 'John' }
        ]
      };
      const merged = mergeMetadata(layout, page);
      expect(merged.meta).toHaveLength(3);
    });

    it('link 数组按 rel 自动去重(canonical last-wins)', () => {
      const layout: SeoMetadata = {
        link: [{ rel: 'canonical', href: 'https://example.com/layout' }]
      };
      const page: SeoMetadata = {
        link: [{ rel: 'canonical', href: 'https://example.com/page' }]
      };
      const merged = mergeMetadata(layout, page);
      expect(merged.link).toHaveLength(1);
      expect(merged.link![0].href).toBe('https://example.com/page');
    });

    it('link 数组按 rel+hreflang 自动去重(不同 hreflang 共存)', () => {
      const layout: SeoMetadata = {
        link: [
          { rel: 'alternate', href: 'https://example.com/en', hreflang: 'en' },
          { rel: 'alternate', href: 'https://example.com/fr', hreflang: 'fr' }
        ]
      };
      const page: SeoMetadata = {
        link: [{ rel: 'alternate', href: 'https://example.com/de', hreflang: 'de' }]
      };
      const merged = mergeMetadata(layout, page);
      expect(merged.link).toHaveLength(3);
    });

    it('三层合并:同名 meta 全部折叠为最后一个', () => {
      const global: SeoMetadata = {
        meta: [
          { name: 'description', content: 'global' },
          { name: 'keywords', content: 'g-kw' }
        ]
      };
      const layout: SeoMetadata = {
        meta: [
          { name: 'description', content: 'layout' },
          { name: 'author', content: 'layout-author' }
        ]
      };
      const page: SeoMetadata = {
        meta: [{ name: 'description', content: 'page' }]
      };
      const merged = mergeMetadata(global, layout, page);
      // description(3 → 1, page wins) + keywords(1) + author(1) = 3
      expect(merged.meta).toHaveLength(3);
      expect(merged.meta!.find(t => t.name === 'description')?.content).toBe('page');
      expect(merged.meta!.find(t => t.name === 'keywords')?.content).toBe('g-kw');
      expect(merged.meta!.find(t => t.name === 'author')?.content).toBe('layout-author');
    });

    it('不修改入参的 meta/link 数组', () => {
      const layoutMeta: MetaTag[] = [{ name: 'description', content: 'layout' }];
      const pageMeta: MetaTag[] = [{ name: 'description', content: 'page' }];
      const layoutLink: LinkTag[] = [{ rel: 'canonical', href: 'a' }];
      const pageLink: LinkTag[] = [{ rel: 'canonical', href: 'b' }];
      const layout: SeoMetadata = { meta: layoutMeta, link: layoutLink };
      const page: SeoMetadata = { meta: pageMeta, link: pageLink };

      mergeMetadata(layout, page);

      expect(layout.meta).toEqual([{ name: 'description', content: 'layout' }]);
      expect(page.meta).toEqual([{ name: 'description', content: 'page' }]);
      expect(layout.link).toEqual([{ rel: 'canonical', href: 'a' }]);
      expect(page.link).toEqual([{ rel: 'canonical', href: 'b' }]);
    });

    it('undefined / null 入参被跳过,去重仍正常', () => {
      const merged = mergeMetadata(undefined, null, { meta: [{ name: 'description', content: 'a' }] }, undefined, {
        meta: [{ name: 'description', content: 'b' }]
      });
      expect(merged.meta).toHaveLength(1);
      expect(merged.meta![0].content).toBe('b');
    });
  });

  describe('mergeSeoLayers() — 三层优先级', () => {
    it('页面 title 覆盖布局 title 覆盖全局 title', () => {
      const global: SeoMetadata = { title: 'Global' };
      const layout: SeoMetadata = { title: 'Layout' };
      const page: SeoMetadata = { title: 'Page' };
      const merged = mergeSeoLayers(global, layout, page);
      expect(merged.title).toBe('Page');
    });

    it('页面 title 覆盖布局 title(无全局)', () => {
      const layout: SeoMetadata = { title: 'Layout' };
      const page: SeoMetadata = { title: 'Page' };
      const merged = mergeSeoLayers(undefined, layout, page);
      expect(merged.title).toBe('Page');
    });

    it('布局 title 覆盖全局 title(无页面)', () => {
      const global: SeoMetadata = { title: 'Global' };
      const layout: SeoMetadata = { title: 'Layout' };
      const merged = mergeSeoLayers(global, layout, undefined);
      expect(merged.title).toBe('Layout');
    });

    it('仅全局存在时,使用全局 title', () => {
      const global: SeoMetadata = { title: 'Global' };
      const merged = mergeSeoLayers(global, undefined, undefined);
      expect(merged.title).toBe('Global');
    });

    it('全部 undefined 返回空对象', () => {
      const merged = mergeSeoLayers(undefined, undefined, undefined);
      expect(merged).toEqual({});
    });

    it('description 三层覆盖:页面 > 布局 > 全局', () => {
      const global: SeoMetadata = { description: 'global desc' };
      const layout: SeoMetadata = { description: 'layout desc' };
      const page: SeoMetadata = { description: 'page desc' };
      const merged = mergeSeoLayers(global, layout, page);
      expect(merged.description).toBe('page desc');
    });

    it('openGraph 三层浅合并:页面字段覆盖布局字段覆盖全局字段', () => {
      const global: SeoMetadata = {
        openGraph: { type: 'website', siteName: 'My Site' }
      };
      const layout: SeoMetadata = {
        openGraph: { title: 'Layout OG', type: 'article' }
      };
      const page: SeoMetadata = {
        openGraph: { description: 'Page OG desc' }
      };
      const merged = mergeSeoLayers(global, layout, page);
      expect(merged.openGraph?.type).toBe('article'); // layout 覆盖 global
      expect(merged.openGraph?.siteName).toBe('My Site'); // 仅 global
      expect(merged.openGraph?.title).toBe('Layout OG'); // 仅 layout
      expect(merged.openGraph?.description).toBe('Page OG desc'); // 仅 page
    });

    it('meta 数组三层去重:页面同名 meta 覆盖布局覆盖全局', () => {
      const global: SeoMetadata = {
        meta: [{ name: 'description', content: 'global' }]
      };
      const layout: SeoMetadata = {
        meta: [{ name: 'description', content: 'layout' }]
      };
      const page: SeoMetadata = {
        meta: [{ name: 'description', content: 'page' }]
      };
      const merged = mergeSeoLayers(global, layout, page);
      expect(merged.meta).toHaveLength(1);
      expect(merged.meta![0].content).toBe('page');
    });

    it('canonical 三层去重:页面覆盖布局覆盖全局', () => {
      const global: SeoMetadata = {
        link: [{ rel: 'canonical', href: 'https://example.com/global' }]
      };
      const layout: SeoMetadata = {
        link: [{ rel: 'canonical', href: 'https://example.com/layout' }]
      };
      const page: SeoMetadata = {
        link: [{ rel: 'canonical', href: 'https://example.com/page' }]
      };
      const merged = mergeSeoLayers(global, layout, page);
      expect(merged.link).toHaveLength(1);
      expect(merged.link![0].href).toBe('https://example.com/page');
    });

    it('hreflang alternate 三层合并(不同 hreflang 共存,同 hreflang 页面覆盖)', () => {
      const global: SeoMetadata = {
        link: [{ rel: 'alternate', href: 'https://example.com/en', hreflang: 'en' }]
      };
      const layout: SeoMetadata = {
        link: [{ rel: 'alternate', href: 'https://example.com/fr', hreflang: 'fr' }]
      };
      const page: SeoMetadata = {
        link: [
          { rel: 'alternate', href: 'https://example.com/de', hreflang: 'de' },
          { rel: 'alternate', href: 'https://example.com/en-v2', hreflang: 'en' }
        ]
      };
      const merged = mergeSeoLayers(global, layout, page);
      // en(被 page 覆盖) + fr(仅 layout) + de(仅 page) = 3
      expect(merged.link).toHaveLength(3);
      const enLink = merged.link!.find(l => l.hreflang === 'en');
      expect(enLink?.href).toBe('https://example.com/en-v2');
    });

    it('与 mergeMetadata(global, layout, page) 结果等价', () => {
      const global: SeoMetadata = { title: 'G', description: 'gd' };
      const layout: SeoMetadata = { title: 'L', meta: [{ name: 'x', content: '1' }] };
      const page: SeoMetadata = { title: 'P', meta: [{ name: 'x', content: '2' }] };
      const a = mergeSeoLayers(global, layout, page);
      const b = mergeMetadata(global, layout, page);
      expect(a).toEqual(b);
    });

    it('null 入参被正确处理(等同于 undefined)', () => {
      const global: SeoMetadata = { title: 'G' };
      const page: SeoMetadata = { title: 'P' };
      const merged = mergeSeoLayers(global, null, page);
      expect(merged.title).toBe('P');
    });
  });
});
