import {
  createImageContext,
  resolveImage as baseResolveImage,
  createSrcSet,
  createDensitySrcSet,
  srcSetToString,
  getPlaceholder,
  buildImgAttributes,
  getProvider,
  resolvePreset,
  detectFormat,
  isRemoteUrl,
  isDataUrl,
  validateDomain,
  resolveAlias
} from './core';
import type {
  ImageCTX,
  ImageOptions,
  ImageModifiers,
  CreateImageOptions,
  ResolvedImage,
  ImageSrcsetItem
} from './types';

let imageCTX: ImageCTX | null = null;

export function configureImageRuntime(options: CreateImageOptions = {}) {
  imageCTX = createImageContext(options);
  return imageCTX;
}

export function getImageContext(): ImageCTX {
  if (!imageCTX) {
    imageCTX = createImageContext();
  }
  return imageCTX;
}

export function resolveImage(source: string | ImageOptions, overrides: Partial<ImageOptions> = {}): ResolvedImage {
  const ctx = getImageContext();
  return baseResolveImage(source, overrides, ctx);
}

export function defineImagePreset(name: string, options: Partial<ImageOptions>) {
  const ctx = getImageContext();
  ctx.presets[name] = options;
}

export function useImage() {
  const ctx = getImageContext();

  return {
    resolveImage: (src: string | ImageOptions, options?: Partial<ImageOptions>) => baseResolveImage(src, options, ctx),
    getImage: (src: string, mods?: ImageModifiers) => baseResolveImage(src, mods || {}, ctx),
    srcset: (src: string, sizes: number[], mods?: ImageModifiers, formats?: any[]): ImageSrcsetItem[] =>
      createSrcSet(src, sizes, mods || {}, ctx, formats),
    densitySrcset: (src: string, densities: number[], mods?: ImageModifiers, formats?: any[]): ImageSrcsetItem[] =>
      createDensitySrcSet(src, densities, mods || {}, ctx, formats),
    srcsetToString: srcSetToString,
    getPlaceholder: (src: string, mods?: ImageModifiers, size?: number) => getPlaceholder(src, mods || {}, ctx, size),
    getImgAttributes: (src: string, options: ImageOptions) => buildImgAttributes(src, options, ctx),
    detectFormat,
    isRemote: isRemoteUrl,
    isDataUrl,
    validateDomain: (src: string) => validateDomain(src, ctx.options.domains),
    resolveAlias: (src: string) => resolveAlias(src, ctx.options.alias)
  };
}

export {
  createImageContext,
  baseResolveImage,
  createSrcSet,
  createDensitySrcSet,
  srcSetToString,
  getPlaceholder,
  buildImgAttributes,
  getProvider,
  resolvePreset,
  detectFormat,
  isRemoteUrl,
  isDataUrl,
  validateDomain,
  resolveAlias
};

export type {
  ImageCTX,
  ImageOptions,
  ImageModifiers,
  CreateImageOptions,
  ResolvedImage,
  ImageSrcsetItem
} from './types';
