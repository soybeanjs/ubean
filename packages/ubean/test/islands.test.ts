import { describe, it, expect } from 'vitest';
import {
  createIslandsContext,
  registerIsland,
  getIslandsScript,
  generateIslandPlaceholder,
  hydrationStrategyMeta,
  renderIslandPlaceholder,
  getIslandsBootstrapScript
} from '../src/core/islands';
import type { ClientDirective } from '../src/core/islands';

describe('Islands Architecture (P6-18)', () => {
  describe('Islands Context', () => {
    it('creates islands context', () => {
      const ctx = createIslandsContext();
      expect(ctx.islands).toBeInstanceOf(Map);
      expect(ctx.counter).toBe(0);
      expect(ctx.islands.size).toBe(0);
    });

    it('registers islands with unique IDs', () => {
      const ctx = createIslandsContext();

      const id1 = registerIsland(ctx, 'Counter', 'client:load', { count: 0 });
      const id2 = registerIsland(ctx, 'Timer', 'client:idle', { interval: 1000 });

      expect(id1).toBe('island-1');
      expect(id2).toBe('island-2');
      expect(ctx.counter).toBe(2);
      expect(ctx.islands.size).toBe(2);
    });

    it('stores island metadata correctly', () => {
      const ctx = createIslandsContext();

      const id = registerIsland(ctx, 'MyComponent', 'client:visible', { msg: 'hello' }, '(max-width: 768px)');
      const island = ctx.islands.get(id);

      expect(island).toBeDefined();
      expect(island!.id).toBe(id);
      expect(island!.component).toBe('MyComponent');
      expect(island!.directive).toBe('client:visible');
      expect(island!.mediaQuery).toBe('(max-width: 768px)');
      expect(island!.props).toEqual({ msg: 'hello' });
    });

    it('serializes props and skips functions/symbols', () => {
      const ctx = createIslandsContext();
      const sym = Symbol('test');
      const fn = () => {};

      const id = registerIsland(ctx, 'Test', 'client:load', {
        str: 'hello',
        num: 42,
        bool: true,
        arr: [1, 2, 3],
        obj: { key: 'value' },
        fn,
        sym
      });

      const island = ctx.islands.get(id);
      expect(island!.props.str).toBe('hello');
      expect(island!.props.num).toBe(42);
      expect(island!.props.bool).toBe(true);
      expect(island!.props.arr).toEqual([1, 2, 3]);
      expect(island!.props.obj).toEqual({ key: 'value' });
      expect((island!.props as any).fn).toBeUndefined();
      expect((island!.props as any).sym).toBeUndefined();
    });
  });

  describe('Hydration Strategies', () => {
    it('defines all client directives', () => {
      const directives: ClientDirective[] = [
        'client:load',
        'client:idle',
        'client:visible',
        'client:media',
        'client:only'
      ];

      for (const d of directives) {
        expect(hydrationStrategyMeta[d]).toBeDefined();
        expect(hydrationStrategyMeta[d].directive).toBe(d);
      }
    });

    it('client:media requires media query', () => {
      expect(hydrationStrategyMeta['client:media'].requiresMediaQuery).toBe(true);
    });

    it('other directives do not require media query', () => {
      expect(hydrationStrategyMeta['client:load'].requiresMediaQuery).toBeUndefined();
      expect(hydrationStrategyMeta['client:idle'].requiresMediaQuery).toBeUndefined();
      expect(hydrationStrategyMeta['client:visible'].requiresMediaQuery).toBeUndefined();
      expect(hydrationStrategyMeta['client:only'].requiresMediaQuery).toBeUndefined();
    });
  });

  describe('SSR Placeholder Generation', () => {
    it('generates island placeholder HTML', () => {
      const html = generateIslandPlaceholder(
        'island-1',
        'Counter',
        'client:load',
        { count: 0 },
        '<div>SSR content</div>'
      );

      expect(html).toContain('<ubean-island');
      expect(html).toContain('data-island-id="island-1"');
      expect(html).toContain('data-component="Counter"');
      expect(html).toContain('data-directive="client:load"');
      expect(html).toContain('<div>SSR content</div>');
      expect(html).toContain('</ubean-island>');
    });

    it('escapes HTML in props and attributes', () => {
      const html = generateIslandPlaceholder(
        'island-x',
        'Comp"with<special>',
        'client:idle',
        { msg: '<script>alert("xss")</script>' },
        ''
      );

      expect(html).not.toContain('<script>alert');
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('Comp&quot;with&lt;special&gt;');
      expect(html).toContain('&quot;');
    });

    it('includes media query attribute when provided', () => {
      const html = generateIslandPlaceholder(
        'island-2',
        'MobileNav',
        'client:media',
        {},
        '<nav>Mobile</nav>',
        '(max-width: 768px)'
      );

      expect(html).toContain('data-media="(max-width: 768px)"');
    });

    it('renders island placeholder with renderIslandPlaceholder helper', () => {
      const html = renderIslandPlaceholder({
        component: 'TestComp',
        directive: 'client:visible',
        props: { id: 123 },
        children: '<span>lazy</span>'
      });

      expect(html).toContain('data-component="TestComp"');
      expect(html).toContain('data-directive="client:visible"');
      expect(html).toContain('<span>lazy</span>');
      expect(html).toContain('ubean-island');
    });
  });

  describe('Islands Script Generation', () => {
    it('returns empty string when no islands', () => {
      const script = getIslandsScript([]);
      expect(script).toBe('');
    });

    it('generates JSON islands data script', () => {
      const ctx = createIslandsContext();
      registerIsland(ctx, 'Counter', 'client:load', { count: 0 });
      registerIsland(ctx, 'Timer', 'client:idle', { interval: 1000 });

      const islands = Array.from(ctx.islands.values());
      const script = getIslandsScript(islands);

      expect(script).toContain('<script type="application/json" data-ubean-islands>');
      expect(script).toContain('"component":"Counter"');
      expect(script).toContain('"component":"Timer"');
      expect(script).toContain('"directive":"client:load"');
      expect(script).toContain('"directive":"client:idle"');
    });

    it('generates bootstrap script', () => {
      const script = getIslandsBootstrapScript();
      expect(script).toContain('<script>');
      expect(script).toContain('ubean-island');
      expect(script).toContain('client:only');
      expect(script).toContain('client:visible');
      expect(script).toContain('client:idle');
      expect(script).toContain('IntersectionObserver');
      expect(script).toContain('requestIdleCallback');
      expect(script).toContain('matchMedia');
      expect(script).toContain('</script>');
    });

    it('bootstrap script handles DOMContentLoaded', () => {
      const script = getIslandsBootstrapScript();
      expect(script).toContain('DOMContentLoaded');
      expect(script).toContain('document.readyState');
    });
  });
});
