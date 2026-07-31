import { createCapabilitySet } from './capabilities';
import { definePreset } from './registry';

/**
 * Netlify 能力矩阵
 *
 * Netlify Functions 基于 AWS Lambda(Node.js 运行时),有冷启动,
 * 不支持 WebSocket / 持久连接,但支持 Scheduled Functions(cron)。
 * Netlify 也支持 Edge Functions(Deno 运行时),但此处按 Functions 模式配置。
 */
const NETLIFY_CAPABILITIES = createCapabilitySet({
  staticServe: true,
  websocket: false, // Lambda 不支持 WebSocket
  sse: true,
  cronTriggers: true, // Netlify Scheduled Functions
  queues: false,
  kv: true, // Netlify Blobs
  storage: true,
  database: true, // Netlify 通过环境变量支持外部数据库
  envVars: true,
  secrets: true,
  nodeCompat: true,
  streaming: true,
  compression: true,
  https: true,
  http2: true,
  middleware: true, // Netlify Edge Middleware (Deno)
  bodyLimit: true,
  multipart: true,
  rpc: false
});

/**
 * Netlify preset —— Netlify Functions 模式
 *
 * 构建输出:`dist/netlify/functions/index.mjs`(Netlify 自动检测 `functions/` 目录)
 * 预览命令:`netlify dev`
 * 部署命令:`netlify deploy --prod`
 */
export const netlifyPreset = definePreset(
  {
    extends: 'node',
    capabilities: NETLIFY_CAPABILITIES,
    entry: 'server',
    exportConditions: ['netlify'],
    build: {
      outputDir: 'dist/netlify',
      format: 'esm',
      externals: ['hono', 'c12', 'citty', 'consola', 'defu', 'hookable', 'pathe', 'ufo', 'zod']
    },
    output: {
      dir: 'dist/netlify',
      serverDir: 'dist/netlify/functions',
      publicDir: 'dist/netlify/public'
    },
    runtime: {
      entry: 'functions/index.mjs',
      handler: 'handler'
    },
    serve: {
      host: 'localhost',
      port: 8888
    },
    commands: {
      preview: 'netlify dev',
      deploy: 'netlify deploy --prod'
    },
    hooks: {
      'build:before': async () => {},
      'build:after': async () => {}
    }
  },
  {
    name: 'netlify',
    aliases: ['netlify-functions', 'netlify-node'],
    stdName: 'netlify',
    dev: true,
    compatibilityDate: '2024-09-01',
    url: 'https://docs.netlify.com/functions/overview/'
  }
);

/**
 * Netlify 配置文件(`netlify.toml`)类型
 */
export interface NetlifyConfig {
  build?: {
    command?: string;
    publish?: string;
    functions?: string;
    environment?: Record<string, string>;
  };
  functions?: {
    directory?: string;
    node_bundler?: 'esbuild' | 'zisi' | 'nft';
    external_node_modules?: string[];
    included_files?: string[];
    excluded_files?: string[];
  };
  redirects?: Array<{
    from: string;
    to: string;
    status?: number;
    force?: boolean;
  }>;
  headers?: Array<{
    for: string;
    values: Record<string, string>;
  }>;
}

/**
 * 生成 Netlify 配置对象
 */
export function generateNetlifyConfig(options: {
  functionsDir?: string;
  publishDir?: string;
  buildCommand?: string;
  redirects?: Array<{ from: string; to: string; status?: number; force?: boolean }>;
  headers?: Array<{ for: string; values: Record<string, string> }>;
  environment?: Record<string, string>;
}): NetlifyConfig {
  const config: NetlifyConfig = {
    build: {
      command: options.buildCommand || 'pnpm build',
      publish: options.publishDir || 'dist/netlify/public',
      functions: options.functionsDir || 'dist/netlify/functions'
    },
    functions: {
      directory: options.functionsDir || 'dist/netlify/functions',
      node_bundler: 'esbuild'
    }
  };

  if (options.redirects && options.redirects.length > 0) {
    config.redirects = options.redirects;
  }

  if (options.headers && options.headers.length > 0) {
    config.headers = options.headers;
  }

  if (options.environment && Object.keys(options.environment).length > 0) {
    config.build!.environment = options.environment;
  }

  return config;
}

/**
 * 序列化 Netlify 配置为 TOML 字符串
 */
export function serializeNetlifyConfig(config: NetlifyConfig): string {
  const lines: string[] = [];

  // [build]
  if (config.build) {
    lines.push('[build]');
    if (config.build.command) lines.push(`command = "${escapeToml(config.build.command)}"`);
    if (config.build.publish) lines.push(`publish = "${escapeToml(config.build.publish)}"`);
    if (config.build.functions) lines.push(`functions = "${escapeToml(config.build.functions)}"`);
    if (config.build.environment) {
      lines.push('');
      lines.push('[build.environment]');
      for (const [k, v] of Object.entries(config.build.environment)) {
        lines.push(`${k} = "${escapeToml(v)}"`);
      }
    }
    lines.push('');
  }

  // [functions]
  if (config.functions) {
    lines.push('[functions]');
    if (config.functions.directory) lines.push(`directory = "${escapeToml(config.functions.directory)}"`);
    if (config.functions.node_bundler) lines.push(`node_bundler = "${config.functions.node_bundler}"`);
    if (config.functions.external_node_modules && config.functions.external_node_modules.length > 0) {
      const mods = config.functions.external_node_modules.map(m => `"${escapeToml(m)}"`).join(', ');
      lines.push(`external_node_modules = [${mods}]`);
    }
    lines.push('');
  }

  // [[redirects]]
  if (config.redirects) {
    for (const r of config.redirects) {
      lines.push('[[redirects]]');
      lines.push(`from = "${escapeToml(r.from)}"`);
      lines.push(`to = "${escapeToml(r.to)}"`);
      if (r.status) lines.push(`status = ${r.status}`);
      if (r.force) lines.push(`force = ${r.force}`);
      lines.push('');
    }
  }

  // [[headers]]
  if (config.headers) {
    for (const h of config.headers) {
      lines.push('[[headers]]');
      lines.push(`for = "${escapeToml(h.for)}"`);
      lines.push('[headers.values]');
      for (const [k, v] of Object.entries(h.values)) {
        lines.push(`"${k}" = "${escapeToml(v)}"`);
      }
      lines.push('');
    }
  }

  return `${lines.join('\n')}\n`;
}

function escapeToml(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
