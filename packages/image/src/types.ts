export type ImageFormat = 'webp' | 'avif' | 'jpeg' | 'jpg' | 'png' | 'gif' | 'svg';

export type ImageFit = 'cover' | 'contain' | 'fill' | 'inside' | 'outside';

export type ImagePosition =
  | 'top'
  | 'right top'
  | 'right'
  | 'right bottom'
  | 'bottom'
  | 'left bottom'
  | 'left'
  | 'left top'
  | 'center';

export interface ImageModifiers {
  width?: number;
  height?: number;
  size?: string;
  fit?: ImageFit;
  position?: ImagePosition;
  format?: ImageFormat;
  quality?: number;
  background?: string;
  blur?: number;
  sharpen?: number;
  rotate?: number;
  flip?: 'h' | 'v' | 'hv';
  trim?: boolean | number;
  enlarge?: boolean;
  grayscale?: boolean;
  negate?: boolean;
  brightness?: number;
  contrast?: number;
  saturation?: number;
}

export interface ImageOptions extends ImageModifiers {
  src: string;
  alt?: string;
  title?: string;
  loading?: 'lazy' | 'eager';
  crossorigin?: 'anonymous' | 'use-credentials' | '';
  referrerpolicy?: string;
  placeholder?: string;
  sizes?: string;
  srcset?: string;
  preset?: string;
  provider?: string;
  densities?: string;
}

export interface ImageSize {
  width?: number;
  height?: number;
  media?: string;
  breakpoint?: number;
  format?: ImageFormat;
}

export interface ProviderGetImage {
  (src: string, options?: ImageModifiers, ctx?: ImageCTX): ResolvedImage;
}

export interface ResolvedImage {
  url: string;
  format?: ImageFormat;
  width?: number;
  height?: number;
  sizes?: string;
  srcset?: ImageSrcsetItem[];
}

export interface ImageSrcsetItem {
  url: string;
  width?: number;
  density?: number;
  format?: ImageFormat;
}

export interface ImageProvider {
  name: string;
  getImage: ProviderGetImage;
  validateDomains?: boolean;
  supportsAlias?: boolean;
}

export interface ImageCTX {
  options: Required<ImageModuleOptions>;
  providers: Record<string, ImageProvider>;
  presets: Record<string, Partial<ImageOptions>>;
}

export interface ImageModuleOptions {
  provider: string;
  providers: Record<string, Partial<ImageProvider> & { options?: any }>;
  presets: Record<string, Partial<ImageOptions>>;
  screens: Record<string, number>;
  densities: number[];
  format: ImageFormat[];
  quality: number;
  placeholder: number | false;
  responsiveSizes: number[];
  domains: string[];
  alias: Record<string, string>;
  dir: string;
  ipx: {
    baseURL: string;
    modifiers?: Partial<ImageModifiers>;
  };
  static: {
    baseURL: string;
    modifiers?: Partial<ImageModifiers>;
    dir?: string;
  };
  cloudinary?: {
    baseURL: string;
    modifiers?: Partial<ImageModifiers>;
  };
  imgix?: {
    baseURL: string;
    modifiers?: Partial<ImageModifiers>;
  };
  twicpics?: {
    baseURL: string;
    modifiers?: Partial<ImageModifiers>;
  };
  fastly?: {
    baseURL: string;
    modifiers?: Partial<ImageModifiers>;
  };
  vercel?: {
    baseURL: string;
    modifiers?: Partial<ImageModifiers>;
  };
  netlify?: {
    baseURL: string;
    modifiers?: Partial<ImageModifiers>;
  };
  imagekit?: {
    baseURL: string;
    modifiers?: Partial<ImageModifiers>;
  };
  uploadcare?: {
    baseURL: string;
    modifiers?: Partial<ImageModifiers>;
  };
  preload: boolean;
  intersectOptions: IntersectionObserverInit;
}

export interface CreateImageOptions {
  providers?: Record<string, ImageProvider | Partial<ImageProvider>>;
  presets?: Record<string, Partial<ImageOptions>>;
  screens?: Record<string, number>;
  densities?: number[];
  format?: ImageFormat[];
  quality?: number;
  placeholder?: number | false;
  responsiveSizes?: number[];
  domains?: string[];
  alias?: Record<string, string>;
  provider?: string;
  dir?: string;
  ipx?: Partial<ImageModuleOptions['ipx']>;
  static?: Partial<ImageModuleOptions['static']>;
  cloudinary?: Partial<ImageModuleOptions['cloudinary']>;
  imgix?: Partial<ImageModuleOptions['imgix']>;
  preload?: boolean;
  intersectOptions?: IntersectionObserverInit;
}
