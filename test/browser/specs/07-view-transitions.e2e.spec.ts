import { describe, expect, it } from 'vitest';
import { ViewTransitionsPage } from '../pages/view-transitions.page';

/**
 * Spec 07: View Transitions API
 *
 * Covers:
 * - supportsViewTransitions() feature detection
 * - getNavigationType()
 * - withViewTransition() wrapper
 * - useViewTransitionState() style helper
 * - Types API (slide transition type)
 * - Triggering transitions programmatically
 */
describe('View Transitions', () => {
  describe('Feature detection', () => {
    it('renders the view transitions test page', async () => {
      const page = await new ViewTransitionsPage().open();
      const heading = await page.heading();
      expect(heading).toContain('View Transitions');
    });

    it('detects View Transitions support (Chromium should support it)', async () => {
      const page = await new ViewTransitionsPage().open();
      const supported = await page.isSupported();
      // Chromium 111+ supports View Transitions API.
      // Our test runs in headless Chromium, so this should be supported.
      expect(supported).toBe(true);
    });

    it('displays the support text', async () => {
      const page = await new ViewTransitionsPage().open();
      const text = await page.supportText();
      expect(text).toContain('Supported');
    });

    it('displays the navigation type', async () => {
      const page = await new ViewTransitionsPage().open();
      const navType = await page.navTypeText();
      expect(navType).toBeTruthy();
    });
  });

  describe('Transition counter', () => {
    it('starts with transition count = 0', async () => {
      const page = await new ViewTransitionsPage().open();
      const count = await page.transitionCount();
      expect(count).toBe('0');
    });

    it('increments transition count after triggering a slide transition', async () => {
      const page = await new ViewTransitionsPage().open();
      await page.triggerSlide();
      // Wait a moment for the transition to complete
      const count = await page.transitionCount();
      expect(count).toBe('1');
    });

    it('increments count again after crossfade transition', async () => {
      const page = await new ViewTransitionsPage().open();
      await page.triggerSlide();
      await page.triggerCrossfade();
      const count = await page.transitionCount();
      expect(count).toBe('2');
    });
  });

  describe('useViewTransitionState() style helper', () => {
    it('renders the slide style code block', async () => {
      const page = await new ViewTransitionsPage().open();
      const styleText = await page.slideStyleText();
      expect(styleText).toBeTruthy();
      // The style object should contain view-transition-name
      expect(styleText).toContain('view-transition-name');
    });
  });
});
