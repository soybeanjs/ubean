export interface RobotsOptions {
  userAgent?: string;
  allow?: string | string[];
  disallow?: string | string[];
  sitemap?: string | string[];
  crawlDelay?: number;
}

export interface SitemapUrl {
  loc: string;
  lastmod?: string | Date;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
}

export interface MetaTag {
  name?: string;
  property?: string;
  content: string;
}

export interface LinkTag {
  rel: string;
  href: string;
  hreflang?: string;
  type?: string;
  sizes?: string;
  media?: string;
  as?: string;
  crossorigin?: '' | 'anonymous' | 'use-credentials';
}

export interface OpenGraphMeta {
  title?: string;
  description?: string;
  type?: 'website' | 'article' | 'book' | 'profile' | 'music.song' | 'music.album' | 'video.movie';
  url?: string;
  image?: string | OGImage;
  siteName?: string;
  locale?: string;
  localeAlternate?: string[];
}

export interface OGImage {
  url: string;
  width?: number;
  height?: number;
  alt?: string;
  type?: string;
}

export interface TwitterMeta {
  card?: 'summary' | 'summary_large_image' | 'app' | 'player';
  site?: string;
  creator?: string;
  title?: string;
  description?: string;
  image?: string;
}

export interface SeoMetadata {
  title?: string;
  titleTemplate?: string | ((title: string) => string);
  description?: string;
  keywords?: string | string[];
  author?: string;
  canonical?: string;
  robots?: string | { index?: boolean; follow?: boolean };
  openGraph?: OpenGraphMeta;
  twitter?: TwitterMeta;
  meta?: MetaTag[];
  link?: LinkTag[];
  htmlAttrs?: Record<string, string>;
  bodyAttrs?: Record<string, string>;
}

export interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

export interface WebAppManifest {
  name?: string;
  short_name?: string;
  description?: string;
  start_url?: string;
  display?: 'fullscreen' | 'standalone' | 'minimal-ui' | 'browser';
  background_color?: string;
  theme_color?: string;
  orientation?: 'portrait' | 'landscape' | 'any';
  icons?: ManifestIcon[];
  scope?: string;
  lang?: string;
  dir?: 'ltr' | 'rtl' | 'auto';
}

export function useSeoMeta(meta: SeoMetadata): SeoMetadata {
  return meta;
}

export function mergeMetadata(...metadatas: (SeoMetadata | undefined | null)[]): SeoMetadata {
  const result: SeoMetadata = {};

  for (const meta of metadatas) {
    if (!meta) continue;

    if (meta.title !== undefined) result.title = meta.title;
    if (meta.titleTemplate !== undefined) result.titleTemplate = meta.titleTemplate;
    if (meta.description !== undefined) result.description = meta.description;
    if (meta.keywords !== undefined) {
      result.keywords = meta.keywords;
    }
    if (meta.author !== undefined) result.author = meta.author;
    if (meta.canonical !== undefined) result.canonical = meta.canonical;
    if (meta.robots !== undefined) result.robots = meta.robots;
    if (meta.htmlAttrs) result.htmlAttrs = { ...result.htmlAttrs, ...meta.htmlAttrs };
    if (meta.bodyAttrs) result.bodyAttrs = { ...result.bodyAttrs, ...meta.bodyAttrs };

    if (meta.openGraph) {
      result.openGraph = { ...result.openGraph, ...meta.openGraph };
    }
    if (meta.twitter) {
      result.twitter = { ...result.twitter, ...meta.twitter };
    }

    if (meta.meta) {
      result.meta = [...(result.meta || []), ...meta.meta];
    }
    if (meta.link) {
      result.link = [...(result.link || []), ...meta.link];
    }
  }

  return result;
}

