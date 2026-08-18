import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeFontName,
  weightsToString,
  getGoogleFontsUrl,
  getBunnyFontsUrl,
  generateFontFace,
  generatePreloadLink,
  generatePreconnectLink,
  generateFontCSSVariable,
  parseFontFamilyCSS,
  extractFontUrlsFromCSS,
  createFontHash,
  normalizeFontFamily,
  fallbackFonts,
  defaultFontWeights,
  defaultFontStyles,
  defaultFontDisplay,
  generateFontFallbackCSS
} from '../src/fonts/core';
import {
  configureFontsRuntime,
  defineFontFamily,
  defineLocalFont,
  generateFontLinks,
  getFontFamilies
} from '../src/fonts/runtime';

describe('ubean-fonts core', () => {
  describe('normalizeFontName', () => {
    it('replaces spaces with +', () => {
      expect(normalizeFontName('Open Sans')).toBe('Open+Sans');
      expect(normalizeFontName('Roboto')).toBe('Roboto');
      expect(normalizeFontName('Noto Sans JP')).toBe('Noto+Sans+JP');
    });
  });

  describe('weightsToString', () => {
    it('formats weights sorted', () => {
      expect(weightsToString([700, 400, 300])).toBe('300;400;700');
    });
  });

  describe('getGoogleFontsUrl', () => {
    it('generates basic Google Fonts URL', () => {
      const url = getGoogleFontsUrl({ family: 'Roboto' });
      expect(url).toContain('fonts.googleapis.com');
      expect(url).toContain('Roboto');
      expect(url).toContain('display=swap');
    });

    it('includes weights and italics', () => {
      const url = getGoogleFontsUrl({
        family: 'Inter',
        weights: [400, 600, 700],
        styles: ['normal', 'italic']
      });
      expect(url).toContain('wght@');
      expect(url).toContain('0,400');
      expect(url).toContain('1,400');
      expect(url).toContain('0,700');
      expect(url).toContain('1,700');
    });

    it('includes subsets', () => {
      const url = getGoogleFontsUrl({
        family: 'Roboto',
        subsets: ['latin', 'cyrillic']
      });
      expect(url).toContain('subset=latin,cyrillic');
    });
  });

  describe('getBunnyFontsUrl', () => {
    it('generates Bunny Fonts URL', () => {
      const url = getBunnyFontsUrl({ family: 'Inter' });
      expect(url).toContain('fonts.bunny.net');
      expect(url).toContain('inter');
    });
  });

  describe('generateFontFace', () => {
    it('generates @font-face CSS', () => {
      const css = generateFontFace({
        fontFamily: 'MyFont',
        src: "url('/fonts/myfont.woff2') format('woff2')",
        weight: 400,
        style: 'normal',
        display: 'swap'
      });
      expect(css).toContain('@font-face');
      expect(css).toContain("font-family: 'MyFont'");
      expect(css).toContain("url('/fonts/myfont.woff2')");
      expect(css).toContain('font-weight: 400');
      expect(css).toContain('font-style: normal');
      expect(css).toContain('font-display: swap');
    });
  });

  describe('link generation', () => {
    it('generatePreloadLink creates preload link', () => {
      const link = generatePreloadLink('/fonts/font.woff2', 'font/woff2');
      expect(link).toContain('rel="preload"');
      expect(link).toContain('as="font"');
      expect(link).toContain('crossorigin');
      expect(link).toContain('/fonts/font.woff2');
    });

    it('generatePreconnectLink creates preconnect link', () => {
      const link = generatePreconnectLink('https://fonts.googleapis.com');
      expect(link).toContain('rel="preconnect"');
      expect(link).toContain('https://fonts.googleapis.com');
    });
  });

  describe('generateFontCSSVariable', () => {
    it('generates CSS variable', () => {
      const css = generateFontCSSVariable('sans', 'Inter');
      expect(css).toContain('--font-sans');
      expect(css).toContain("'Inter'");
    });
  });

  describe('parseFontFamilyCSS', () => {
    it('parses @font-face from CSS', () => {
      const css = `
@font-face {
  font-family: 'MyFont';
  src: url('/font.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}`;
      const faces = parseFontFamilyCSS(css);
      expect(faces.length).toBe(1);
      expect(faces[0].fontFamily).toBe('MyFont');
      expect(faces[0].weight).toBe('400');
    });
  });

  describe('extractFontUrlsFromCSS', () => {
    it('extracts font URLs', () => {
      const css = `
@font-face { src: url('/fonts/a.woff2') format('woff2'); }
@font-face { src: url('/fonts/b.woff2') format('woff2'); }`;
      const urls = extractFontUrlsFromCSS(css);
      expect(urls).toContain('/fonts/a.woff2');
      expect(urls).toContain('/fonts/b.woff2');
      expect(urls.length).toBe(2);
    });
  });

  describe('createFontHash', () => {
    it('creates consistent hash', () => {
      const h1 = createFontHash({ name: 'Inter', weights: [400] });
      const h2 = createFontHash({ name: 'Inter', weights: [400] });
      expect(h1).toBe(h2);
      expect(h1.length).toBe(10);
    });
  });

  describe('normalizeFontFamily', () => {
    it('fills defaults', () => {
      const family = normalizeFontFamily(
        { name: 'Roboto' },
        {
          weights: [400, 700],
          styles: ['normal', 'italic'],
          subsets: ['latin'],
          display: 'swap',
          preload: true,
          preconnect: true,
          download: false,
          fallback: {}
        }
      );
      expect(family.name).toBe('Roboto');
      expect(family.weights).toEqual([400, 700]);
      expect(family.styles).toContain('italic');
      expect(family.display).toBe('swap');
    });
  });

  describe('defaults', () => {
    it('has sensible defaults', () => {
      expect(defaultFontWeights).toEqual([400]);
      expect(defaultFontDisplay).toBe('swap');
      expect(defaultFontStyles).toContain('normal');
      expect(fallbackFonts.sans).toBeDefined();
      expect(fallbackFonts.sans.length).toBeGreaterThan(0);
      expect(fallbackFonts.serif).toBeDefined();
      expect(fallbackFonts.mono).toBeDefined();
    });
  });

  describe('generateFontFallbackCSS', () => {
    it('generates fallback metric override', () => {
      const metric = {
        familyName: 'Inter',
        category: 'sans-serif',
        capHeight: 2048,
        ascent: 2728,
        descent: -680,
        lineGap: 0,
        unitsPerEm: 2816,
        xHeight: 1536,
        xWidthAvg: 1352,
        subsets: {}
      };
      const css = generateFontFallbackCSS('Inter', metric, 'Arial');
      expect(css).toContain('@font-face');
      expect(css).toContain("'Inter fallback'");
      expect(css).toContain('ascent-override');
      expect(css).toContain('descent-override');
    });
  });
});

