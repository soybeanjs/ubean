export { ubeanFontsPlugin } from './vite';
export type { UbeanFontsOptions } from './vite';

export {
  configureFontsRuntime,
  getFontsConfig,
  defineFontFamily,
  defineLocalFont,
  defineGoogleFont,
  generateFontLinks,
  generateFontCSS,
  getFontFamilies,
  getFontHash
} from './runtime';

export {
  getGoogleFontsUrl,
  getBunnyFontsUrl,
  getFontshareUrl,
  generateFontFace,
  generatePreloadLink,
  generatePreconnectLink,
  generateFontCSSVariable,
  generateFontFallbackCSS,
  parseFontFamilyCSS,
  extractFontUrlsFromCSS,
  normalizeFontFamily,
  normalizeFontName,
  createFontHash,
  fallbackFonts,
  defaultFontWeights,
  defaultFontStyles,
  defaultFontSubsets,
  defaultFontDisplay,
  googleFontMetrics
} from './core';

export type {
  FontFamilyOptions,
  FontProvider,
  FontDisplay,
  FontStyle,
  FontWeight,
  FontSubset,
  ResolvedFontFace,
  FontMetric,
  FontFaceDeclaration,
  GoogleFontsOptions,
  LocalFontOptions,
  FontModuleOptions
} from './types';
