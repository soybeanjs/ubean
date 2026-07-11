import type { Context } from 'hono';
import type { ScannedApiRoute, ScannedMiddleware, RouteMeta } from '../../core/routing/types';
import type { UbeanEnv } from '../../types/handler';
import { isUbeanError, errorToResponse } from '../error';

export interface OpenAPIGenerationOptions {
  title?: string;
  version?: string;
  description?: string;
  baseURL?: string;
}

function inferParameters(
  routePath: string
): Array<{ name: string; in: 'path' | 'query'; required: boolean; schema: { type: string } }> {
  const params: Array<{ name: string; in: 'path' | 'query'; required: boolean; schema: { type: string } }> = [];
  const pathParamRegex = /:([A-Za-z_][A-Za-z0-9_]*)\??/g;
  let match: RegExpExecArray | null;
  while ((match = pathParamRegex.exec(routePath)) !== null) {
    const name = match[1];
    const isOptional = routePath.includes(`:${name}?`);
    params.push({
      name,
      in: 'path',
      required: !isOptional,
      schema: { type: 'string' }
    });
  }
  return params;
}

function methodToOperationId(method: string, path: string): string {
  const parts = path
    .split('/')
    .filter(Boolean)
    .map(p => p.replace(/^:/, 'by_').replace(/[^a-zA-Z0-9_]/g, '_'));
  return `${method.toLowerCase()}_${parts.join('_') || 'root'}`;
}

function generateOpenAPISpec(
  routes: ScannedApiRoute[],
  options: OpenAPIGenerationOptions = {}
): Record<string, unknown> {
  const { title = 'UBEAN API', version = '1.0.0', description = 'API documentation', baseURL = '/' } = options;

  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of routes) {
    const method = (route.method || 'get').toLowerCase();
    const openApiPath = route.route
      .replace(/\[(\.\.\.)?([^\]]+)\]/g, (_m, rest, name) => {
        if (rest) return `{${name}}`;
        return `{${name}}`;
      })
      .replace(/:([A-Za-z_][A-Za-z0-9_]*)\?/g, '{$1}')
      .replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, '{$1}');

    if (!paths[openApiPath]) {
      paths[openApiPath] = {};
    }

    const meta: RouteMeta = route.fileMeta || {};
    const openAPIMeta = meta.openAPI || {};

    const parameters = inferParameters(openApiPath);

    const operation: Record<string, unknown> = {
      operationId: openAPIMeta.operationId || methodToOperationId(method, openApiPath),
      summary: openAPIMeta.summary || `${method.toUpperCase()} ${openApiPath}`,
      description: openAPIMeta.description,
      tags: openAPIMeta.tags,
      deprecated: openAPIMeta.deprecated || false,
      parameters,
      responses: openAPIMeta.responses || {
        '200': { description: 'Successful response' }
      }
    };

    if (['post', 'put', 'patch'].includes(method)) {
      operation.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object' }
          }
        }
      };
    }

    if (meta.public === false) {
      operation.security = [{ bearerAuth: [] }];
    }

    Object.keys(operation).forEach(key => {
      if (operation[key] === undefined) delete operation[key];
    });

    paths[openApiPath][method] = operation;
  }

  const spec: Record<string, unknown> = {
    openapi: '3.1.0',
    info: {
      title,
      version,
      description
    },
    servers: [{ url: baseURL }],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    }
  };

  return spec;
}

export function registerOpenAPIRoutes(
  app: { get: (path: string, handler: (c: Context<UbeanEnv>) => Response | Promise<Response>) => void },
  routes: ScannedApiRoute[],
  _middlewares: ScannedMiddleware[],
  options: OpenAPIGenerationOptions & { scalarPath?: string; openAPIPath?: string } = {}
) {
  const { scalarPath = '/_scalar', openAPIPath = '/_openapi.json' } = options;

  const spec = generateOpenAPISpec(routes, options);

  app.get(openAPIPath, (c: Context<UbeanEnv>) => {
    try {
      return c.json(spec);
    } catch (err) {
      if (isUbeanError(err)) return errorToResponse(c, err);
      return errorToResponse(c, new Error(err instanceof Error ? err.message : String(err)));
    }
  });

  app.get(scalarPath, (c: Context<UbeanEnv>) => {
    const scalarHTML = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${options.title || 'API Reference'}</title>
</head>
<body>
  <script id="api-reference" data-url="${openAPIPath}"></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`;
    return c.html(scalarHTML);
  });
}
