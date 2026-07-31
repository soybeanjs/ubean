/**
 * P9-06 OG Image 动态生成
 *
 * 对齐 Next.js `ImageResponse`(基于 Satori + resvg)和 SvelteKit `@vercel/og`。
 *
 * 设计要点:
 * - **零硬依赖**:`satori` 和 `@resvg/resvg-js` 作为 optional peer 依赖,
 *   运行时通过动态 `import()` 加载。未安装时抛出明确的引导错误。
 * - **API 对齐 Next.js**:`ImageResponse` 类接收 Satori 兼容的 React-like
 *   元素树(此处用泛型 `unknown` 表示,因为 Satori 自身接受任意 VDOM),
 *   返回 PNG `Response`。
 * - **内置模板**:`renderOgImage(options)` 提供开箱即用的 OG 图模板,
 *   覆盖 80% 用例(博客/文章/产品页),无需手写 JSX。
 * - **字体加载**:提供 `loadDefaultFont()` 从内置 fetch 加载默认字体;
 *   `loadFontFromFile()`/`loadFontFromUrl()` 辅助自定义字体加载。
 *
 * 对齐:Next.js `ImageResponse` / `@vercel/og` / Astro `astro-og-image`。
 */
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'pathe';

/* -------------------------------------------------------------------------- */
/* 类型定义                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Satori 兼容的 VDOM 节点。Satori 接受 React-like 元素树,这里用最小化结构类型
 * 避免直接依赖 `satori` 类型(它是 optional peer 依赖)。
 *
 * 形状与 React.createElement 返回值兼容:`{ type, props: { children, style, ... } }`。
 */
