import { BasePage } from './base.page';

/**
 * Page object for the i18n test page (/i18n).
 *
 * Layout (sections in order):
 *   1. Locale Info        — grid grid-cols-2 with label/value pairs
 *   2. Locale Switcher    — buttons + path previews
 *   3. Translations (t)   — space-y-2 with key/translation rows
 *   4. Interpolation
 *   5. Pluralization
 *   6. Linked Messages
 *   7. Intl Formatting
 *   8. Navigation
 */
export class I18nPage extends BasePage {
  constructor() {
    super('/i18n');
  }

  async heading(): Promise<string | null> {
    return this.text('h1');
  }

  /** The current locale value from the Locale Info grid (2nd cell). */
  async currentLocale(): Promise<string | null> {
    return this.text('.grid.grid-cols-2 > div:nth-child(2)');
  }

  /** The fallback locale value from the Locale Info grid (4th cell). */
  async fallbackLocale(): Promise<string | null> {
    return this.text('.grid.grid-cols-2 > div:nth-child(4)');
  }

  /** Click the locale switcher button with the given locale label. */
  async switchLocale(locale: string): Promise<void> {
    await this.click(`section:nth-of-type(2) button:text-is("${locale}")`);
  }

  /** Full text of the common.hello translation row (includes label). */
  async helloTranslationRow(): Promise<string | null> {
    return this.text('section:nth-of-type(3) .space-y-2 > div:nth-child(1)');
  }

  /** The switchPath('zh') preview <code> text. */
  async switchPathPreview(): Promise<string | null> {
    // The Locale Switcher section has: h2, div(buttons), p(switchPath), p(localePath)
    // p:nth-of-type(1) = first <p> = switchPath preview
    return this.text('section:nth-of-type(2) p:nth-of-type(1) code');
  }

  /** The localePath('/about') preview <code> text. */
  async localePathPreview(): Promise<string | null> {
    return this.text('section:nth-of-type(2) p:nth-of-type(2) code');
  }

  /** Count available locale buttons. */
  async localeButtonCount(): Promise<number> {
    return this.count('section:nth-of-type(2) button');
  }

  /**
   * Get the active locale by reading the current locale display.
   * The i18n page template uses `locale.value === loc` for the active class,
   * but in Vue templates `locale` is auto-unwrapped, so `locale.value` is
   * undefined and the active class is never applied. Instead, we read the
   * current locale from the Locale Info section.
   */
  async activeLocaleButton(): Promise<string | null> {
    return this.currentLocale();
  }
}
