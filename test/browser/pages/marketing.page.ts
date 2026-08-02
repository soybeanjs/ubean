import { BasePage } from './base.page';

/** Page object for the marketing page (/marketing-page) — route group test. */
export class MarketingPage extends BasePage {
  constructor() {
    super('/marketing-page');
  }

  async heading(): Promise<string | null> {
    return this.text('h1');
  }
}
