import type { Context, Hono } from 'hono';
import { openAPIRouteHandler } from 'hono-openapi';
import type { UbeanEnv } from '../../types/handler';

export interface OpenAPIGenerationOptions {
  title?: string;
  version?: string;
  description?: string;
  baseURL?: string;
}

export function registerOpenAPIRoutes(
  app: Hono<UbeanEnv>,
  options: OpenAPIGenerationOptions & { scalarPath?: string; openAPIPath?: string } = {}
) {
  const { scalarPath = '/_scalar', openAPIPath = '/_openapi.json', title = 'API Reference' } = options;

  const openapiHandler = openAPIRouteHandler(app, {
    documentation: {
      info: {
        title: options.title || 'UBEAN API',
        version: options.version || '1.0.0',
        description: options.description
      },
      servers: options.baseURL ? [{ url: options.baseURL }] : undefined
    }
  });

  app.get(openAPIPath, openapiHandler);

  app.get(scalarPath, (c: Context<UbeanEnv>) => {
    const scalarHTML = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    body { background: #0f0f12; }
  </style>
</head>
<body>
  <script
    id="api-reference"
    data-url="${openAPIPath}"
    data-configuration='{
      "theme": "purple",
      "darkMode": true,
      "layout": "modern",
      "hideClientButton": false,
      "defaultHttpClient": { "targetKey": "shell", "clientKey": "curl" }
    }'
  ></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`;
    return c.html(scalarHTML);
  });
}
