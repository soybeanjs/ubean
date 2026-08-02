import { BasePage } from './base.page';

/** Page object for the about page (/about). Declares SEO head via definePage. */
export class AboutPage extends BasePage {
  constructor() {
    super('/about');
  }

  async heading(): Promise<string | null> {
    return this.text('h1');
  }

  async featureCount(): Promise<number> {
    return this.count('.feature-item');
  }

  async descriptionMeta(): Promise<string | null> {
    return this.meta('description');
  }

  async titleFromHead(): Promise<string | null> {
    return this.text('title');
  }

  /** Navigate back to home via the in-page link. */
  async goHome(): Promise<{ url: string; title: string }> {
    return this.clickNav('a.back-link, a:text-is("← 返回首页")');
  }
}
