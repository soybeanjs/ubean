import { BasePage } from './base.page';

/** Page object for the SEO meta test page (/seo-meta). */
export class SeoMetaPage extends BasePage {
  constructor() {
    super('/seo-meta');
  }

  async heading(): Promise<string | null> {
    return this.text('h1');
  }

  async descriptionMeta(): Promise<string | null> {
    return this.meta('description');
  }

  async robotsMeta(): Promise<string | null> {
    return this.meta('robots');
  }

  async authorMeta(): Promise<string | null> {
    return this.meta('author');
  }

  async themeColorMeta(): Promise<string | null> {
    return this.meta('theme-color');
  }

  async generatorMeta(): Promise<string | null> {
    return this.meta('generator');
  }

  async applicationNameMeta(): Promise<string | null> {
    return this.meta('application-name');
  }

  async ogTitle(): Promise<string | null> {
    return this.metaProp('og:title');
  }

  async ogDescription(): Promise<string | null> {
    return this.metaProp('og:description');
  }

  async ogType(): Promise<string | null> {
    return this.metaProp('og:type');
  }

  async ogImage(): Promise<string | null> {
    return this.metaProp('og:image');
  }

  async ogSiteName(): Promise<string | null> {
    return this.metaProp('og:site_name');
  }

  async twitterCard(): Promise<string | null> {
    // Twitter Card meta tags use the "name" attribute (not "property")
    return this.meta('twitter:card');
  }

  async twitterTitle(): Promise<string | null> {
    return this.meta('twitter:title');
  }

  async canonicalLink(): Promise<string | null> {
    return this.linkHref('canonical');
  }

  /** Count alternate hreflang links. */
  async alternateLinkCount(): Promise<number> {
    return this.count('link[rel="alternate"]');
  }
}
