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

  return lines.join('\n').trim() + '\n';
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