export function buildMetaTags(meta: SeoMetadata): MetaTag[] {
  const tags: MetaTag[] = [];

  if (meta.description) {
    tags.push({ name: 'description', content: meta.description });
  }
  if (meta.keywords) {
    const kws = Array.isArray(meta.keywords) ? meta.keywords.join(', ') : meta.keywords;
    tags.push({ name: 'keywords', content: kws });
  }
  if (meta.author) {
    tags.push({ name: 'author', content: meta.author });
  }
  if (meta.robots) {
    let robotsValue: string;
    if (typeof meta.robots === 'string') {
      robotsValue = meta.robots;
    } else {
      const parts: string[] = [];
      if (meta.robots.index !== undefined) parts.push(meta.robots.index ? 'index' : 'noindex');
      if (meta.robots.follow !== undefined) parts.push(meta.robots.follow ? 'follow' : 'nofollow');
      robotsValue = parts.join(', ');
    }
    if (robotsValue) tags.push({ name: 'robots', content: robotsValue });
  }

  if (meta.openGraph) {
    const og = meta.openGraph;
    if (og.title) tags.push({ property: 'og:title', content: og.title });
    if (og.description) tags.push({ property: 'og:description', content: og.description });
    if (og.type) tags.push({ property: 'og:type', content: og.type });
    if (og.url) tags.push({ property: 'og:url', content: og.url });
    if (og.siteName) tags.push({ property: 'og:site_name', content: og.siteName });
    if (og.locale) tags.push({ property: 'og:locale', content: og.locale });
    if (og.localeAlternate) {
      for (const loc of og.localeAlternate) {
        tags.push({ property: 'og:locale:alternate', content: loc });
      }
    }
    if (og.image) {
      if (typeof og.image === 'string') {
        tags.push({ property: 'og:image', content: og.image });
      } else {
        tags.push({ property: 'og:image', content: og.image.url });
        if (og.image.width) tags.push({ property: 'og:image:width', content: String(og.image.width) });
        if (og.image.height) tags.push({ property: 'og:image:height', content: String(og.image.height) });
        if (og.image.alt) tags.push({ property: 'og:image:alt', content: og.image.alt });
        if (og.image.type) tags.push({ property: 'og:image:type', content: og.image.type });
      }
    }
  }

  if (meta.twitter) {
    const tw = meta.twitter;
    if (tw.card) tags.push({ name: 'twitter:card', content: tw.card });
    if (tw.site) tags.push({ name: 'twitter:site', content: tw.site });
    if (tw.creator) tags.push({ name: 'twitter:creator', content: tw.creator });
    if (tw.title) tags.push({ name: 'twitter:title', content: tw.title });
    if (tw.description) tags.push({ name: 'twitter:description', content: tw.description });
    if (tw.image) tags.push({ name: 'twitter:image', content: tw.image });
  }

  if (meta.meta) {
    tags.push(...meta.meta);
  }

  return tags;
}

export function buildLinkTags(meta: SeoMetadata): LinkTag[] {
  const links: LinkTag[] = [];

  if (meta.canonical) {
    links.push({ rel: 'canonical', href: meta.canonical });
  }

  if (meta.link) {
    links.push(...meta.link);
  }

  return links;
}

export function buildTitle(meta: SeoMetadata, fallbackTitle?: string): string {
  let title = meta.title || fallbackTitle || '';
  if (meta.titleTemplate && title) {
    if (typeof meta.titleTemplate === 'function') {
      title = meta.titleTemplate(title);
    } else {
      title = meta.titleTemplate.replace('%s', title);
    }
  }
  return title;
}

