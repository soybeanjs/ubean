import { BasePage } from './base.page';

/**
 * Page object for `/ssr-data-only` — `definePage({ ssr: 'data-only' })`。
 *
 * 契约：SSR 期跑 loader（数据脱水进 `__UBEAN_PAGE_DATA__.props`），但 HTML 是空 CSR
 * shell（`<div id="app" data-ubean-ssr="false"></div>`），由客户端接管渲染。
 */
export class SsrDataOnlyPage extends BasePage {
  constructor() {
    super('/ssr-data-only');
  }

  async heading(): Promise<string | null> {
    return this.text('h1');
  }
}
