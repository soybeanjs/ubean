import { BasePage } from './base.page';

/**
 * Page object for the about-alias page (/about-alias) — reuse route test.
 *
 * This route reuses the About page component via `definePage({ reuse: 'About' })`.
 * The rendered content should be identical to /about.
 */
export class AboutAliasPage extends BasePage {
  constructor() {
    super('/about-alias');
  }

  async heading(): Promise<string | null> {
    return this.text('h1');
  }

  async featureCount(): Promise<number> {
    return this.count('.feature-item');
  }
}
