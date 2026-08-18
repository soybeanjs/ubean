import type { Plugin } from 'vite';
import { defu } from 'defu';
import { configureFontsRuntime, generateFontLinks, generateFontCSS } from './runtime';
import type { FontFamilyOptions, GoogleFontsOptions, LocalFontOptions, FontModuleOptions } from './types';

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

export interface UbeanFontsOptions {
  families?: Array<{
    name: string;
    provider?: 'google' | 'bunny' | 'local' | 'custom';
    weights?: number[];
    styles?: Array<'normal' | 'italic'>;
    subsets?: string[];
    display?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional';
    preload?: boolean;
    cssVariable?: string | boolean;
  }>;
  google?: {
    families?: Record<string, { weights?: number[]; styles?: string[]; subsets?: string[] }>;
    display?: string;
    preconnect?: boolean;
    download?: boolean;
  };
  local?: Record<
    string,
    {
      src: string | string[];
      weight?: number;
      style?: string;
      preload?: boolean;
    }
  >;
  defaults?: {
    weights?: number[];
    styles?: string[];
    subsets?: string[];
    display?: string;
    preload?: boolean;
  };
  inject?: boolean;
  devtools?: boolean;
}

const defaultOptions: UbeanFontsOptions = {
  families: [],
  google: {
    preconnect: true,
    download: false
  },
  defaults: {
    weights: [400],
    styles: ['normal'],
    subsets: ['latin'],
    display: 'swap',
    preload: true
  },
  inject: true,
  devtools: true
};

const VIRTUAL_FONTS = 'virtual:ubean-fonts';
const RESOLVED_VIRTUAL_FONTS = `\0${VIRTUAL_FONTS}`;

export function ubeanFontsPlugin(userOptions: UbeanFontsOptions = {}): Plugin {
  const options = defu(userOptions, defaultOptions) as Required<UbeanFontsOptions>;

  return {
    name: 'ubean:fonts',
    enforce: 'pre',

    configResolved() {
      configureFontsRuntime({
        families: options.families as unknown as FontFamilyOptions[],
        google: options.google as unknown as Partial<GoogleFontsOptions>,
        local: options.local as unknown as Record<string, LocalFontOptions>,
        defaults: options.defaults as unknown as FontModuleOptions['defaults']
      });
    },

    resolveId(id) {
      if (id === VIRTUAL_FONTS) {
        return RESOLVED_VIRTUAL_FONTS;
      }
      return null;
    },

    load(id) {
      if (id === RESOLVED_VIRTUAL_FONTS) {
        const { preconnect, styles, preload } = generateFontLinks();
        const cssVariables = generateFontCSS();
        return `
export const preconnectLinks = ${JSON.stringify(preconnect)};
export const stylesheetLinks = ${JSON.stringify(styles)};
export const preloadLinks = ${JSON.stringify(preload)};
export const fontCSS = ${JSON.stringify(cssVariables)};

export function useFonts() {
  return {
    preconnect: preconnectLinks,
    styles: stylesheetLinks,
    preload: preloadLinks,
    css: fontCSS,
    all: [...preconnectLinks, ...preloadLinks, ...stylesheetLinks].join('\\n')
  };
}

export default useFonts;
`;
      }
      return null;
    },

    transformIndexHtml(html) {
      if (!options.inject) return html;

      const { preconnect, styles, preload } = generateFontLinks();
      const tags = [
        ...preconnect.map(href => ({
          tag: 'link',
          attrs: { rel: 'preconnect', href: href.match(/href="([^"]+)"/)?.[1], crossorigin: true }
        })),
        ...preload.map(href => ({
          tag: 'link',
          attrs: {
            rel: 'preload',
            as: 'font',
            type: 'font/woff2',
            href: href.match(/href="([^"]+)"/)?.[1],
            crossorigin: true
          }
        })),
        ...styles.map(href => {
          const url = href.match(/href="([^"]+)"/)?.[1];
          return {
            tag: 'link',
            attrs: { rel: 'stylesheet', href: url }
          };
        })
      ];

      return {
        html,
        tags
      };
    }
  };
}

export default ubeanFontsPlugin;