export function renderHeadTags(meta: SeoMetadata, fallbackTitle?: string): string {
  const parts: string[] = [];

  const title = buildTitle(meta, fallbackTitle);
  if (title) {
    parts.push(`<title>${escapeHtml(title)}</title>`);
  }

  const metaTags = buildMetaTags(meta);
  for (const tag of metaTags) {
    if (tag.name) {
      parts.push(`<meta name="${escapeHtml(tag.name)}" content="${escapeHtml(tag.content)}">`);
    } else if (tag.property) {
      parts.push(`<meta property="${escapeHtml(tag.property)}" content="${escapeHtml(tag.content)}">`);
    }
  }

  const linkTags = buildLinkTags(meta);
  for (const link of linkTags) {
    const attrs = [`rel="${escapeHtml(link.rel)}"`, `href="${escapeHtml(link.href)}"`];
    if (link.hreflang) attrs.push(`hreflang="${escapeHtml(link.hreflang)}"`);
    if (link.type) attrs.push(`type="${escapeHtml(link.type)}"`);
    if (link.sizes) attrs.push(`sizes="${escapeHtml(link.sizes)}"`);
    if (link.media) attrs.push(`media="${escapeHtml(link.media)}"`);
    if (link.as) attrs.push(`as="${escapeHtml(link.as)}"`);
    if (link.crossorigin !== undefined) {
      attrs.push(link.crossorigin ? `crossorigin="${escapeHtml(link.crossorigin)}"` : 'crossorigin');
    }
    parts.push(`<link ${attrs.join(' ')}>`);
  }

  return parts.join('\n');
}

export function createManifestResponse(manifest: WebAppManifest): Response {
  return new Response(JSON.stringify(manifest, null, 2), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=86400'
    }
  });
}

export function defineManifest(manifest: WebAppManifest): WebAppManifest {
  return manifest;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatRobotsTxt(options: RobotsOptions[] | RobotsOptions): string {
  const groups = Array.isArray(options) ? options : [options];
  const lines: string[] = [];

  for (const group of groups) {
    lines.push(`User-agent: ${group.userAgent || '*'}`);
    if (group.allow) {
      const allows = Array.isArray(group.allow) ? group.allow : [group.allow];
      for (const path of allows) {
        lines.push(`Allow: ${path}`);
      }
    }
    if (group.disallow) {
      const disallows = Array.isArray(group.disallow) ? group.disallow : [group.disallow];
      for (const path of disallows) {
        lines.push(`Disallow: ${path}`);
      }
    }
    if (group.crawlDelay !== undefined) {
      lines.push(`Crawl-delay: ${group.crawlDelay}`);
    }
    lines.push('');
  }

  const sitemaps = new Set<string>();
  for (const group of groups) {
    if (group.sitemap) {
      const maps = Array.isArray(group.sitemap) ? group.sitemap : [group.sitemap];
      for (const url of maps) {
        sitemaps.add(url);
      }
    }
  }

  for (const sitemap of sitemaps) {
    lines.push(`Sitemap: ${sitemap}`);
  }

  return `${lines.join('\n').trim()}\n`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDate(date: string | Date): string {
  if (date instanceof Date) {
    return date.toISOString().split('T')[0];
  }
  return date;
}

function formatSitemapXml(urls: SitemapUrl[]): string {
  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>'];
  lines.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');

  for (const url of urls) {
    lines.push('  <url>');
    lines.push(`    <loc>${escapeXml(url.loc)}</loc>`);
    if (url.lastmod) {
      lines.push(`    <lastmod>${escapeXml(formatDate(url.lastmod))}</lastmod>`);
    }
    if (url.changefreq) {
      lines.push(`    <changefreq>${url.changefreq}</changefreq>`);
    }
    if (url.priority !== undefined) {
      lines.push(`    <priority>${url.priority.toFixed(1)}</priority>`);
    }
    lines.push('  </url>');
  }

  lines.push('</urlset>');
  return lines.join('\n');
}

export function createRobotsResponse(options: RobotsOptions[] | RobotsOptions): Response {
  const body = formatRobotsTxt(options);
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}

export function createSitemapResponse(urls: SitemapUrl[]): Response {
  const body = formatSitemapXml(urls);
  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}

export function defineRobotsConfig(config: RobotsOptions[] | RobotsOptions): RobotsOptions[] | RobotsOptions {
  return config;
}

export function defineSitemapConfig(urls: SitemapUrl[] | (() => SitemapUrl[] | Promise<SitemapUrl[]>)) {
  return urls;
}

export { formatRobotsTxt, formatSitemapXml, escapeXml };
