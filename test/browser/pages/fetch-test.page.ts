import { BasePage } from './base.page';

/**
 * Page object for the typed-client demo page (/fetch-test).
 *
 * Layout: 5 <section> elements inside .fetch-test div, each with a button
 * and a <pre> result block.
 */
export class FetchTestPage extends BasePage {
  constructor() {
    super('/fetch-test');
  }

  async heading(): Promise<string | null> {
    return this.text('h1');
  }

  /** Click "GET /api/hello" button in section 1. */
  async fetchHello(): Promise<void> {
    await this.click('.fetch-test section:nth-of-type(1) button');
  }

  async helloResult(): Promise<string | null> {
    await this.waitFor('.fetch-test section:nth-of-type(1) pre', 10000).catch(() => {});
    const count = await this.count('.fetch-test section:nth-of-type(1) pre');
    if (count === 0) return null;
    return this.text('.fetch-test section:nth-of-type(1) pre');
  }

  /** Fill the user ID input in section 2. */
  async fillUserId(id: string): Promise<void> {
    await this.fill('.fetch-test section:nth-of-type(2) input[type="number"]', id);
  }

  async fetchUser(): Promise<void> {
    await this.click('.fetch-test section:nth-of-type(2) button');
  }

  async userResult(): Promise<string | null> {
    await this.waitFor('.fetch-test section:nth-of-type(2) pre', 10000).catch(() => {});
    const count = await this.count('.fetch-test section:nth-of-type(2) pre');
    if (count === 0) return null;
    return this.text('.fetch-test section:nth-of-type(2) pre');
  }

  async fetchText(): Promise<void> {
    await this.click('.fetch-test section:nth-of-type(3) button');
  }

  async textResult(): Promise<string | null> {
    // The typed client demo uses '/api/text' which becomes '/api/api/text' (double prefix).
    // The fetch may fail — wait for either the result <pre> or the error <p.error>.
    await this.waitForFunction(
      "return !!document.querySelector('.fetch-test section:nth-of-type(3) pre') || !!document.querySelector('.fetch-test section:nth-of-type(3) .error')",
      10000
    ).catch(() => {});
    // Check if pre exists before trying to get text (avoids timeout on missing element)
    const count = await this.count('.fetch-test section:nth-of-type(3) pre');
    if (count === 0) return null;
    return this.text('.fetch-test section:nth-of-type(3) pre');
  }

  async textError(): Promise<string | null> {
    // Check if error exists before trying to get text
    const count = await this.count('.fetch-test section:nth-of-type(3) .error');
    if (count === 0) return null;
    return this.text('.fetch-test section:nth-of-type(3) .error');
  }

  async downloadFile(): Promise<void> {
    await this.click('.fetch-test section:nth-of-type(4) button');
  }

  async downloadInfo(): Promise<string | null> {
    // Same double-prefix issue — wait for either .info or .error
    await this.waitForFunction(
      "return !!document.querySelector('.fetch-test section:nth-of-type(4) .info') || !!document.querySelector('.fetch-test section:nth-of-type(4) .error')",
      10000
    ).catch(() => {});
    // Check if info exists before trying to get text
    const count = await this.count('.fetch-test section:nth-of-type(4) .info');
    if (count === 0) return null;
    return this.text('.fetch-test section:nth-of-type(4) .info');
  }

  async downloadError(): Promise<string | null> {
    // Check if error exists before trying to get text
    const count = await this.count('.fetch-test section:nth-of-type(4) .error');
    if (count === 0) return null;
    return this.text('.fetch-test section:nth-of-type(4) .error');
  }

  async fetchFlat(): Promise<void> {
    await this.click('.fetch-test section:nth-of-type(5) button');
  }

  async flatResult(): Promise<string | null> {
    await this.waitFor('.fetch-test section:nth-of-type(5) pre', 10000).catch(() => {});
    const count = await this.count('.fetch-test section:nth-of-type(5) pre');
    if (count === 0) return null;
    return this.text('.fetch-test section:nth-of-type(5) pre');
  }
}
