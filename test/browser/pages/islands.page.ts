import { BasePage } from './base.page';

/**
 * Page object for the islands test page (/islands-test).
 *
 * Layout: .islands-grid contains 5 .island-section children, each wrapping an
 * <ubean-island> custom element. With v-client.* directives, the SSR output
 * has EMPTY <ubean-island> elements — content is only rendered client-side
 * after hydration.
 *
 * IMPORTANT: The `virtual:ubean-islands-registry` module is lazily populated
 * by the Vite plugin when islands-test.vue is first transformed. On the very
 * first page load, the registry is still empty, so islands won't hydrate.
 * We do a warm-up load first, then reload to get the populated registry.
 *
 * Sections:
 *   1. client:load   — IslandCounter (button + counter-value)
 *   2. client:idle   — IslandClock
 *   3. client:visible — IslandVisibility
 *   4. client:media  — IslandMedia
 *   5. client:only   — IslandOnly (empty in SSR, hydrated client-side only)
 */
export class IslandsPage extends BasePage {
  constructor() {
    super('/islands-test');
  }

  /**
   * Open the islands page with a warm-up load.
   * The first load triggers Vite to process islands-test.vue and populate
   * the islands registry. The second load gets the populated registry,
   * enabling client-side hydration.
   */
  async open(): Promise<this> {
    // Warm-up: trigger Vite to process the file and populate the registry
    await super.open();
    // Real load: registry is now populated, islands will hydrate
    await this.goto();
    return this;
  }

  async heading(): Promise<string | null> {
    return this.text('h1');
  }

  async islandSectionCount(): Promise<number> {
    return this.count('.island-section');
  }

  /** Text of the h2 for a given directive (e.g. "client:load"). */
  async directiveHeading(directive: string): Promise<string | null> {
    return this.text(`.island-section h2:text-is("${directive}")`);
  }

  /** Count <ubean-island> custom elements on the page (SSR output). */
  async islandElementCount(): Promise<number> {
    return this.count('ubean-island');
  }

  /** Count <ubean-island> elements with a specific directive (via data-directive attr). */
  async islandCountByDirective(directive: string): Promise<number> {
    return this.count(`ubean-island[data-directive="client:${directive}"]`);
  }

  /** Check if an island with a given directive has been hydrated (data-hydrated attribute). */
  async isIslandHydrated(directive: string): Promise<boolean> {
    const count = await this.count(`ubean-island[data-directive="client:${directive}"][data-hydrated="true"]`);
    return count > 0;
  }

  /** Wait for an island with a given directive to be hydrated. */
  async waitForIslandHydration(directive: string, timeout: number = 15000): Promise<void> {
    await this.waitForFunction(
      `return !!document.querySelector('ubean-island[data-directive="client:${directive}"][data-hydrated="true"]')`,
      timeout
    ).catch(() => {});
  }

  /** Click the load-island counter button (IslandCounter inside section 1). */
  async clickLoadCounter(): Promise<void> {
    // Wait for island hydration to render the counter button
    await this.waitForIslandHydration('load');
    await this.waitForFunction(
      'return !!document.querySelector(\'ubean-island[data-directive="client:load"] .island-counter button\')',
      15000
    );
    await this.click('ubean-island[data-directive="client:load"] .island-counter button');
  }

  /** Get the counter value text from the IslandCounter (section 1). */
  async loadCounterText(): Promise<string | null> {
    // Wait for the island content to be rendered (client-side hydration)
    await this.waitForIslandHydration('load');
    await this.waitForFunction(
      'return !!document.querySelector(\'ubean-island[data-directive="client:load"] .counter-value\')',
      15000
    ).catch(() => {});
    return this.text('ubean-island[data-directive="client:load"] .counter-value');
  }

  /** Get the clock time text from the IslandClock (section 2). */
  async clockTimeText(): Promise<string | null> {
    await this.waitForIslandHydration('idle');
    await this.waitForFunction(
      'return !!document.querySelector(\'ubean-island[data-directive="client:idle"] .clock-time\')',
      15000
    ).catch(() => {});
    return this.text('ubean-island[data-directive="client:idle"] .clock-time');
  }
}
