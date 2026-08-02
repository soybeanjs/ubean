import { createCapabilitySet } from './capabilities';
import { definePreset } from './registry';

/**
 * Azure 能力矩阵
 *
 * Azure Static Web Apps 使用 Azure Functions(Node.js 运行时)提供 API,
 * 有冷启动,不支持 WebSocket(Managed 模式),支持静态文件托管、
 * 自定义路由、认证集成。可通过 Azure CDN / Front Door 提供边缘缓存。
 */
const AZURE_CAPABILITIES = createCapabilitySet({
  staticServe: true, // 静态文件由 SWA 直接托管
  websocket: false, // Managed Functions 不支持 WebSocket
  sse: true,
  cronTriggers: true, // Azure Functions Timer Trigger
  queues: true, // Azure Storage Queues / Service Bus
  kv: true, // Azure Table Storage / Cosmos DB
  storage: true, // Azure Blob Storage
  database: true, // Azure SQL / Cosmos DB
  envVars: true,
  secrets: true, // Azure Key Vault
  nodeCompat: true,
  streaming: true,
  compression: true, // Azure CDN 压缩
  https: true,
  http2: true,
  middleware: true, // SWA 内置路由中间件
  bodyLimit: true,
  multipart: true,
  rpc: false
});

/**
 * Azure Static Web Apps preset
 *
 * 构建输出:`dist/azure/functions/index.mjs`(Azure Functions handler)
 * 预览命令:`swa start`(Azure SWA CLI 本地模拟)
 * 部署命令:`swa deploy`
 *
 * Azure Functions handler 签名:
 * ```typescript
 * export default async function handler(context, req) { ... };
 * ```
 */
export const azurePreset = definePreset(
  {
    extends: 'node',
    capabilities: AZURE_CAPABILITIES,
    entry: 'server',
    exportConditions: ['azure', 'azure-functions'],
    build: {
      outputDir: 'dist/azure',
      format: 'esm',
      externals: ['hono', 'c12', 'citty', 'consola', 'defu', 'hookable', 'pathe', 'ufo', 'zod', '@azure/*']
    },
    output: {
      dir: 'dist/azure',
      serverDir: 'dist/azure/functions',
      publicDir: 'dist/azure/public'
    },
    runtime: {
      entry: 'functions/index.mjs',
      handler: 'handler',
      compatibilityDate: '2024-09-01'
    },
    serve: {
      host: 'localhost',
      port: 4280 // Azure SWA CLI 默认端口
    },
    commands: {
      preview: 'swa start',
      deploy: 'swa deploy'
    },
    hooks: {
      'build:before': async () => {},
      'build:after': async () => {}
    }
  },
  {
    name: 'azure',
    aliases: ['azure-swa', 'azure-static-web-apps', 'swa', 'azure-functions'],
    stdName: 'azure_static_web_apps',
    dev: true,
    compatibilityDate: '2024-09-01',
    url: 'https://learn.microsoft.com/en-us/azure/static-web-apps/'
  }
);

/**
 * Azure Static Web Apps 配置文件(`staticwebapp.config.json`)类型
 *
 * 完整规范见:https://learn.microsoft.com/en-us/azure/static-web-apps/configuration
 */
export interface StaticWebAppConfig {
  navigationFallback?: {
    rewrite?: string;
    redirect?: string;
    statusCode?: number;
    exclude?: string[];
  };
  routes?: Array<{
    route: string;
    rewrite?: string;
    redirect?: string;
    statusCode?: number;
    methods?: string[];
    headers?: Record<string, string>;
    allowedRoles?: string[];
  }>;
  responseOverrides?: Record<
    string,
    {
      rewrite?: string;
      redirect?: string;
      statusCode?: number;
    }
  >;
  mimeTypes?: Record<string, string>;
  globalHeaders?: Record<string, string>;
  auth?: {
    identityProviders?: {
      azureActiveDirectory?: {
        registration?: {
          openIdIssuer?: string;
          clientIdSettingName?: string;
          clientSecretSettingName?: string;
        };
        userMetadata?: {
          issuer?: string;
        };
      };
    };
  };
  platform?: {
    apiRuntime?: string;
    apiRuntimeVersion?: string;
  };
}

/**
 * 生成 Azure Static Web Apps 配置对象
 */
export function generateStaticWebAppConfig(options: {
  apiEntry?: string;
  routes?: Array<{
    route: string;
    rewrite?: string;
    redirect?: string;
    statusCode?: number;
    methods?: string[];
    headers?: Record<string, string>;
  }>;
  navigationFallback?: string;
  globalHeaders?: Record<string, string>;
  apiRuntime?: string;
}): StaticWebAppConfig {
  const config: StaticWebAppConfig = {
    platform: {
      apiRuntime: options.apiRuntime || 'node:20'
    },
    routes: options.routes || [
      // 默认:API 路由转发到 Functions,其余走 SPA fallback
      {
        route: '/api/*',
        rewrite: options.apiEntry || '/api/functions'
      }
    ],
    navigationFallback: {
      rewrite: options.navigationFallback || '/index.html'
    }
  };

  if (options.globalHeaders && Object.keys(options.globalHeaders).length > 0) {
    config.globalHeaders = options.globalHeaders;
  }

  return config;
}

/**
 * 序列化 staticwebapp.config.json 为 JSON 字符串
 */
export function serializeStaticWebAppConfig(config: StaticWebAppConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}
