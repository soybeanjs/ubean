import { hash } from 'ohash';
import { hasProtocol, joinURL } from 'ufo';
import type {
  ImageFormat,
  ImageModifiers,
  ImageOptions,
  ImageProvider,
  ImageCTX,
  ResolvedImage,
  CreateImageOptions,
  ImageSrcsetItem
} from './types';

export const formatMap: Record<ImageFormat, string> = {
  webp: 'image/webp',
  avif: 'image/avif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  svg: 'image/svg+xml'
};

export function detectFormat(src: string): ImageFormat | undefined {
  const ext = src.split('?')[0].split('.').pop()?.toLowerCase();
  if (ext && ext in formatMap) {
    return ext as ImageFormat;
  }
  return undefined;
}

export function isRemoteUrl(src: string): boolean {
  if (src.startsWith('//')) return true;
  return hasProtocol(src, { acceptRelative: false });
}

export function isDataUrl(src: string): boolean {
  return src.startsWith('data:');
}

export function resolveAlias(src: string, alias: Record<string, string>): string {
  for (const [prefix, target] of Object.entries(alias)) {
    if (src.startsWith(prefix)) {
      return joinURL(target, src.slice(prefix.length));
    }
  }
  return src;
}

export function validateDomain(src: string, domains: string[]): boolean {
  if (!domains.length) return true;
  if (!isRemoteUrl(src)) return true;
  try {
    const url = new URL(src);
    return domains.some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

export function createIPXUrl(
  baseURL: string,
  src: string,
  modifiers: ImageModifiers = {},
  defaultModifiers: ImageModifiers = {}
): string {
  const mods = { ...defaultModifiers, ...modifiers };
  const segments: string[] = [];

  if (mods.width) segments.push(`w_${mods.width}`);
  if (mods.height) segments.push(`h_${mods.height}`);
  if (mods.fit) segments.push(`f_${mods.fit}`);
  if (mods.position) segments.push(`p_${encodeURIComponent(mods.position)}`);
  if (mods.format) segments.push(`fm_${mods.format}`);
  if (mods.quality) segments.push(`q_${mods.quality}`);
  if (mods.blur) segments.push(`blur_${mods.blur}`);
  if (mods.sharpen) segments.push(`sharpen_${mods.sharpen}`);
  if (mods.rotate) segments.push(`rot_${mods.rotate}`);
  if (mods.background) segments.push(`bg_${encodeURIComponent(mods.background)}`);
  if (mods.grayscale) segments.push('grayscale');
  if (mods.negate) segments.push('negate');
  if (mods.trim) segments.push('trim');
  if (mods.enlarge) segments.push('enlarge');
  if (mods.flip === 'h') segments.push('fh');
  if (mods.flip === 'v') segments.push('fv');
  if (mods.flip === 'hv') segments.push('fh', 'fv');
  if (mods.brightness !== undefined) segments.push(`br_${mods.brightness}`);
  if (mods.contrast !== undefined) segments.push(`con_${mods.contrast}`);
  if (mods.saturation !== undefined) segments.push(`sat_${mods.saturation}`);

  const modifierString = segments.length > 0 ? segments.join(',') : '_';
  return joinURL(baseURL, modifierString, src);
}

export function createStaticUrl(
  baseURL: string,
  src: string,
  modifiers: ImageModifiers = {},
  defaultModifiers: ImageModifiers = {},
  dir: string = ''
): string {
  const mods = { ...defaultModifiers, ...modifiers };
  const ext = detectFormat(src) || 'webp';
  const format = mods.format || ext;
  const suffixParts: string[] = [];

  if (mods.width) suffixParts.push(`w${mods.width}`);
  if (mods.height) suffixParts.push(`h${mods.height}`);
  if (mods.quality) suffixParts.push(`q${mods.quality}`);
  if (mods.blur) suffixParts.push(`blur${mods.blur}`);

  const suffix = suffixParts.length > 0 ? `_${suffixParts.join('_')}` : '';
  const path = src.replace(/\.[^.]+$/, '');
  const fileName = `${path}${suffix}.${format}`;

  return joinURL(baseURL, dir, fileName);
}

export const ipxProvider: ImageProvider = {
  name: 'ipx',
  getImage(src, mods, ctx) {
    const baseURL = ctx?.options.ipx.baseURL || '/_ipx';
    const url = createIPXUrl(baseURL, src, mods, ctx?.options.ipx.modifiers || {});
    return { url };
  }
};

export const staticProvider: ImageProvider = {
  name: 'static',
  getImage(src, mods, ctx) {
    const baseURL = ctx?.options.static.baseURL || '/_image';
    const dir = ctx?.options.static.dir || '';
    const url = createStaticUrl(baseURL, src, mods, ctx?.options.static.modifiers || {}, dir);
    return { url };
  }
};

export const cloudinaryProvider: ImageProvider = {
  name: 'cloudinary',
  getImage(src, mods, ctx) {
    const baseURL = ctx?.options.cloudinary?.baseURL || '';
    const transforms: string[] = [];

    if (mods.width || mods.height) {
      transforms.push(`c_${mods.fit || 'fill'}`);
      if (mods.width) transforms.push(`w_${mods.width}`);
      if (mods.height) transforms.push(`h_${mods.height}`);
      if (mods.position) transforms.push(`g_${mods.position.replace(' ', '_')}`);
    }
    if (mods.quality) transforms.push(`q_${mods.quality}`);
    if (mods.format) transforms.push(`f_${mods.format}`);
    if (mods.rotate) transforms.push(`a_${mods.rotate}`);
    if (mods.blur) transforms.push(`e_blur:${Math.round(mods.blur * 20)}`);
    if (mods.grayscale) transforms.push('e_grayscale');
    if (mods.negate) transforms.push('e_negate');

    const transformString = transforms.length > 0 ? `${transforms.join(',')}/` : '';
    const url = joinURL(baseURL, 'image/upload', transformString, src);
    return { url };
  }
};

export const imgixProvider: ImageProvider = {
  name: 'imgix',
  getImage(src, mods, ctx) {
    const baseURL = ctx?.options.imgix?.baseURL || '';
    const params = new URLSearchParams();

    if (mods.width) params.set('w', String(mods.width));
    if (mods.height) params.set('h', String(mods.height));
    if (mods.fit) params.set('fit', mods.fit === 'cover' ? 'crop' : mods.fit);
    if (mods.position) {
      const posMap: Record<string, string> = {
        center: 'center',
        top: 'top',
        bottom: 'bottom',
        left: 'left',
        right: 'right',
        'left top': 'top,left',
        'right top': 'top,right',
        'left bottom': 'bottom,left',
        'right bottom': 'bottom,right'
      };
      params.set('crop', posMap[mods.position] || 'center');
    }
    if (mods.format) params.set('fm', mods.format);
    if (mods.quality) params.set('q', String(mods.quality));
    if (mods.blur) params.set('blur', String(Math.round(mods.blur * 20)));
    if (mods.rotate) params.set('rot', String(mods.rotate));
    if (mods.grayscale) params.set('sat', '-100');

    const query = params.toString();
    const url = joinURL(baseURL, src) + (query ? `?${query}` : '');
    return { url };
  }
};

export const builtinProviders: Record<string, ImageProvider> = {
  ipx: ipxProvider,
  static: staticProvider,
  cloudinary: cloudinaryProvider,
  imgix: imgixProvider,
  none: {
    name: 'none',
    getImage(src) {
      return { url: src };
    }
  }
};

export const defaultScreens: Record<string, number> = {
  xs: 320,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  xxl: 1536
};

export function createImageContext(userOptions: CreateImageOptions = {}): ImageCTX {
  const options = {
    provider: userOptions.provider || 'ipx',
    providers: { ...builtinProviders, ...userOptions.providers },
    presets: userOptions.presets || {},
    screens: { ...defaultScreens, ...userOptions.screens },
    densities: userOptions.densities || [1, 2],
    format: userOptions.format || ['webp', 'avif', 'jpeg'],
    quality: userOptions.quality || 80,
    placeholder: userOptions.quality ?? 10,
    responsiveSizes: userOptions.responsiveSizes || [320, 640, 768, 1024, 1280],
    domains: userOptions.domains || [],
    alias: userOptions.alias || {},
    dir: userOptions.dir || '',
    ipx: {
      baseURL: '/_ipx',
      modifiers: {},
      ...userOptions.ipx
    },
    static: {
      baseURL: '/_image',
      modifiers: {},
      dir: '',
      ...userOptions.static
    },
    cloudinary: { baseURL: '', modifiers: {}, ...userOptions.cloudinary },
    imgix: { baseURL: '', modifiers: {}, ...userOptions.imgix },
    twicpics: { baseURL: '', modifiers: {} },
    fastly: { baseURL: '', modifiers: {} },
    vercel: { baseURL: '/_vercel/image', modifiers: {} },
    netlify: { baseURL: '/.netlify/images', modifiers: {} },
    imagekit: { baseURL: '', modifiers: {} },
    uploadcare: { baseURL: '', modifiers: {} },
    preload: true,
    intersectOptions: {
      rootMargin: '200px'
    }
  };

  const providers: Record<string, ImageProvider> = {};
  for (const [name, provider] of Object.entries(options.providers)) {
    providers[name] = {
      name,
      getImage: provider.getImage || builtinProviders[name]?.getImage || (src => ({ url: src })),
      validateDomains: provider.validateDomains ?? builtinProviders[name]?.validateDomains,
      supportsAlias: provider.supportsAlias ?? builtinProviders[name]?.supportsAlias
    };
  }

  return { options, providers, presets: options.presets };
}

export function getProvider(name: string, ctx: ImageCTX): ImageProvider {
  return ctx.providers[name] || ctx.providers[ctx.options.provider] || builtinProviders.none;
}

export function resolvePreset(preset: string | undefined, ctx: ImageCTX): Partial<ImageOptions> {
  if (!preset) return {};
  return ctx.presets[preset] || {};
}

export function resolveImage(
  source: string | ImageOptions,
  overrides: Partial<ImageOptions> = {},
  ctx: ImageCTX
): ResolvedImage {
  const input: ImageOptions = typeof source === 'string' ? { src: source, ...overrides } : { ...source, ...overrides };

  if (input.preset) {
    const preset = resolvePreset(input.preset, ctx);
    Object.assign(input, preset, input);
  }

  let { src } = input;
  const providerName = input.provider || ctx.options.provider;
  const provider = getProvider(providerName, ctx);

  src = resolveAlias(src, ctx.options.alias);

  if (isDataUrl(src)) {
    return { url: src };
  }

  if (isRemoteUrl(src)) {
    if (!validateDomain(src, ctx.options.domains)) {
      console.warn(`[ubean-image] Domain not allowed: ${new URL(src).hostname}`);
    }
  }

  const modifiers: ImageModifiers = {
    quality: input.quality ?? ctx.options.quality,
    width: input.width,
    height: input.height,
    fit: input.fit,
    position: input.position,
    format: input.format,
    background: input.background,
    blur: input.blur,
    sharpen: input.sharpen,
    rotate: input.rotate,
    flip: input.flip,
    trim: input.trim,
    enlarge: input.enlarge,
    grayscale: input.grayscale,
    negate: input.negate,
    brightness: input.brightness,
    contrast: input.contrast,
    saturation: input.saturation
  };

  const result = provider.getImage(src, modifiers, ctx);

  return {
    ...result,
    width: modifiers.width,
    height: modifiers.height,
    format: modifiers.format
  };
}

export function createSrcSet(
  src: string,
  sizes: number[],
  modifiers: ImageModifiers,
  ctx: ImageCTX,
  formats: ImageFormat[] = []
): ImageSrcsetItem[] {
  const items: ImageSrcsetItem[] = [];
  const targetFormats = formats.length > 0 ? formats : [modifiers.format || detectFormat(src) || 'jpeg'];

  for (const format of targetFormats) {
    for (const width of sizes) {
      if (modifiers.width && width > modifiers.width) continue;
      const resolved = resolveImage(src, { ...modifiers, width, format }, ctx);
      items.push({
        url: resolved.url,
        width,
        format
      });
    }
  }

  return items;
}

export function createDensitySrcSet(
  src: string,
  densities: number[],
  modifiers: ImageModifiers,
  ctx: ImageCTX,
  formats: ImageFormat[] = []
): ImageSrcsetItem[] {
  const items: ImageSrcsetItem[] = [];
  const targetFormats = formats.length > 0 ? formats : [modifiers.format || detectFormat(src) || 'jpeg'];
  const baseWidth = modifiers.width || 0;

  for (const format of targetFormats) {
    for (const density of densities) {
      const width = baseWidth ? Math.round(baseWidth * density) : undefined;
      const resolved = resolveImage(src, { ...modifiers, width, format }, ctx);
      items.push({
        url: resolved.url,
        density,
        format
      });
    }
  }

  return items;
}

export function srcSetToString(items: ImageSrcsetItem[]): string {
  return items
    .map(item => {
      if (item.width) return `${item.url} ${item.width}w`;
      if (item.density) return `${item.url} ${item.density}x`;
      return item.url;
    })
    .join(', ');
}

export function getPlaceholder(
  src: string,
  modifiers: ImageModifiers,
  ctx: ImageCTX,
  size: number = 10
): string | null {
  const resolved = resolveImage(src, { ...modifiers, width: size, quality: 30, format: 'webp', blur: 3 }, ctx);
  return resolved.url;
}

export function buildImgAttributes(src: string, options: ImageOptions, ctx: ImageCTX): Record<string, any> {
  const resolved = resolveImage(src, options, ctx);
  const attrs: Record<string, any> = {
    src: resolved.url,
    alt: options.alt || '',
    loading: options.loading || 'lazy',
    decoding: 'async'
  };

  if (options.title) attrs.title = options.title;
  if (options.crossorigin) attrs.crossorigin = options.crossorigin;
  if (options.referrerpolicy) attrs.referrerpolicy = options.referrerpolicy;
  if (options.sizes) {
    attrs.sizes = options.sizes;
  }
  if (options.width) attrs.width = options.width;
  if (options.height) attrs.height = options.height;

  return attrs;
}

export function createImageHash(url: string, modifiers?: ImageModifiers): string {
  return hash({ url, modifiers }).slice(0, 10);
}
