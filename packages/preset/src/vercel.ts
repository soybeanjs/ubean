import { createCapabilitySet } from './capabilities';
import { definePreset } from './registry';

/**
 * Vercel 能力矩阵
 *
 * Vercel 支持两种部署模式:
 * - **Serverless Functions**(`api/` 目录):Node.js 运行时,有冷启动,
 *   不支持 WebSocket / cron(无持久连接),支持大多数 Node.js API
 * - **Edge Functions**(基于 V8 isolates):无 Node.js 兼容,无 fs,
 *   支持流式响应,全球低延迟
 *
 * 默认按 Serverless Functions 配置(更通用);用户可通过 `extends: 'vercel-edge'`
 * 切换到 Edge 模式。
 */
const VERCEL_CAPABILITIES = createCapabilitySet({
  staticServe: true,
  websocket: false, // Serverless Functions 不支持 WebSocket
  sse: true,
  cronTriggers: true, // Vercel Cron Jobs
  queues: false,
  kv: true, // Vercel KV
  storage: true, // Vercel Blob
  database: true, // Vercel Postgres
  envVars: true,
  secrets: true,
  nodeCompat: true,
  streaming: true,
  compression: true,
  https: true,
  http2: true,
  middleware: true, // Vercel Middleware (Edge)
  bodyLimit: true,
  multipart: true,
  rpc: false
});

/**
 * Vercel Edge 能力矩阵
 *
 * Edge Functions 基于 V8 isolates,无 Node.js 兼容层,
 * 但支持流式响应和全球低延迟。
 */
const VERCEL_EDGE_CAPABILITIES = createCapabilitySet({
  staticServe: true,
  websocket: false,
  sse: true,
  cronTriggers: false,
  queues: false,
  kv: true,
  storage: true,
  database: false, // Edge 不支持直接 Postgres 连接
  envVars: true,
  secrets: true,
  nodeCompat: false,
  streaming: true,
  compression: false,
  https: true,
  http2: true,
  middleware: true,
  bodyLimit: true,
  multipart: false,
  rpc: false
});

/**
 * Vercel preset —— Serverless Functions 模式
 *
 * 构建输出:`dist/vercel/server/index.mjs`(供 Vercel 自动检测为 Serverless Function)
 * 预览命令:`vercel dev`
 * 部署命令:`vercel --prod`
 */
export const vercelPreset = definePreset(
  {
    extends: 'node',
    capabilities: VERCEL_CAPABILITIES,
    entry: 'server',
    exportConditions: ['vercel'],
    build: {
      outputDir: 'dist/vercel',
      format: 'esm',
      externals: ['hono', 'c12', 'citty', 'tslog', 'defu', 'hookable', 'pathe', 'ufo', 'zod']
    },
    output: {
      dir: 'dist/vercel',
      serverDir: 'dist/vercel/server',
      publicDir: 'dist/vercel/public'
    },
    runtime: {
      entry: 'server/index.mjs',
      handler: 'handler'
    },
    serve: {
      host: 'localhost',
      port: 3000
    },
    commands: {
      preview: 'vercel dev',
      deploy: 'vercel --prod'
    },
    hooks: {
      'build:before': async () => {},
      'build:after': async () => {}
    }
  },
  {
    name: 'vercel',
    aliases: ['vercel-serverless', 'vercel-node'],
    stdName: 'vercel',
    dev: true,
    compatibilityDate: '2024-09-01',
    url: 'https://vercel.com/docs/functions/serverless-functions'
  }
);

/**
 * Vercel Edge preset —— Edge Functions 模式
 *
 * 基于 V8 isolates,无 Node.js 兼容,全球低延迟。
 * 构建输出:`dist/vercel-edge/edge/index.mjs`
 */
