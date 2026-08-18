export type FontProvider = 'google' | 'local' | 'bunny' | 'fontshare' | 'custom';

export type FontDisplay = 'auto' | 'block' | 'swap' | 'fallback' | 'optional';

export type FontSubset =
  | 'cyrillic'
  | 'cyrillic-ext'
  | 'greek'
  | 'greek-ext'
  | 'latin'
  | 'latin-ext'
  | 'vietnamese'
  | 'hebrew'
  | 'arabic'
  | 'devanagari'
  | 'thai'
  | 'chinese-simplified'
  | 'chinese-traditional'
  | 'japanese'
  | 'korean';

export type FontStyle = 'normal' | 'italic' | 'oblique';

export type FontWeight =
  | 100
  | 200
  | 300
  | 400
  | 500
  | 600
  | 700
  | 800
  | 900
  | '100'
  | '200'
  | '300'
  | '400'
  | '500'
  | '600'
  | '700'
  | '800'
  | '900'
  | 'normal'
  | 'bold';

export interface FontFamilyOptions {
  name: string;
  provider?: FontProvider;
  weights?: (FontWeight | number)[];
  styles?: FontStyle[];
  subsets?: FontSubset[];
  display?: FontDisplay;
  preload?: boolean;
  fallback?: string[];
  unicodeRange?: string;
  selector?: string;
  src?: string | string[];
  cssVariable?: string | boolean;
}

export interface ResolvedFontFace {
  fontFamily: string;
  src: string;
  weight?: string | number;
  style?: FontStyle;
  display?: FontDisplay;
  unicodeRange?: string;
  fontStretch?: string;
  fontVariant?: string;
  fontFeatureSettings?: string;
  fontVariationSettings?: string;
  ascentOverride?: string;
  descentOverride?: string;
  lineGapOverride?: string;
  sizeAdjust?: string;
}

export interface FontMetric {
  familyName: string;
  category: string;
  capHeight: number;
  ascent: number;
  descent: number;
  lineGap: number;
  unitsPerEm: number;
  xHeight: number;
  xWidthAvg: number;
  subsets: Record<string, { xWidthAvg: number }>;
  weights?: Record<string, any>;
}

export interface FontFaceDeclaration {
  css: string;
  url?: string;
  preload?: boolean;
}

export interface FontProviderOptions {
  name: FontProvider | string;
  prefix?: string;
  baseUrl?: string;
}

export interface GoogleFontsOptions {
  families: Record<string, FontFamilyOptions>;
  display?: FontDisplay;
  subsets?: FontSubset[];
  preload?: boolean;
  preconnect?: boolean;
  download?: boolean;
  baseUrl?: string;
  inject?: boolean;
}

export interface LocalFontOptions {
  name: string;
  src: string | string[];
  weights?: (FontWeight | number)[];
  styles?: FontStyle[];
  display?: FontDisplay;
  preload?: boolean;
  fallback?: string[];
}

export interface FontModuleOptions {
  google?: Partial<GoogleFontsOptions>;
  local?: Record<string, LocalFontOptions>;
  custom?: Record<string, FontFamilyOptions>;
  families: FontFamilyOptions[];
  defaults: {
    weights: number[];
    styles: FontStyle[];
    subsets: FontSubset[];
    display: FontDisplay;
    preload: boolean;
    preconnect: boolean;
    download: boolean;
    fallback: Record<string, string[]>;
  };
  assets: {
    baseURL: string;
    prefix: string;
  };
  metrics: boolean;
  experimental: {
    inline: boolean;
  };
}
