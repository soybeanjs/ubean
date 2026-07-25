import { describe, it, expect } from 'vitest';
import {
  detectFormat,
  isRemoteUrl,
  isDataUrl,
  validateDomain,
  resolveAlias,
  createIPXUrl,
  createStaticUrl,
  createImageContext,
  resolveImage,
  createSrcSet,
  srcSetToString,
  ipxProvider,
  staticProvider,
  cloudinaryProvider,
  imgixProvider,
  defaultScreens,
  createImageHash,
  getPlaceholder
} from '../src/core';
import { configureImageRuntime, useImage, resolveImage as runtimeResolveImage } from '../src/runtime';

describe('ubean-image core', () => {
  describe('detectFormat', () => {
    it('detects format from extension', () => {
      expect(detectFormat('image.jpg')).toBe('jpg');
      expect(detectFormat('image.jpeg')).toBe('jpeg');
      expect(detectFormat('image.png')).toBe('png');
      expect(detectFormat('image.webp')).toBe('webp');
      expect(detectFormat('image.avif')).toBe('avif');
      expect(detectFormat('image.gif')).toBe('gif');
      expect(detectFormat('image.svg')).toBe('svg');
    });

    it('ignores query parameters', () => {
      expect(detectFormat('image.jpg?v=123')).toBe('jpg');
      expect(detectFormat('image.png?w=100&h=200')).toBe('png');
    });

    it('returns undefined for unknown formats', () => {
      expect(detectFormat('image.txt')).toBeUndefined();
      expect(detectFormat('noext')).toBeUndefined();
    });
  });

  describe('isRemoteUrl', () => {
    it('detects remote URLs', () => {
      expect(isRemoteUrl('https://example.com/image.jpg')).toBe(true);
      expect(isRemoteUrl('http://example.com/image.png')).toBe(true);
      expect(isRemoteUrl('//example.com/image.jpg')).toBe(true);
    });

    it('detects local paths', () => {
      expect(isRemoteUrl('/images/image.jpg')).toBe(false);
      expect(isRemoteUrl('images/image.jpg')).toBe(false);
      expect(isRemoteUrl('./images/image.jpg')).toBe(false);
    });
  });

  describe('isDataUrl', () => {
    it('detects data URLs', () => {
      expect(isDataUrl('data:image/png;base64,abc123')).toBe(true);
      expect(isDataUrl('data:image/jpeg;base64,xyz')).toBe(true);
    });

    it('detects non-data URLs', () => {
      expect(isDataUrl('/image.jpg')).toBe(false);
      expect(isDataUrl('https://example.com')).toBe(false);
    });
  });

  describe('validateDomain', () => {
    const domains = ['example.com', 'images.unsplash.com'];

    it('allows domains in allowlist', () => {
      expect(validateDomain('https://example.com/img.jpg', domains)).toBe(true);
      expect(validateDomain('https://images.unsplash.com/photo.jpg', domains)).toBe(true);
    });

    it('allows subdomains of allowed domains', () => {
      expect(validateDomain('https://sub.example.com/img.jpg', domains)).toBe(true);
    });

    it('rejects domains not in allowlist', () => {
      expect(validateDomain('https://evil.com/img.jpg', domains)).toBe(false);
      expect(validateDomain('https://example.com.evil.com/img.jpg', domains)).toBe(false);
    });

    it('allows all domains when allowlist is empty', () => {
      expect(validateDomain('https://any.com/img.jpg', [])).toBe(true);
    });

    it('allows local paths', () => {
      expect(validateDomain('/images/img.jpg', domains)).toBe(true);
    });
  });

  describe('resolveAlias', () => {
    const alias = {
      '@images': '/assets/images',
      '@public': '/public'
    };

    it('resolves aliases', () => {
      expect(resolveAlias('@images/logo.png', alias)).toBe('/assets/images/logo.png');
      expect(resolveAlias('@public/favicon.ico', alias)).toBe('/public/favicon.ico');
    });

    it('returns original when no alias matches', () => {
      expect(resolveAlias('/other/image.png', alias)).toBe('/other/image.png');
    });
  });

  describe('createIPXUrl', () => {
    it('creates basic IPX URL', () => {
      const url = createIPXUrl('/_ipx', '/images/photo.jpg');
      expect(url).toBe('/_ipx/_/images/photo.jpg');
    });

    it('includes width and height', () => {
      const url = createIPXUrl('/_ipx', '/images/photo.jpg', { width: 800, height: 600 });
      expect(url).toContain('w_800');
      expect(url).toContain('h_600');
      expect(url).toContain('/images/photo.jpg');
    });

    it('includes format and quality', () => {
      const url = createIPXUrl('/_ipx', '/images/photo.jpg', { format: 'webp', quality: 80 });
      expect(url).toContain('fm_webp');
      expect(url).toContain('q_80');
    });

    it('includes fit and position', () => {
      const url = createIPXUrl('/_ipx', '/images/photo.jpg', {
        fit: 'cover',
        position: 'center'
      });
      expect(url).toContain('f_cover');
      expect(url).toContain('p_center');
    });

    it('includes transformations', () => {
      const url = createIPXUrl('/_ipx', '/images/photo.jpg', {
        blur: 5,
        grayscale: true,
        rotate: 90
      });
      expect(url).toContain('blur_5');
      expect(url).toContain('grayscale');
      expect(url).toContain('rot_90');
    });

    it('includes flip directions', () => {
      expect(createIPXUrl('/_ipx', '/img.jpg', { flip: 'h' })).toContain('fh');
      expect(createIPXUrl('/_ipx', '/img.jpg', { flip: 'v' })).toContain('fv');
      expect(createIPXUrl('/_ipx', '/img.jpg', { flip: 'hv' })).toContain('fh');
      expect(createIPXUrl('/_ipx', '/img.jpg', { flip: 'hv' })).toContain('fv');
    });
  });

  describe('createStaticUrl', () => {
    it('creates static URL with modifiers', () => {
      const url = createStaticUrl('/_image', 'photos/hero.jpg', { width: 1200, format: 'webp' });
      expect(url).toBe('/_image/photos/hero_w1200.webp');
    });

    it('keeps original format when not specified', () => {
      const url = createStaticUrl('/_image', 'images/logo.png', { width: 200 });
      expect(url).toBe('/_image/images/logo_w200.png');
    });

    it('includes multiple modifiers', () => {
      const url = createStaticUrl('/_image', 'img/photo.jpg', {
        width: 800,
        height: 600,
        quality: 75
      });
      expect(url).toContain('w800');
      expect(url).toContain('h600');
      expect(url).toContain('q75');
    });
  });

  describe('providers', () => {
    const ctx = createImageContext();

    describe('ipxProvider', () => {
      it('generates IPX URLs', () => {
        const result = ipxProvider.getImage('/photo.jpg', { width: 400 }, ctx);
        expect(result.url).toContain('/_ipx');
        expect(result.url).toContain('w_400');
        expect(result.url).toContain('/photo.jpg');
      });
    });

    describe('staticProvider', () => {
      it('generates static URLs', () => {
        const result = staticProvider.getImage('/logo.png', { width: 100 }, ctx);
        expect(result.url).toContain('/_image');
        expect(result.url).toContain('logo_w100.png');
      });
    });

    describe('cloudinaryProvider', () => {
      it('generates Cloudinary URLs', () => {
        const cloudinaryCtx = createImageContext({
          cloudinary: { baseURL: 'https://res.cloudinary.com/demo' }
        });
        const result = cloudinaryProvider.getImage('sample.jpg', { width: 300 }, cloudinaryCtx);
        expect(result.url).toContain('res.cloudinary.com');
        expect(result.url).toContain('w_300');
        expect(result.url).toContain('sample.jpg');
      });
    });

    describe('imgixProvider', () => {
      it('generates Imgix URLs', () => {
        const imgixCtx = createImageContext({
          imgix: { baseURL: 'https://demo.imgix.net' }
        });
        const result = imgixProvider.getImage('photo.jpg', { width: 500, quality: 80 }, imgixCtx);
        expect(result.url).toContain('demo.imgix.net');
        expect(result.url).toContain('w=500');
        expect(result.url).toContain('q=80');
      });
    });
  });

  describe('createImageContext', () => {
    it('creates context with defaults', () => {
      const ctx = createImageContext();
      expect(ctx.options.provider).toBe('ipx');
      expect(ctx.options.quality).toBe(80);
      expect(ctx.options.densities).toEqual([1, 2]);
      expect(ctx.providers.ipx).toBeDefined();
      expect(ctx.providers.static).toBeDefined();
    });

    it('merges custom options', () => {
      const ctx = createImageContext({
        provider: 'static',
        quality: 90,
        domains: ['example.com']
      });
      expect(ctx.options.provider).toBe('static');
      expect(ctx.options.quality).toBe(90);
      expect(ctx.options.domains).toContain('example.com');
    });
  });

  describe('resolveImage', () => {
    it('resolves local image with IPX', () => {
      const ctx = createImageContext();
      const result = resolveImage('/images/hero.jpg', { width: 1200 }, ctx);
      expect(result.url).toContain('/_ipx');
      expect(result.url).toContain('w_1200');
    });

    it('resolves with preset', () => {
      const ctx = createImageContext({
        presets: {
          thumbnail: { width: 150, height: 150, fit: 'cover' }
        }
      });
      const result = resolveImage({ src: '/photo.jpg', preset: 'thumbnail' }, {}, ctx);
      expect(result.url).toContain('w_150');
      expect(result.url).toContain('h_150');
      expect(result.url).toContain('f_cover');
    });

    it('handles data URLs', () => {
      const ctx = createImageContext();
      const dataUrl = 'data:image/png;base64,abc';
      const result = resolveImage(dataUrl, {}, ctx);
      expect(result.url).toBe(dataUrl);
    });
  });

  describe('createSrcSet', () => {
    it('creates responsive srcset', () => {
      const ctx = createImageContext();
      const items = createSrcSet('/photo.jpg', [320, 640, 1024], { format: 'webp' }, ctx);
      expect(items).toHaveLength(3);
      expect(items[0].width).toBe(320);
      expect(items[1].width).toBe(640);
      expect(items[2].width).toBe(1024);
      expect(items.every(i => i.format === 'webp')).toBe(true);
    });
  });

  describe('srcSetToString', () => {
    it('formats width-based srcset', () => {
      const str = srcSetToString([
        { url: '/img-320.jpg', width: 320 },
        { url: '/img-640.jpg', width: 640 }
      ]);
      expect(str).toBe('/img-320.jpg 320w, /img-640.jpg 640w');
    });

    it('formats density-based srcset', () => {
      const str = srcSetToString([
        { url: '/img-1x.jpg', density: 1 },
        { url: '/img-2x.jpg', density: 2 }
      ]);
      expect(str).toBe('/img-1x.jpg 1x, /img-2x.jpg 2x');
    });
  });

  describe('defaultScreens', () => {
    it('has standard breakpoints', () => {
      expect(defaultScreens.xs).toBe(320);
      expect(defaultScreens.sm).toBe(640);
      expect(defaultScreens.md).toBe(768);
      expect(defaultScreens.lg).toBe(1024);
      expect(defaultScreens.xl).toBe(1280);
    });
  });

  describe('createImageHash', () => {
    it('creates consistent hash', () => {
      const hash1 = createImageHash('/img.jpg', { width: 100 });
      const hash2 = createImageHash('/img.jpg', { width: 100 });
      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(10);
    });

    it('creates different hash for different inputs', () => {
      const hash1 = createImageHash('/img1.jpg');
      const hash2 = createImageHash('/img2.jpg');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('getPlaceholder', () => {
    it('generates placeholder URL', () => {
      const ctx = createImageContext();
      const placeholder = getPlaceholder('/hero.jpg', {}, ctx, 10);
      expect(placeholder).toBeTruthy();
      expect(placeholder).toContain('w_10');
      expect(placeholder).toContain('q_30');
      expect(placeholder).toContain('blur_3');
    });
  });
});

describe('ubean-image runtime', () => {
  it('configureImageRuntime sets up context', () => {
    configureImageRuntime({ quality: 85, provider: 'static' });
    const img = useImage();
    expect(img).toBeDefined();
    expect(img.resolveImage).toBeDefined();
    expect(img.getImage).toBeDefined();
    expect(img.srcset).toBeDefined();
  });

  it('resolveImage uses configured context', () => {
    configureImageRuntime({ provider: 'static' });
    const result = runtimeResolveImage('/logo.png', { width: 200 });
    expect(result.url).toContain('/_image');
  });

  it('useImage provides helper methods', () => {
    configureImageRuntime();
    const img = useImage();

    expect(img.detectFormat('photo.webp')).toBe('webp');
    expect(img.isRemote('https://example.com')).toBe(true);
    expect(img.isDataUrl('data:image/png;base64,x')).toBe(true);
    expect(typeof img.srcsetToString).toBe('function');
  });
});