export interface SatoriNode {
  type: string;
  props: {
    children?: SatoriNode | SatoriNode[] | string;
    style?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

/**
 * Satori 字体描述符。
 */
export interface SatoriFont {
  name: string;
  data: ArrayBuffer | Buffer;
  weight?: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
  style?: 'normal' | 'italic';
}

/**
 * `ImageResponse` / `renderOgImage` 共享的渲染选项。
 */
export interface OgImageOptions {
  /** 图像宽度(px)。默认 1200。 */
  width?: number;
  /** 图像高度(px)。默认 630。 */
  height?: number;
  /**
   * 字体列表。Satori 至少需要一个字体才能渲染。
   * 用 `loadDefaultFont()` / `loadFontFromFile()` / `loadFontFromUrl()` 生成。
   */
  fonts?: SatoriFont[];
  /**
   * 是否禁用 resvg 转换(只输出 SVG)。默认 false(输出 PNG)。
   * 适用于调试或对 PNG 转换有自定义需求的场景。
   */
  svgOnly?: boolean;
  /**
   * resvg 选项(透传给 `@resvg/resvg-js`)。可选。
   */
  resvgOptions?: Record<string, unknown>;
  /**
   * 响应的 Cache-Control header。默认 `public, max-age=86400`。
   */
  cacheControl?: string;
  /**
   * debug:开启 Satori debug 模式(输出额外日志)。默认 false。
   */
  debug?: boolean;
}

/**
 * 内置模板的输入参数。
 */
export interface OgTemplateInput {
  /** 主标题(必填)。 */
  title: string;
  /** 副标题/描述。 */
  description?: string;
  /** 站点/作者名(显示在底部)。 */
  siteName?: string;
  /** Logo URL 或域名(显示在左上角)。 */
  logo?: string;
  /** 主题色(用于背景渐变)。 */
  themeColor?: string;
  /** 文本颜色。默认 `#ffffff`。 */
  textColor?: string;
  /** 背景图片 URL(可选,覆盖渐变)。 */
  backgroundImage?: string;
}

const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 630;
const DEFAULT_CACHE_CONTROL = 'public, max-age=86400';

/* -------------------------------------------------------------------------- */
/* 字体加载                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * 默认字体 URL(使用 Google Fonts 的 Inter 字体,常规字重 400)。
 *
 * 在生产环境建议使用 `loadFontFromFile()` 加载本地字体,避免运行时网络依赖。
 */
export const DEFAULT_FONT_URL = 'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMa1ZL7.woff2';

/**
 * 默认字体名。
 */
export const DEFAULT_FONT_NAME = 'Inter';

/**
 * 从 URL 加载字体(返回 Satori 兼容的 `SatoriFont`)。
 *
 * @example
 * ```ts
 * const font = await loadFontFromUrl('https://fonts.gstatic.com/.../inter.woff2', 'Inter');
 * ```
 */
export async function loadFontFromUrl(
  url: string,
  name: string,
  weight: SatoriFont['weight'] = 400,
  fontStyle: SatoriFont['style'] = 'normal'
): Promise<SatoriFont> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load font from ${url}: ${res.status} ${res.statusText}`);
  }
  const data = await res.arrayBuffer();
  return { name, data, weight, style: fontStyle };
}

/**
 * 从本地文件加载字体。
 *
 * @example
 * ```ts
 * const font = loadFontFromFile('./fonts/inter-regular.woff2', 'Inter');
 * ```
 */
export function loadFontFromFile(
  path: string,
  name: string,
  weight: SatoriFont['weight'] = 400,
  fontStyle: SatoriFont['style'] = 'normal'
): SatoriFont {
  const absPath = isAbsolute(path) ? path : resolve(process.cwd(), path);
  const data = readFileSync(absPath);
  return { name, data, weight, style: fontStyle };
}

/**
 * 加载默认字体(Inter Regular,从 Google Fonts CDN 拉取)。
 *
 * 注意:此函数依赖网络访问。Cloudflare Workers 等边缘环境需要 fetch API 可用。
 * 离线/生产环境推荐用 `loadFontFromFile()` 替代。
 */
export function loadDefaultFont(): Promise<SatoriFont> {
  return loadFontFromUrl(DEFAULT_FONT_URL, DEFAULT_FONT_NAME, 400);
}

/* -------------------------------------------------------------------------- */
/* 内置模板                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * 默认 OG 图模板:渐变背景 + 居中标题 + 副标题 + 底部站点名。
 *
 * 返回 Satori 兼容的 VDOM 树。
 */
export function defaultTemplate(input: OgTemplateInput): SatoriNode {
  const themeColor = input.themeColor || '#0f172a';
  const textColor = input.textColor || '#ffffff';

  const children: SatoriNode[] = [];

  // 中间内容容器(标题 + 可选描述),始终用数组结构以便追加
  const contentChildren: SatoriNode[] = [
    {
      type: 'div',
      props: {
        style: {
          fontSize: input.title.length > 60 ? '52px' : '72px',
          fontWeight: 700,
          lineHeight: 1.2,
          textAlign: 'center',
          color: textColor,
          maxWidth: '1000px'
        },
        children: input.title
      }
    }
  ];

  if (input.description) {
    contentChildren.push({
      type: 'div',
      props: {
        style: {
          fontSize: '32px',
          marginTop: '24px',
          color: textColor,
          opacity: 0.8,
          textAlign: 'center',
          maxWidth: '900px',
          lineHeight: 1.4
        },
        children: input.description
      }
    });
  }

  // 主标题容器
  children.push({
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flexGrow: 1,
        padding: ['0', '80px']
      },
      children: contentChildren
    }
  });

  // 底部站点名
  if (input.siteName) {
    children.push({
      type: 'div',
      props: {
        style: {
          display: 'flex',
          alignItems: 'center',
          padding: ['0', '80px', '60px', '80px'],
          fontSize: '28px',
          color: textColor,
          opacity: 0.7
        },
        children: input.siteName
      }
    });
  }

  // 左上角 logo(文本)
  if (input.logo) {
    children.unshift({
      type: 'div',
      props: {
        style: {
          display: 'flex',
          alignItems: 'center',
          padding: ['60px', '80px', '0', '80px'],
          fontSize: '28px',
          fontWeight: 600,
          color: textColor
        },
        children: input.logo
      }
    });
  }

  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: themeColor,
        backgroundImage: input.backgroundImage
          ? `url(${input.backgroundImage})`
          : `linear-gradient(135deg, ${themeColor} 0%, ${shadeColor(themeColor, -20)} 100%)`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        fontFamily: DEFAULT_FONT_NAME
      },
      children
    }
  };
}

/**
 * 文章模板:左对齐标题 + 日期/作者元信息。
 */
export function articleTemplate(input: OgTemplateInput & { author?: string; date?: string }): SatoriNode {
  const themeColor = input.themeColor || '#1e293b';
  const textColor = input.textColor || '#ffffff';

  // 顶部:站点名(可选)
  const topSection: SatoriNode | null = input.siteName
    ? {
        type: 'div',
        props: {
          style: {
            fontSize: '28px',
            fontWeight: 600,
            color: textColor,
            opacity: 0.7
          },
          children: input.siteName
        }
      }
    : null;

  // 中间:标题 + 可选描述
  const middleContent: SatoriNode[] = [
    {
      type: 'div',
      props: {
        style: {
          fontSize: input.title.length > 80 ? '48px' : '64px',
          fontWeight: 700,
          lineHeight: 1.2,
          color: textColor,
          maxWidth: '1000px'
        },
        children: input.title
      }
    }
  ];
  if (input.description) {
    middleContent.push({
      type: 'div',
      props: {
        style: {
          fontSize: '30px',
          marginTop: '24px',
          color: textColor,
          opacity: 0.8,
          maxWidth: '900px',
          lineHeight: 1.4
        },
        children: input.description
      }
    });
  }
  const middleSection: SatoriNode = {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        flexGrow: 1,
        justifyContent: 'center'
      },
      children: middleContent
    }
  };

  // 底部:作者 + 日期
  const footerText = [input.author, input.date].filter(Boolean).join(' · ');
  const footerSection: SatoriNode = {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        alignItems: 'center',
        fontSize: '26px',
        color: textColor,
        opacity: 0.7
      },
      children: footerText
    }
  };

  const allChildren: SatoriNode[] = [topSection, middleSection, footerSection].filter(
    (c): c is SatoriNode => c !== null
  );

  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        padding: '80px',
        backgroundColor: themeColor,
        backgroundImage: `linear-gradient(135deg, ${themeColor} 0%, ${shadeColor(themeColor, -25)} 100%)`,
        fontFamily: DEFAULT_FONT_NAME
      },
      children: allChildren
    }
  };
}

/**
 * 简单的颜色调亮/调暗工具(用于生成渐变背景)。
 *
 * `percent` 为负数调暗,正数调亮。范围 -100..100。
 */
export function shadeColor(hex: string, percent: number): string {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return hex;
  const num = parseInt(normalized, 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, Math.min(255, (num >> 16) + amt));
  const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00ff) + amt));
  const B = Math.max(0, Math.min(255, (num & 0x0000ff) + amt));
  return `#${((R << 16) | (G << 8) | B).toString(16).padStart(6, '0')}`;
}

/* -------------------------------------------------------------------------- */
/* 核心渲染                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * 动态加载 satori。若未安装抛出友好错误。
 */
async function loadSatori(): Promise<(node: unknown, options: unknown) => Promise<string>> {
  try {
    const mod = await import('satori');
    return (mod.default || mod) as (node: unknown, options: unknown) => Promise<string>;
  } catch {
    throw new Error(
      '[ubean/seo] OG image rendering requires `satori` to be installed.\n' +
        'Install it with: pnpm add satori @resvg/resvg-js\n' +
        '(Both are optional peer dependencies of @ubean/seo to keep the base bundle small.)'
    );
  }
}

/**
 * 动态加载 @resvg/resvg-js。若未安装抛出友好错误。
 */
async function loadResvg(): Promise<{
  Resvg: new (
    svg: string,
    options?: Record<string, unknown>
  ) => {
    render(): { asPng: Buffer };
  };
}> {
  try {
    return (await import('@resvg/resvg-js')) as unknown as {
      Resvg: new (
        svg: string,
        options?: Record<string, unknown>
      ) => {
        render(): { asPng: Buffer };
      };
    };
  } catch {
    throw new Error(
      '[ubean/seo] PNG conversion requires `@resvg/resvg-js` to be installed.\n' +
        'Install it with: pnpm add @resvg/resvg-js\n' +
        '(Optional peer dependency of @ubean/seo.)'
    );
  }
}

/**
 * 把 Satori VDOM 节点渲染为 PNG Buffer(或 SVG 字符串,当 `svgOnly: true` 时)。
 *
 * @returns `{ body, contentType }` —— body 为 Buffer/字符串,contentType 为 MIME 类型
 */
export async function renderToImage(
  node: SatoriNode,
  options: OgImageOptions = {}
): Promise<{ body: Buffer | string; contentType: string }> {
  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  const fonts = options.fonts && options.fonts.length > 0 ? options.fonts : [await loadDefaultFont()];

  const satori = await loadSatori();
  const svg = await satori(node, {
    width,
    height,
    fonts,
    debug: options.debug ?? false
  });

  if (options.svgOnly) {
    return { body: svg, contentType: 'image/svg+xml' };
  }

  const { Resvg } = await loadResvg();
  const resvg = new Resvg(svg, options.resvgOptions);
  const { asPng } = resvg.render();
  return { body: asPng, contentType: 'image/png' };
}

/* -------------------------------------------------------------------------- */
/* ImageResponse —— 对齐 Next.js API                                          */
/* -------------------------------------------------------------------------- */

/**
 * 对齐 Next.js `ImageResponse` 类。接收 Satori VDOM 节点,返回 PNG `Response`。
 *
 * 实现策略:body 使用 `ReadableStream`,在 stream 被 consume 时才执行实际的
 * satori + resvg 渲染。这样构造函数可以保持同步,符合 Next.js
 * `return new ImageResponse(...)` 的用法。
 *
 * @example
 * ```ts
 * // src/routes/og.ts
 * import { ImageResponse, defaultTemplate, loadDefaultFont } from '@ubean/seo/og-image';
 *
 * export const GET = defineHandler(async () => {
 *   const fonts = [await loadDefaultFont()];
 *   const node = defaultTemplate({ title: 'Hello ubean', siteName: 'ubean' });
 *   return new ImageResponse(node, { fonts });
 * });
 * ```
 *
 * 也可用于 `src/opengraph-image.ts` 约定文件:
 * ```ts
 * // src/opengraph-image.ts
 * import { ImageResponse, defaultTemplate, loadDefaultFont } from '@ubean/seo/og-image';
 * export default async function GET() {
 *   const fonts = [await loadDefaultFont()];
 *   return new ImageResponse(defaultTemplate({ title: 'ubean' }), { fonts });
 * }
 * ```
 */
export class ImageResponse extends Response {
  constructor(node: SatoriNode, options: OgImageOptions = {}) {
    const cacheControl = options.cacheControl ?? DEFAULT_CACHE_CONTROL;
    // 用 ReadableStream 实现"懒渲染":渲染只在 stream 被 consume 时启动,
    // 这样 `return new ImageResponse(...)` 不需要在构造时阻塞。
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const { body } = await renderToImage(node, options);
          if (typeof body === 'string') {
            controller.enqueue(new TextEncoder().encode(body));
          } else {
            controller.enqueue(new Uint8Array(body));
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      }
    });

