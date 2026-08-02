import { BasePage } from './base.page';

/**
 * Page object for the view transitions test page (/view-transitions).
 *
 * Layout: .vt-info grid contains .info-card children:
 *   1. supportsViewTransitions() result
 *   2. getNavigationType() result
 *   3. Transition count
 *   4. (conditional) Last transition timestamp
 */
export class ViewTransitionsPage extends BasePage {
  constructor() {
    super('/view-transitions');
  }

  async heading(): Promise<string | null> {
    return this.text('h1');
  }

  /** Text from the "supportsViewTransitions()" info card. */
  async supportText(): Promise<string | null> {
    return this.text('.vt-info .info-card:nth-child(1) .info-value');
  }

  /** Text from the "getNavigationType()" info card. */
  async navTypeText(): Promise<string | null> {
    return this.text('.vt-info .info-card:nth-child(2) .info-value');
  }

  /** Text from the "Transition count" info card. */
  async transitionCount(): Promise<string | null> {
    return this.text('.vt-info .info-card:nth-child(3) .info-value');
  }

  async isSupported(): Promise<boolean> {
    const text = await this.supportText();
    return !!text && text.includes('Supported');
  }

  async triggerSlide(): Promise<void> {
    await this.click('button.vt-btn.primary');
    // withViewTransition is async — wait for the count to update
    await this.waitForFunction(
      "return document.querySelector('.vt-info .info-card:nth-child(3) .info-value')?.textContent !== '0'",
      10000
    ).catch(() => {});
  }

  async triggerCrossfade(): Promise<void> {
    const before = await this.transitionCount();
    await this.click('button.vt-btn.secondary');
    // Wait for the count to change from the previous value
    await this.waitForFunction(
      `return document.querySelector('.vt-info .info-card:nth-child(3) .info-value')?.textContent !== '${before}'`,
      10000
    ).catch(() => {});
  }

  /** Get the view-transition-state style object text. */
  async slideStyleText(): Promise<string | null> {
    return this.text('.code-block');
  }
}
