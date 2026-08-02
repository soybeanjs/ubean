import { describe, expect, it } from 'vitest';
import { IslandsPage } from '../pages/islands.page';

/**
 * Spec 06: Islands architecture
 *
 * Covers:
 * - v-client directive (5 hydration strategies)
 * - <ubean-island> custom element in SSR output
 * - data-hydrating attribute on island elements
 * - client:load (immediate hydration)
 * - client:idle (requestIdleCallback hydration)
 * - client:visible (IntersectionObserver hydration)
 * - client:media (media query hydration)
 * - client:only (client-only, no SSR)
 * - Interactive island (IslandCounter button click after hydration)
 */
describe('Islands Architecture', () => {
  describe('SSR output', () => {
    it('renders the islands test page heading', async () => {
      const page = await new IslandsPage().open();
      const heading = await page.heading();
      expect(heading).toContain('Islands');
    });

    it('renders 5 island sections', async () => {
      const page = await new IslandsPage().open();
      const count = await page.islandSectionCount();
      expect(count).toBe(5);
    });

    it('renders all 5 directive headings', async () => {
      const page = await new IslandsPage().open();
      expect(await page.directiveHeading('client:load')).toBeTruthy();
      expect(await page.directiveHeading('client:idle')).toBeTruthy();
      expect(await page.directiveHeading('client:visible')).toBeTruthy();
      expect(await page.directiveHeading('client:media')).toBeTruthy();
      expect(await page.directiveHeading('client:only')).toBeTruthy();
    });

    it('emits <ubean-island> custom elements in SSR', async () => {
      const page = await new IslandsPage().open();
      const count = await page.islandElementCount();
      // All 5 islands emit <ubean-island> in SSR (client:only emits an empty one)
      expect(count).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Hydration directives (data-hydrating attribute)', () => {
    it('marks client:load island with data-hydrating="load"', async () => {
      const page = await new IslandsPage().open();
      const count = await page.islandCountByDirective('load');
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('marks client:idle island with data-hydrating="idle"', async () => {
      const page = await new IslandsPage().open();
      const count = await page.islandCountByDirective('idle');
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('marks client:visible island with data-hydrating="visible"', async () => {
      const page = await new IslandsPage().open();
      const count = await page.islandCountByDirective('visible');
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('marks client:media island with data-hydrating="media"', async () => {
      const page = await new IslandsPage().open();
      const count = await page.islandCountByDirective('media');
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('marks client:only island with data-hydrating="only"', async () => {
      const page = await new IslandsPage().open();
      const count = await page.islandCountByDirective('only');
      expect(count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('client:load hydration (IslandCounter)', () => {
    it('renders empty SSR content for client:load island (content appears after hydration)', async () => {
      const page = await new IslandsPage().open();
      // With v-client.* directives, SSR output has empty <ubean-island> elements.
      // Content only appears after client-side hydration.
      const counter = await page.loadCounterText();
      // After hydration, the counter should show initial value "0"
      expect(counter).toBe('0');
    });

    it('increments counter after clicking the hydrated button', async () => {
      const page = await new IslandsPage().open();
      // Wait for hydration (client:load hydrates immediately)
      await page.clickLoadCounter();
      const counter = await page.loadCounterText();
      expect(counter).toBe('1');
    });

    it('increments counter multiple times', async () => {
      const page = await new IslandsPage().open();
      await page.clickLoadCounter();
      await page.clickLoadCounter();
      await page.clickLoadCounter();
      const counter = await page.loadCounterText();
      expect(counter).toBe('3');
    });
  });

  describe('client:idle hydration (IslandClock)', () => {
    it('renders clock content after client:idle hydration', async () => {
      const page = await new IslandsPage().open();
      const time = await page.clockTimeText();
      // After hydration, the clock should show a time string (not placeholder)
      expect(time).toBeTruthy();
    });
  });
});