    super(stream, {
      status: 200,
      headers: {
        'Content-Type': options.svgOnly ? 'image/svg+xml' : 'image/png',
        'Cache-Control': cacheControl
      }
    });
  }
}

/* -------------------------------------------------------------------------- */
/* 高级辅助函数                                                                */
/* -------------------------------------------------------------------------- */

/**
 * 一步到位渲染 OG 图(模板 + 渲染 + Response)。
 *
 * @example
 * ```ts
 * // src/routes/og.ts
 * import { renderOgImage } from '@ubean/seo/og-image';
 * export const GET = defineHandler(async () => {
 *   return renderOgImage({ title: 'Hello world', siteName: 'ubean' });
 * });
 * ```
 */
export async function renderOgImage(input: OgTemplateInput, options: OgImageOptions = {}): Promise<Response> {
  const node = defaultTemplate(input);
  const { body, contentType } = await renderToImage(node, options);
  const cacheControl = options.cacheControl ?? DEFAULT_CACHE_CONTROL;
  return new Response(body as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': cacheControl
    }
  });
}

/**
 * 用文章模板渲染 OG 图。
 */
export async function renderArticleOgImage(
  input: OgTemplateInput & { author?: string; date?: string },
  options: OgImageOptions = {}
): Promise<Response> {
  const node = articleTemplate(input);
  const { body, contentType } = await renderToImage(node, options);
  const cacheControl = options.cacheControl ?? DEFAULT_CACHE_CONTROL;
  return new Response(body as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': cacheControl
    }
  });
}

/**
 * 检测运行时是否安装了 OG 图渲染所需的依赖。
 * 用于在不实际渲染的情况下判断能力可用性(例如 DevTools 信息展示)。
 */
export async function isOgImageSupported(): Promise<boolean> {
  try {
    await import('satori');
    await import('@resvg/resvg-js');
    return true;
  } catch {
    return false;
  }
}
