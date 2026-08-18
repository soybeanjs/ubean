import {
  normalizeFontFamily,
  getGoogleFontsUrl,
  getBunnyFontsUrl,
  getFontshareUrl,
  generateFontFace,
  generatePreloadLink,
  generatePreconnectLink,
  generateFontCSSVariable,
  defaultFontWeights,
  defaultFontStyles,
  defaultFontSubsets,
  defaultFontDisplay,
  fallbackFonts,
  extractFontUrlsFromCSS,
  parseFontFamilyCSS,
  createFontHash
} from './core';
import type {
  FontFamilyOptions,
  FontModuleOptions,
  GoogleFontsOptions,
  LocalFontOptions,
  ResolvedFontFace
} from './types';

let fontsConfig: FontModuleOptions;

export function configureFontsRuntime(options: Partial<FontModuleOptions> = {}) {
  fontsConfig = {
    families: options.families || [],
    google: options.google || {},
    local: options.local || {},
    custom: options.custom || {},
    defaults: {
      weights: options.defaults?.weights || defaultFontWeights,
      styles: options.defaults?.styles || defaultFontStyles,
      subsets: options.defaults?.subsets || defaultFontSubsets,
      display: options.defaults?.display || defaultFontDisplay,
      preload: options.defaults?.preload ?? true,
      preconnect: options.defaults?.preconnect ?? true,
      download: options.defaults?.download ?? false,
      fallback: options.defaults?.fallback || fallbackFonts
    },
    assets: {
      baseURL: options.assets?.baseURL || '/_fonts',
      prefix: options.assets?.prefix || '_fonts'
    },
    metrics: options.metrics ?? true,
    experimental: {
      inline: options.experimental?.inline ?? false
    }
  };
  return fontsConfig;
}

export function getFontsConfig(): FontModuleOptions {
  if (!fontsConfig) {
    configureFontsRuntime();
  }
  return fontsConfig;
}

export function defineFontFamily(options: FontFamilyOptions): FontFamilyOptions {
  if (!fontsConfig) configureFontsRuntime();
  const normalized = normalizeFontFamily(options, fontsConfig.defaults);
  fontsConfig.families.push(normalized);
  return normalized;
}

export function defineLocalFont(options: LocalFontOptions): LocalFontOptions {
  if (!fontsConfig) configureFontsRuntime();
  fontsConfig.local![options.name] = options;
  const family: FontFamilyOptions = {
    name: options.name,
    provider: 'local',
    src: options.src,
    weights: options.weights?.length ? options.weights : [400],
    styles: options.styles?.length ? options.styles : ['normal'],
    preload: options.preload ?? true
  };
  fontsConfig.families.push(family);
  return options;
}

export function defineGoogleFont(options: GoogleFontsOptions): GoogleFontsOptions {
  if (!fontsConfig) configureFontsRuntime();
  fontsConfig.google = { ...fontsConfig.google, ...options };
  return options;
}

export function generateFontLinks(): { preconnect: string[]; styles: string[]; preload: string[] } {
  const config = getFontsConfig();
  const preconnect: string[] = [];
  const styles: string[] = [];
  const preload: string[] = [];

  if (
    config.defaults.preconnect &&
    (config.families.some(f => f.provider === 'google') || Object.keys(config.google?.families || {}).length > 0)
  ) {
    preconnect.push(generatePreconnectLink('https://fonts.googleapis.com'));
    preconnect.push(generatePreconnectLink('https://fonts.gstatic.com'));
  }

  for (const family of config.families) {
    const normalized = normalizeFontFamily(family, config.defaults);
    let url = '';

    switch (normalized.provider) {
      case 'google':
        url = getGoogleFontsUrl({
          family: normalized.name,
          weights: normalized.weights,
          styles: normalized.styles,
          subsets: normalized.subsets,
          display: normalized.display
        });
        if (config.defaults.preconnect && !preconnect.some(l => l.includes('fonts.googleapis'))) {
          preconnect.push(generatePreconnectLink('https://fonts.googleapis.com'));
          preconnect.push(generatePreconnectLink('https://fonts.gstatic.com'));
        }
        styles.push(`<link rel="stylesheet" href="${url}">`);
        break;
      case 'bunny':
        url = getBunnyFontsUrl({
          family: normalized.name,
          weights: normalized.weights,
          styles: normalized.styles,
          subsets: normalized.subsets,
          display: normalized.display
        });
        if (config.defaults.preconnect) {
          preconnect.push(generatePreconnectLink('https://fonts.bunny.net'));
        }
        styles.push(`<link rel="stylesheet" href="${url}">`);
        break;
      case 'local':
        if (normalized.src) {
          const srcs = Array.isArray(normalized.src) ? normalized.src : [normalized.src];
          for (const src of srcs) {
            const face: ResolvedFontFace = {
              fontFamily: normalized.name,
              src: `url('${src}') format('woff2')`,
              weight: normalized.weights[0],
              style: normalized.styles[0],
              display: normalized.display
            };
            styles.push(`<style>${generateFontFace(face)}</style>`);
            if (normalized.preload) {
              preload.push(generatePreloadLink(src));
            }
          }
        }
        break;
    }
  }

  return { preconnect, styles, preload };
}

export function generateFontCSS(): string {
  const config = getFontsConfig();
  const css: string[] = [];

  const variables: string[] = [];
  for (const family of config.families) {
    if (family.cssVariable) {
      const varName = typeof family.cssVariable === 'string' ? family.cssVariable : family.name;
      variables.push(generateFontCSSVariable(varName, family.name));
    }
  }
  if (variables.length > 0) {
    css.push(`:root { ${variables.join(' ')} }`);
  }

  return css.join('\n');
}

export function getFontFamilies() {
  const config = getFontsConfig();
  return config.families.map(f => normalizeFontFamily(f, config.defaults));
}

export function getFontHash(family: FontFamilyOptions): string {
  return createFontHash(family);
}

export {
  getGoogleFontsUrl,
  getBunnyFontsUrl,
  getFontshareUrl,
  generateFontFace,
  generatePreloadLink,
  generatePreconnectLink,
  generateFontCSSVariable,
  parseFontFamilyCSS,
  extractFontUrlsFromCSS,
  normalizeFontFamily,
  fallbackFonts,
  defaultFontWeights,
  defaultFontStyles,
  defaultFontSubsets,
  defaultFontDisplay
};

export type {
  FontFamilyOptions,
  FontModuleOptions,
  FontProvider,
  FontDisplay,
  FontStyle,
  FontWeight,
  FontSubset,
  ResolvedFontFace,
  FontMetric,
  GoogleFontsOptions,
  LocalFontOptions
} from './types';
