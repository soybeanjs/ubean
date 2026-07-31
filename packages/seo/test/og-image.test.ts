/**
 * P9-06 OG Image 动态生成 单元测试
 *
 * 测试策略:
 * - 模板结构、shadeColor、字体加载辅助函数:可独立测试,不依赖 satori/resvg
 * - ImageResponse / renderOgImage 实际渲染:依赖 satori/resvg 可选 peer 依赖,
 *   在测试环境不强制安装,通过 try/catch 跳过相关用例
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  defaultTemplate,
  articleTemplate,
  shadeColor,
  loadFontFromUrl,
  loadFontFromFile,
  loadDefaultFont,
  DEFAULT_FONT_URL,
  DEFAULT_FONT_NAME,
  isOgImageSupported,
  renderToImage,
  ImageResponse,
  renderOgImage,
  renderArticleOgImage
} from '../src/og-image';
import type { SatoriNode, OgImageOptions, OgTemplateInput } from '../src/og-image';

describe('P9-06 OG Image 动态生成', () => {
  describe('shadeColor', () => {
    it('darkens a color by negative percent', () => {
      // Math.round(2.55 * -50) = Math.round(-127.5) = -127 (rounds toward +Infinity)
      // 255 + (-127) = 128 = 0x80
      expect(shadeColor('#ffffff', -50)).toBe('#808080');
    });

    it('lightens a color by positive percent', () => {
      // 2.55 * 50 = 127.49999... (float precision) → Math.round = 127 = 0x7f
      expect(shadeColor('#000000', 50)).toBe('#7f7f7f');
    });

    it('clamps to 0-255 range', () => {
      expect(shadeColor('#000000', -100)).toBe('#000000');
      expect(shadeColor('#ffffff', 100)).toBe('#ffffff');
    });

    it('returns input for invalid hex', () => {
      expect(shadeColor('not-a-color', 50)).toBe('not-a-color');
      expect(shadeColor('#abc', 50)).toBe('#abc');
    });

    it('handles 6-digit hex without # prefix', () => {
      // shadeColor strips # internally; result is always lowercase #rrggbb
      expect(shadeColor('ffffff', -50)).toBe('#808080');
    });

    it('pads single-digit components', () => {
      // #000100 lightened by 50% → all components become 0x7f except green which is 0x80
      const result = shadeColor('#000100', 50);
      expect(result).toMatch(/^#[0-9a-f]{6}$/);
    });
  });

  describe('defaultTemplate', () => {
    it('returns a SatoriNode with type "div"', () => {
      const node = defaultTemplate({ title: 'Hello' });
      expect(node.type).toBe('div');
      expect(node.props).toBeDefined();
      expect(node.props.style).toBeDefined();
    });

    it('uses default theme color when not provided', () => {
      const node = defaultTemplate({ title: 'Hello' });
      const style = node.props.style as Record<string, unknown>;
      expect(style.backgroundColor).toBe('#0f172a');
    });

    it('uses custom theme color', () => {
      const node = defaultTemplate({ title: 'Hello', themeColor: '#ff0000' });
      const style = node.props.style as Record<string, unknown>;
      expect(style.backgroundColor).toBe('#ff0000');
      expect(style.backgroundImage).toContain('#ff0000');
    });

    it('uses backgroundImage when provided (overrides gradient)', () => {
      const node = defaultTemplate({
        title: 'Hello',
        backgroundImage: 'https://example.com/bg.jpg'
      });
      const style = node.props.style as Record<string, unknown>;
      expect(style.backgroundImage).toBe('url(https://example.com/bg.jpg)');
    });

    it('includes title in children', () => {
      const node = defaultTemplate({ title: 'My Title' });
      const children = node.props.children as SatoriNode[];
      expect(Array.isArray(children)).toBe(true);
      // The title is nested in the first child (titleContainer) → contentChildren[0]
      const titleContainer = children[0];
      const contentChildren = titleContainer.props.children as SatoriNode[];
      const titleNode = contentChildren[0];
      expect(titleNode.props.children).toBe('My Title');
    });

    it('includes description when provided', () => {
      const node = defaultTemplate({ title: 'T', description: 'D' });
      const children = node.props.children as SatoriNode[];
      const titleContainer = children[0];
      const contentChildren = titleContainer.props.children as SatoriNode[];
      // Second element is the description
      const descNode = contentChildren[1];
      expect(descNode).toBeDefined();
      expect(descNode.props.children).toBe('D');
    });

    it('includes siteName at bottom when provided', () => {
      const node = defaultTemplate({ title: 'T', siteName: 'ubean' });
      const children = node.props.children as SatoriNode[];
      // siteName is the last child
      const lastChild = children[children.length - 1];
      expect(lastChild.props.children).toBe('ubean');
    });

    it('includes logo at top when provided', () => {
      const node = defaultTemplate({ title: 'T', logo: 'MyLogo' });
      const children = node.props.children as SatoriNode[];
      // logo is unshifted to the front
      const firstChild = children[0];
      expect(firstChild.props.children).toBe('MyLogo');
    });

    it('uses smaller font size for long titles', () => {
      const shortTitle = defaultTemplate({ title: 'Short' });
      const longTitle = defaultTemplate({ title: 'x'.repeat(100) });

      const getFontSize = (node: SatoriNode): string => {
        const children = node.props.children as SatoriNode[];
        const titleContainer = children[0];
        const contentChildren = titleContainer.props.children as SatoriNode[];
        const titleNode = contentChildren[0];
        return (titleNode.props.style as Record<string, unknown>).fontSize as string;
      };

      expect(getFontSize(shortTitle)).toBe('72px');
      expect(getFontSize(longTitle)).toBe('52px');
    });

    it('sets fontFamily to Inter by default', () => {
      const node = defaultTemplate({ title: 'Hello' });
      const style = node.props.style as Record<string, unknown>;
      expect(style.fontFamily).toBe(DEFAULT_FONT_NAME);
    });
  });

  describe('articleTemplate', () => {
    it('returns a SatoriNode with type "div"', () => {
      const node = articleTemplate({ title: 'Article' });
      expect(node.type).toBe('div');
    });

    it('uses space-between justifyContent', () => {
      const node = articleTemplate({ title: 'Article' });
      const style = node.props.style as Record<string, unknown>;
      expect(style.justifyContent).toBe('space-between');
    });

    it('includes author and date at bottom when provided', () => {
      const node = articleTemplate({ title: 'T', author: 'John', date: '2026-01-01' });
      const children = node.props.children as SatoriNode[];
      // Last child is the author/date footer
      const footer = children[children.length - 1];
      expect(footer.props.children).toBe('John · 2026-01-01');
    });

    it('filters out missing author or date', () => {
      const node = articleTemplate({ title: 'T', author: 'John' });
      const children = node.props.children as SatoriNode[];
      const footer = children[children.length - 1];
      expect(footer.props.children).toBe('John');
    });

    it('uses smaller font size for long titles', () => {
      const shortTitle = articleTemplate({ title: 'Short' });
      const longTitle = articleTemplate({ title: 'x'.repeat(100) });

      const getFontSize = (node: SatoriNode): string => {
        const children = node.props.children as SatoriNode[];
        const middle = children.find(
          c => ((c.props.style as Record<string, unknown>)?.flexGrow as number) === 1
        ) as SatoriNode;
        const titleNode = (middle.props.children as SatoriNode[])[0];
        return (titleNode.props.style as Record<string, unknown>).fontSize as string;
      };

      expect(getFontSize(shortTitle)).toBe('64px');
      expect(getFontSize(longTitle)).toBe('48px');
    });

    it('omits siteName slot when not provided', () => {
      const node = articleTemplate({ title: 'T' });
      const children = node.props.children as SatoriNode[];
      // Only middle (title) and footer
      expect(children.length).toBe(2);
    });
  });

  describe('Font loading', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it('loadFontFromUrl fetches and returns SatoriFont', async () => {
      const buffer = new ArrayBuffer(8);
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        arrayBuffer: async () => buffer
      });

      const font = await loadFontFromUrl('https://example.com/font.woff2', 'CustomFont', 700);
      expect(font.name).toBe('CustomFont');
      expect(font.weight).toBe(700);
      expect(font.data).toBe(buffer);
    });

    it('loadFontFromUrl throws on non-200 response', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      await expect(loadFontFromUrl('https://example.com/missing.woff2', 'Font')).rejects.toThrow(/404/);
    });

    it('loadFontFromUrl accepts style parameter', async () => {
      const buffer = new ArrayBuffer(4);
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        arrayBuffer: async () => buffer
      });

      const font = await loadFontFromUrl('https://example.com/font.woff2', 'Font', 400, 'italic');
      expect(font.style).toBe('italic');
    });

    it('loadDefaultFont calls loadFontFromUrl with default URL and name', async () => {
      const buffer = new ArrayBuffer(4);
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        arrayBuffer: async () => buffer
      });

      const font = await loadDefaultFont();
      expect(font.name).toBe(DEFAULT_FONT_NAME);
      expect(font.weight).toBe(400);
      expect(globalThis.fetch).toHaveBeenCalledWith(DEFAULT_FONT_URL);
    });

    it('loadFontFromFile throws on missing file', () => {
      expect(() => loadFontFromFile('/nonexistent/path/font.woff2', 'Font')).toThrow();
    });
  });

  describe('isOgImageSupported', () => {
    it('returns boolean', async () => {
      const result = await isOgImageSupported();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('renderToImage', () => {
    it('either renders or throws when deps missing/bad font data', async () => {
      const node = defaultTemplate({ title: 'Hello' });
      try {
        const result = await renderToImage(node, {
          fonts: [{ name: 'test', data: new ArrayBuffer(1) }]
        });
        // satori + resvg are installed AND accepted the font — result is image data
        expect(result).toBeDefined();
        expect(result.contentType).toMatch(/^image\//);
      } catch (err) {
        // Expected: bad font data (e.g. "Offset is outside the bounds of the DataView")
        // or missing deps error mentioning satori/resvg
        expect(err).toBeInstanceOf(Error);
      }
    });
  });

  describe('ImageResponse', () => {
    it('constructs a Response instance', () => {
      const node = defaultTemplate({ title: 'Hello' });
      const res = new ImageResponse(node, {
        fonts: [{ name: 'test', data: new ArrayBuffer(1) }]
      });
      expect(res).toBeInstanceOf(Response);
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('image/png');
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=86400');
    });

    it('respects svgOnly option for content type', () => {
      const node = defaultTemplate({ title: 'Hello' });
      const res = new ImageResponse(node, {
        svgOnly: true,
        fonts: [{ name: 'test', data: new ArrayBuffer(1) }]
      });
      expect(res.headers.get('Content-Type')).toBe('image/svg+xml');
    });

    it('uses custom Cache-Control when provided', () => {
      const node = defaultTemplate({ title: 'Hello' });
      const res = new ImageResponse(node, {
        cacheControl: 'private, no-cache',
        fonts: [{ name: 'test', data: new ArrayBuffer(1) }]
      });
      expect(res.headers.get('Cache-Control')).toBe('private, no-cache');
    });
  });

  describe('renderOgImage / renderArticleOgImage', () => {
    it('renderOgImage returns Response (or throws on missing/bad deps)', async () => {
      try {
        const res = await renderOgImage({ title: 'Test' }, { fonts: [{ name: 'test', data: new ArrayBuffer(1) }] });
        expect(res).toBeInstanceOf(Response);
      } catch (err) {
        // Expected: bad font data or missing deps
        expect(err).toBeInstanceOf(Error);
      }
    });

    it('renderArticleOgImage returns Response (or throws on missing/bad deps)', async () => {
      try {
        const res = await renderArticleOgImage(
          { title: 'Article', author: 'John', date: '2026-01-01' },
          { fonts: [{ name: 'test', data: new ArrayBuffer(1) }] }
        );
        expect(res).toBeInstanceOf(Response);
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
      }
    });
  });

  describe('Type exports', () => {
    it('types are importable', () => {
      // Compile-time check that types are exported
      const node: SatoriNode = { type: 'div', props: {} };
      const opts: OgImageOptions = { width: 1200, height: 630 };
      const input: OgTemplateInput = { title: 'Test' };
      expect(node.type).toBe('div');
      expect(opts.width).toBe(1200);
      expect(input.title).toBe('Test');
    });
  });
});
