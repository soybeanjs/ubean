import type { UbeanEnv } from '@ubean/shared';
import type { Context, Hono } from 'hono';
import { generateSpecs } from 'hono-openapi';
import { describeActionsOpenApi } from './actions/openapi';

export interface OpenAPIGenerationOptions {
  title?: string;
  version?: string;
  description?: string;
  baseURL?: string;
}

/**
 * Scalar 文档页加载脚本的来源（jsdelivr）。
 *
 * 页面自己写死了这个 `<script src>`，因此它的来源也必须能被 CSP 声明 —— 由调用方（`@ubean/app`）
 * 从生效的 CSP 上追加该来源后，作为 {@link ScalarDocumentationOptions.contentSecurityPolicy}
 * 回传，避免「框架内置页面被框架自己的默认 CSP 拦掉」（2026-09-17 实测：默认 `script-src 'self'`
 * 让 DevTools 的 API Docs 面板整页空白）。
 */
export const SCALAR_SCRIPT_ORIGIN = 'https://cdn.jsdelivr.net';

export interface ScalarDocumentationOptions {
  scalarPath?: string;
  openAPIPath?: string;
  /**
   * Scalar 页面专用 CSP（来自调用方对生效 CSP 追加 {@link SCALAR_SCRIPT_ORIGIN} 的结果）。
   *
   * 省略（CSP 被关闭时）则不设头 —— 不会给「用户主动关掉 CSP」的应用重新加上 CSP。
   */
  contentSecurityPolicy?: string;
}

export function registerOpenAPIRoutes(
  app: Hono<UbeanEnv>,
  options: OpenAPIGenerationOptions & ScalarDocumentationOptions = {}
) {
  const { scalarPath = '/_scalar', openAPIPath = '/_openapi.json', title = 'API Reference' } = options;

  const documentation = {
    info: {
      title: options.title || 'UBEAN API',
      version: options.version || '1.0.0',
      description: options.description
    },
    servers: options.baseURL ? [{ url: options.baseURL }] : undefined
  };

  app.get(openAPIPath, async (c: Context<UbeanEnv>) => {
    const spec = await generateSpecs(app, { documentation });
    const { paths } = describeActionsOpenApi();
    return c.json({
      ...spec,
      paths: { ...spec.paths, ...paths }
    });
  });

  app.get(scalarPath, (c: Context<UbeanEnv>) => {
    // 该页面要从 CDN 取脚本，而应用的 CSP 是全局的：来源由调用方补进这份页面专用的 CSP。
    if (options.contentSecurityPolicy) {
      c.header('Content-Security-Policy', options.contentSecurityPolicy);
    }
    // `withDefaultFonts: false`：Scalar 默认会从 `fonts.scalar.com` 取一整套 Web 字体，而这类
    // 第三方字体请求会被应用的 CSP（`font-src 'self' data:`）全数拦掉 —— 关掉它既少一堆控制台
    // 报错，也让这页不依赖第三方字体。Scalar 的托管搜索索引（`api.scalar.com`）仍会被 CSP 拦住
    // （默认不向第三方开放 `connect-src`）；需要该功能时由用户在 CSP 里自行放行。
    const scalarHTML = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; }
    body { background: #0f0f12; }
  </style>
</head>
<body>
  <script
    id="api-reference"
    data-url="${openAPIPath}"
    data-configuration='{
      "theme": "purple",
      "layout": "modern",
      "hideClientButton": false,
      "defaultHttpClient": { "targetKey": "shell", "clientKey": "curl" },
      "withDefaultFonts": false
    }'
  ></script>
  <script src="${SCALAR_SCRIPT_ORIGIN}/npm/@scalar/api-reference"></script>
</body>
</html>`;
    return c.html(scalarHTML);
  });
}
