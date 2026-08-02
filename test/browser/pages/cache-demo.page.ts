import { BasePage } from './base.page';

/** Page object for the page-cache demo page (/cache-demo). Declares cache: true. */
export class CacheDemoPage extends BasePage {
  constructor() {
    super('/cache-demo');
  }

  async heading(): Promise<string | null> {
    return this.text('h1');
  }

  async activatedCount(): Promise<string | null> {
    return this.text('.bg-green-100 .font-mono');
  }

  async deactivatedCount(): Promise<string | null> {
    return this.text('.bg-orange-100 .font-mono');
  }

  /** Increment the local counter. */
  async incrementCounter(): Promise<void> {
    // Use a more specific selector — the counter button has text starting with "计数器"
    await this.click('button.bg-blue-500:has-text("计数器")');
  }

  async counterText(): Promise<string | null> {
    return this.text('button.bg-blue-500:has-text("计数器")');
  }

  /** The include list from the runtime cache control section (2nd section). */
  async includeListText(): Promise<string | null> {
    // The runtime cache control section is the 2nd <section>, its grid is the
    // 2nd .grid.grid-cols-2 on the page. The include list is in its 1st child.
    return this.text('section:nth-of-type(2) .grid.grid-cols-2 > div:nth-child(1) .font-mono');
  }

  /** The exclude list from the runtime cache control section (2nd section). */
  async excludeListText(): Promise<string | null> {
    return this.text('section:nth-of-type(2) .grid.grid-cols-2 > div:nth-child(2) .font-mono');
  }

  /** Navigate to home via the in-page link. */
  async goHome(): Promise<{ url: string; title: string }> {
    return this.clickNav('a:text-is("← 去首页")');
  }

  /** Navigate to about via the in-page link. */
  async goToAbout(): Promise<{ url: string; title: string }> {
    return this.clickNav('a:text-is("去 About →")');
  }
}
