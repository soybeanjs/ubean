import { hash } from 'ohash';
import type {
  FontFamilyOptions,
  FontDisplay,
  FontStyle,
  FontWeight,
  FontSubset,
  ResolvedFontFace,
  FontMetric
} from './types';

export const defaultFontWeights: number[] = [400];
export const defaultFontStyles: FontStyle[] = ['normal'];
export const defaultFontSubsets: FontSubset[] = ['latin'];
export const defaultFontDisplay: FontDisplay = 'swap';

export const fallbackFonts: Record<string, string[]> = {
  sans: [
    'system-ui',
    '-apple-system',
    'BlinkMacSystemFont',
    '"Segoe UI"',
    'Roboto',
    '"Helvetica Neue"',
    'Arial',
    'sans-serif'
  ],
  serif: ['Georgia', 'Cambria', '"Times New Roman"', 'Times', 'serif'],
  mono: ['Menlo', 'Monaco', 'Consolas', '"Liberation Mono"', '"Courier New"', 'monospace'],
  cursive: ['cursive'],
  fantasy: ['fantasy']
};

export function normalizeFontName(name: string): string {
  return name.replace(/\s+/g, '+');
}

export function weightsToString(weights: (FontWeight | number)[]): string {
  return weights
    .map(w => String(w))
    .sort((a, b) => Number(a) - Number(b))
    .join(';');
}

export function getGoogleFontsUrl(options: {
  family: string;
  weights?: (FontWeight | number)[];
  styles?: FontStyle[];
  subsets?: FontSubset[];
  display?: FontDisplay;
  text?: string;
}): string {
  const { family, weights = defaultFontWeights, styles = defaultFontStyles, display = defaultFontDisplay } = options;
  const familyName = normalizeFontName(family);

  const weightList = weights.map(w => String(w)).sort((a, b) => Number(a) - Number(b));
  const italParams: string[] = [];

  for (const style of styles) {
    const ital = style === 'italic' ? '1' : '0';
    for (const w of weightList) {
      italParams.push(`${ital},${w}`);
    }
  }

  const variants = italParams.length > 0 ? italParams.join(';') : weightList.join(';');
  let url = `https://fonts.googleapis.com/css2?family=${familyName}`;

  if (variants) {
    url += `:ital,wght@${variants}`;
  }

  const paramParts: string[] = [];
  if (options.subsets && options.subsets.length > 0) {
    paramParts.push(`subset=${options.subsets.join(',')}`);
  }
  paramParts.push(`display=${display}`);

  if (paramParts.length > 0) {
    url += `&${paramParts.join('&')}`;
  }

  return url;
}

export function getBunnyFontsUrl(options: {
  family: string;
  weights?: (FontWeight | number)[];
  styles?: FontStyle[];
  subsets?: FontSubset[];
  display?: FontDisplay;
}): string {
  const { family, weights = defaultFontWeights, styles = defaultFontStyles, display = defaultFontDisplay } = options;
  const familyName = normalizeFontName(family);

  const weightList = weights.map(w => String(w)).sort((a, b) => Number(a) - Number(b));
  const italParams: string[] = [];

  for (const style of styles) {
    const ital = style === 'italic' ? '1' : '0';
    for (const w of weightList) {
      italParams.push(`${ital},${w}`);
    }
  }

  const variants = italParams.length > 0 ? italParams.join(';') : weightList.join(';');
  let url = `https://fonts.bunny.net/css?family=${familyName.toLowerCase()}`;

  if (variants) {
    url += `:ital,wght@${variants}`;
  }

  const params = new URLSearchParams();
  if (options.subsets && options.subsets.length > 0) {
    params.set('subset', options.subsets.join(','));
  }
  params.set('display', display);

  const paramStr = params.toString();
  if (paramStr) {
    url += `&${paramStr}`;
  }

  return url;
}

export function getFontshareUrl(family: string, _format: 'css' | 'json' = 'css'): string {
  const base = 'https://api.fontshare.com/v2/css';
  const familySlug = family.toLowerCase().replace(/\s+/g, '-');
  return `${base}?f[]=${familySlug}@400,500,600,700&display=swap`;
}

export function generateFontFace(face: ResolvedFontFace): string {
  const props: string[] = [];

  props.push(`font-family: '${face.fontFamily}'`);
  props.push(`src: ${face.src}`);

  if (face.weight) props.push(`font-weight: ${face.weight}`);
  if (face.style) props.push(`font-style: ${face.style}`);
  if (face.display) props.push(`font-display: ${face.display}`);
  if (face.unicodeRange) props.push(`unicode-range: ${face.unicodeRange}`);
  if (face.fontStretch) props.push(`font-stretch: ${face.fontStretch}`);
  if (face.ascentOverride) props.push(`ascent-override: ${face.ascentOverride}`);
  if (face.descentOverride) props.push(`descent-override: ${face.descentOverride}`);
  if (face.lineGapOverride) props.push(`line-gap-override: ${face.lineGapOverride}`);
  if (face.sizeAdjust) props.push(`size-adjust: ${face.sizeAdjust}`);

  return `@font-face {\n  ${props.join(';\n  ')};\n}`;
}

