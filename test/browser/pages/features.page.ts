import { BasePage } from './base.page';

/** Page object for the features listing page (/features). */
export class FeaturesPage extends BasePage {
  constructor() {
    super('/features');
  }

  async heading(): Promise<string | null> {
    return this.text('h1');
  }

  /** Count all test-btn links on the page. */
  async testButtonCount(): Promise<number> {
    return this.count('.test-btn');
  }

  /** Count test buttons in a specific group by class (e.g. 'get', 'error', 'page'). */
  async testButtonCountByClass(className: string): Promise<number> {
    return this.count(`.test-btn.${className}`);
  }

  async titleFromHead(): Promise<string | null> {
    return this.text('title');
  }
}
