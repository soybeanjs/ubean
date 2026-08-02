import { BasePage } from './base.page';

/** Page object for the markdown test page (/md-test). */
export class MarkdownPage extends BasePage {
  constructor() {
    super('/md-test');
  }

  async heading(): Promise<string | null> {
    return this.text('h1');
  }

  /** Count <h2> headings rendered from markdown. */
  async h2Count(): Promise<number> {
    return this.count('h2');
  }

  /** Count code blocks rendered from markdown. */
  async codeBlockCount(): Promise<number> {
    return this.count('pre code');
  }

  /** Count list items rendered from markdown. */
  async listItemCount(): Promise<number> {
    return this.count('li');
  }

  /** The description meta from frontmatter. */
  async descriptionMeta(): Promise<string | null> {
    return this.meta('description');
  }

  /** The keywords meta from frontmatter. */
  async keywordsMeta(): Promise<string | null> {
    return this.meta('keywords');
  }
}