export const vercelEdgePreset = definePreset(
  {
    extends: 'standard',
    capabilities: VERCEL_EDGE_CAPABILITIES,
    entry: 'worker',
    exportConditions: ['edge-light', 'vercel-edge'],
    build: {
      outputDir: 'dist/vercel-edge',
      format: 'esm',
      minify: true,
      externals: ['hono', 'c12', 'citty', 'tslog', 'defu', 'hookable', 'pathe', 'ufo', 'zod'],
      rollupConfig: {
        external: ['node:*']
      }
    },
    output: {
      dir: 'dist/vercel-edge',
      serverDir: 'dist/vercel-edge/edge',
      publicDir: 'dist/vercel-edge/public'
    },
    runtime: {
      entry: 'edge/index.mjs',
      handler: 'fetch',
      compatibilityDate: '2024-09-01'
    },
    serve: {
      host: 'localhost',
      port: 3000
    },
    commands: {
      preview: 'vercel dev',
      deploy: 'vercel --prod'
    }
  },
  {
    name: 'vercel-edge',
    aliases: ['vercel-edge-function'],
    stdName: 'vercel_edge',
    dev: true,
    compatibilityDate: '2024-09-01',
    url: 'https://vercel.com/docs/functions/edge-functions'
  }
);

/**
 * Vercel 配置文件(`vercel.json`)类型
 */
export interface VercelConfig {
  version?: number;
  builds?: Array<{
    src: string;
    use?: string;
    config?: Record<string, unknown>;
  }>;
  functions?: Record<
    string,
    {
      runtime?: string;
      memory?: number;
      maxDuration?: number;
      includeFiles?: string | string[];
      excludeFiles?: string | string[];
    }
  >;
  routes?: Array<{
    src: string;
    dest?: string;
    status?: number;
    headers?: Record<string, string>;
  }>;
  rewrites?: Array<{ source: string; destination: string }>;
  redirects?: Array<{ source: string; destination: string; permanent?: boolean }>;
  headers?: Array<{
    source: string;
    headers: Array<{ key: string; value: string }>;
  }>;
  cron?: Array<{
    path: string;
    schedule: string;
  }>;
  env?: Record<string, string>;
  build?: {
    env?: Record<string, string>;
    command?: string;
  };
}

/**
 * 生成 Vercel 配置对象
 */
export function generateVercelConfig(options: {
  entry?: string;
  functions?: Record<string, { maxDuration?: number; memory?: number }>;
  rewrites?: Array<{ source: string; destination: string }>;
  redirects?: Array<{ source: string; destination: string; permanent?: boolean }>;
  headers?: Array<{ source: string; headers: Record<string, string> }>;
  cron?: Array<{ path: string; schedule: string }>;
  env?: Record<string, string>;
}): VercelConfig {
  const entry = options.entry || 'dist/vercel/server/index.mjs';
  const config: VercelConfig = {
    version: 2,
    functions: {}
  };

  // 默认:将所有 API 路由映射到 serverless function
  config.functions![entry] = {
    memory: 1024,
    maxDuration: 10
  };

  if (options.functions) {
    for (const [path, opts] of Object.entries(options.functions)) {
      config.functions![path] = {
        memory: opts.memory ?? 1024,
        maxDuration: opts.maxDuration ?? 10
      };
    }
  }

  if (options.rewrites && options.rewrites.length > 0) {
    config.rewrites = options.rewrites;
  }

  if (options.redirects && options.redirects.length > 0) {
    config.redirects = options.redirects;
  }

  if (options.headers && options.headers.length > 0) {
    config.headers = options.headers.map(h => ({
      source: h.source,
      headers: Object.entries(h.headers).map(([key, value]) => ({ key, value }))
    }));
  }

  if (options.cron && options.cron.length > 0) {
    config.cron = options.cron;
  }

  if (options.env && Object.keys(options.env).length > 0) {
    config.env = options.env;
  }

  return config;
}

/**
 * 序列化 Vercel 配置为 JSON 字符串
 */
export function serializeVercelConfig(config: VercelConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}
