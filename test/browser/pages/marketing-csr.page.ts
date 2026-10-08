import { BasePage } from './base.page';

/**
 * Page object for `/marketing` — `definePage({ ssr: false })`，纯 CSR。
 *
 * 与 `marketing.page.ts` **不是**同一个页面：后者是路由组演示 `/marketing-page`。
 */
export class MarketingCsrPage extends BasePage {
  constructor() {
    super('/marketing');
  }

  async heading(): Promise<string | null> {
    return this.text('h1');
  }
}
