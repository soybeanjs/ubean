import { BasePage } from './base.page';

/** Page object for the home page (/). */
export class HomePage extends BasePage {
  constructor() {
    super('/');
  }

  async heading(): Promise<string | null> {
    return this.text('h1');
  }

  async linkCount(): Promise<number> {
    return this.count('.test-card a, .test-card a[href]');
  }

  /** Click a nav/footer link by its href and follow SPA navigation. */
  async followLink(href: string): Promise<{ url: string; title: string }> {
    return this.clickNav(`a[href="${href}"]`);
  }
}