export function generateFontFallbackCSS(
  familyName: string,
  metric: FontMetric,
  fallbackName: string,
  isItalic: boolean = false
): string {
  const ascentOverride = `${(metric.ascent / metric.unitsPerEm) * 100}%`;
  const descentOverride = `${(Math.abs(metric.descent) / metric.unitsPerEm) * 100}%`;
  const lineGapOverride = `${(metric.lineGap / metric.unitsPerEm) * 100}%`;
  const sizeAdjust = '100%';

  return `@font-face {
  font-family: '${familyName} fallback';
  src: local('${fallbackName}');
  ascent-override: ${ascentOverride};
  descent-override: ${descentOverride};
  line-gap-override: ${lineGapOverride};
  size-adjust: ${sizeAdjust};
  font-style: ${isItalic ? 'italic' : 'normal'};
}`;
}

export function generatePreloadLink(url: string, type: string = 'font', crossorigin: boolean = true): string {
  const attrs = ['rel="preload"', `href="${url}"`, 'as="font"', `type="${type}"`];
  if (crossorigin) attrs.push('crossorigin');
  return `<link ${attrs.join(' ')}>`;
}

export function generatePreconnectLink(href: string, crossorigin: boolean = true): string {
  const attrs = ['rel="preconnect"', `href="${href}"`];
  if (crossorigin) attrs.push('crossorigin');
  return `<link ${attrs.join(' ')}>`;
}

export function generateFontCSSVariable(name: string, family: string): string {
  const varName = name.startsWith('--') ? name : `--font-${name.toLowerCase().replace(/\s+/g, '-')}`;
  return `${varName}: '${family}', ${fallbackFonts.sans.join(', ')};`;
}

export function parseFontFamilyCSS(css: string): ResolvedFontFace[] {
  const faces: ResolvedFontFace[] = [];
  const regex = /@font-face\s*\{([^}]+)\}/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(css)) !== null) {
    const body = match[1];
    const face: ResolvedFontFace = { fontFamily: '', src: '' };

    const familyMatch = body.match(/font-family:\s*['"]?([^'";]+)['"]?/);
    if (familyMatch) face.fontFamily = familyMatch[1].trim();

    const srcMatch = body.match(/src:\s*([^;]+)/);
    if (srcMatch) face.src = srcMatch[1].trim();

    const weightMatch = body.match(/font-weight:\s*([^;]+)/);
    if (weightMatch) face.weight = weightMatch[1].trim();

    const styleMatch = body.match(/font-style:\s*([^;]+)/);
    if (styleMatch) face.style = styleMatch[1].trim() as FontStyle;

    const displayMatch = body.match(/font-display:\s*([^;]+)/);
    if (displayMatch) face.display = displayMatch[1].trim() as FontDisplay;

    const unicodeMatch = body.match(/unicode-range:\s*([^;]+)/);
    if (unicodeMatch) face.unicodeRange = unicodeMatch[1].trim();

    faces.push(face);
  }

  return faces;
}

export function extractFontUrlsFromCSS(css: string): string[] {
  const urls: string[] = [];
  const regex = /url\(['"]?([^'")]+\.(?:woff2?|ttf|otf|eot))['"]?\)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(css)) !== null) {
    urls.push(match[1]);
  }

  return [...new Set(urls)];
}

export function createFontHash(config: FontFamilyOptions): string {
  return hash({
    name: config.name,
    weights: config.weights,
    styles: config.styles,
    subsets: config.subsets,
    provider: config.provider
  }).slice(0, 10);
}

export function normalizeFontFamily(
  family: FontFamilyOptions,
  defaults: { weights: number[]; styles: FontStyle[]; subsets: FontSubset[]; display: FontDisplay }
): Required<FontFamilyOptions> {
  return {
    name: family.name,
    provider: family.provider || 'google',
    weights: family.weights || defaults.weights,
    styles: family.styles || defaults.styles,
    subsets: family.subsets || defaults.subsets,
    display: family.display || defaults.display,
    preload: family.preload ?? true,
    fallback: family.fallback || [],
    unicodeRange: family.unicodeRange,
    selector: family.selector,
    src: family.src,
    cssVariable: family.cssVariable ?? false
  };
}

export const googleFontMetrics: Record<string, FontMetric> = {
  Inter: {
    familyName: 'Inter',
    category: 'sans-serif',
    capHeight: 2048,
    ascent: 2728,
    descent: -680,
    lineGap: 0,
    unitsPerEm: 2816,
    xHeight: 1536,
    xWidthAvg: 1352,
    subsets: {
      latin: { xWidthAvg: 1352 }
    }
  },
  Roboto: {
    familyName: 'Roboto',
    category: 'sans-serif',
    capHeight: 1456,
    ascent: 1900,
    descent: -500,
    lineGap: 0,
    unitsPerEm: 2048,
    xHeight: 1082,
    xWidthAvg: 1061,
    subsets: {
      latin: { xWidthAvg: 1061 }
    }
  }
};