describe('ubean-fonts runtime', () => {
  beforeEach(() => {
    configureFontsRuntime();
  });

  it('configureFontsRuntime sets up config', () => {
    configureFontsRuntime({
      families: [{ name: 'Roboto' }],
      defaults: { weights: [400, 700] }
    });
    const families = getFontFamilies();
    expect(families.length).toBe(1);
    expect(families[0].name).toBe('Roboto');
  });

  it('defineFontFamily adds a family', () => {
    configureFontsRuntime();
    defineFontFamily({ name: 'Inter', weights: [400, 600, 700] });
    const families = getFontFamilies();
    expect(families.length).toBe(1);
    expect(families[0].weights).toContain(600);
  });

  it('generateFontLinks produces links for Google fonts', () => {
    configureFontsRuntime();
    defineFontFamily({ name: 'Roboto', provider: 'google', weights: [400] });
    const { preconnect, styles } = generateFontLinks();
    expect(preconnect.length).toBeGreaterThan(0);
    expect(styles.length).toBeGreaterThan(0);
    expect(styles[0]).toContain('fonts.googleapis.com');
  });

  it('generateFontLinks handles Bunny provider', () => {
    configureFontsRuntime();
    defineFontFamily({ name: 'Inter', provider: 'bunny', weights: [400] });
    const { styles } = generateFontLinks();
    expect(styles[0]).toContain('fonts.bunny.net');
  });

  it('defineLocalFont registers local fonts', () => {
    configureFontsRuntime();
    defineLocalFont({
      name: 'MyFont',
      src: '/fonts/myfont.woff2',
      weight: 400
    });
    const { styles } = generateFontLinks();
    expect(styles.some(s => s.includes('@font-face'))).toBe(true);
  });
});
