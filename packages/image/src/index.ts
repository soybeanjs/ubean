import { NuxtImg, NuxtPicture } from './components';
import { configureImageRuntime } from './runtime';

export { NuxtImg, NuxtPicture };
export { ubeanImagePlugin } from './vite';
export type { UbeanImageOptions } from './vite';
export { serveIpxRequest, createIpxHonoHandler, parseIpxModifiers, resolveLocalImage } from './ipx';
export type { ServeIpxOptions, ServeIpxResult } from './ipx';

export {
  configureImageRuntime,
  getImageContext,
  resolveImage,
  defineImagePreset,
  useImage,
  createImageContext
} from './runtime';

export {
  detectFormat,
  isRemoteUrl,
  isDataUrl,
  validateDomain,
  resolveAlias,
  createIPXUrl,
  createStaticUrl,
  srcSetToString,
  createSrcSet,
  createDensitySrcSet,
  buildImgAttributes,
  getPlaceholder,
  builtinProviders,
  ipxProvider,
  staticProvider,
  cloudinaryProvider,
  imgixProvider,
  defaultScreens,
  createImageHash
} from './core';

export type {
  ImageFormat,
  ImageFit,
  ImagePosition,
  ImageModifiers,
  ImageOptions,
  ImageProvider,
  ImageCTX,
  ResolvedImage,
  ImageSrcsetItem,
  CreateImageOptions,
  ImageSize
} from './types';

export const UbeanImg = NuxtImg;
export const UbeanPicture = NuxtPicture;

declare module 'vue' {
  export interface GlobalComponents {
    UbeanImg: typeof NuxtImg;
    NuxtImg: typeof NuxtImg;
    UbeanPicture: typeof NuxtPicture;
    NuxtPicture: typeof NuxtPicture;
  }
}

export default {
  install(app: any, options?: any) {
    configureImageRuntime(options);
    app.component('UbeanImg', NuxtImg);
    app.component('NuxtImg', NuxtImg);
    app.component('UbeanPicture', NuxtPicture);
    app.component('NuxtPicture', NuxtPicture);
  }
};
