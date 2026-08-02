import { BasePage } from './base.page';

/** Page object for the data fetch test page (/data-fetch). */
export class DataFetchPage extends BasePage {
  constructor() {
    super('/data-fetch');
  }

  async heading(): Promise<string | null> {
    return this.text('h1');
  }

  /** Click the "Re-run Tests" button. */
  async rerunTests(): Promise<void> {
    await this.click('button:text-is("Re-run Tests")');
  }

  /** Count result sections (each API call produces one section). */
  async resultCount(): Promise<number> {
    return this.count('section.mb-6');
  }

  /** Wait for results to appear (at least 1 result section). */
  async waitForResults(): Promise<void> {
    await this.waitFor('section.mb-6', 15000);
  }
}
