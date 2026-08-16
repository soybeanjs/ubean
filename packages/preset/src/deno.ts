import { createCapabilitySet } from './capabilities';
import { definePreset } from './registry';

/**
 * Deno 能力矩阵
 *
 * Deno 是一个安全的 JavaScript/TypeScript 运行时,原生支持 TypeScript,
 * 内置 KV (Deno KV)、cron (Deno.cron)、队列 (Deno.Queue)。
 * 支持 WebSocket / SSE / 流式响应,但部分 Node.js API 兼容性有限。
 */
const DENO_CAPABILITIES = createCapabilitySet({
  staticServe: true,
  websocket: true, // Deno 原生支持 WebSocket
  sse: true,
  cronTriggers: true, // Deno.cron
  queues: true, // Deno.Queue (Deno Deploy)
  kv: true, // Deno KV
  storage: true,
  database: true, // 通过外部驱动或 Deno KV
  envVars: true,
  secrets: true,
  nodeCompat: true, // Deno 2.0 大幅改善 Node.js 兼容性
  streaming: true,
  compression: true,
  https: true,
  http2: true,
  middleware: true,
  bodyLimit: true,
  multipart: true,
  rpc: false
});

/**
 * Deno preset —— Deno 运行时模式
 *
 * 继承 Node preset 的配置,使用 Deno 运行时特性:
 * - 原生 TypeScript 支持(无需编译)
 * - 内置 Deno KV / Deno.cron / Deno.Queue
 * - 原生 WebSocket (Deno.serve)
 * - 安全沙箱(默认无文件系统/网络访问,需显式授权)
 *
 * 构建输出:`dist/deno/server/index.mjs`
 * 预览命令:`deno run --allow-net dist/deno/server/index.mjs`
 * 部署命令:`deno run --allow-net dist/deno/server/index.mjs`
 */
export const denoPreset = definePreset(
  {
    extends: 'node',
    capabilities: DENO_CAPABILITIES,
    entry: 'server',
    exportConditions: ['deno'],
    build: {
      outputDir: 'dist/deno',
      format: 'esm',
      // Deno 原生支持 TypeScript,无需 bundle 依赖
      externals: ['hono', 'c12', 'citty', 'tslog', 'defu', 'hookable', 'pathe', 'ufo', 'zod', 'node:*']
    },
    output: {
      dir: 'dist/deno',
      serverDir: 'dist/deno/server',
      publicDir: 'dist/deno/public'
    },
    runtime: {
      entry: 'server/index.mjs',
      handler: 'handler',
      compatibilityDate: '2024-09-01'
    },
    serve: {
      host: 'localhost',
      port: 8000
    },
    commands: {
      preview: 'deno run --allow-net --allow-env --allow-read dist/deno/server/index.mjs',
      deploy: 'deno run --allow-net --allow-env --allow-read dist/deno/server/index.mjs'
    },
    hooks: {
      'build:before': async () => {},
      'build:after': async () => {}
    }
  },
  {
    name: 'deno',
    aliases: ['deno-deploy', 'deno-runtime'],
    stdName: 'deno',
    dev: true,
    compatibilityDate: '2024-09-01',
    url: 'https://docs.deno.com/runtime/manual'
  }
);

/**
 * Deno 配置文件类型
 *
 * Deno 使用 `deno.json` / `deno.jsonc` 进行配置。
 */
export interface DenoConfig {
  tasks?: Record<string, string>;
  importMap?: string;
  compilerOptions?: {
    strict?: boolean;
    lib?: string[];
    jsx?: 'jsx' | 'react-jsx' | 'react-jsxdev' | 'preserve';
    jsxImportSource?: string;
  };
  lint?:
    | boolean
    | {
        files?: {
          include?: string[];
          exclude?: string[];
        };
        rules?: Record<string, 'deny' | 'warn' | 'off'>;
      };
  fmt?:
    | boolean
    | {
        files?: {
          include?: string[];
          exclude?: string[];
        };
        options?: {
          indentWidth?: number;
          lineWidth?: number;
          singleQuote?: boolean;
          semiColons?: boolean;
        };
      };
  lock?: string | false;
  nodeModulesDir?: boolean;
  vendor?: boolean;
  unstable?: string[];
}

/**
 * 生成 Deno 配置对象
 *
 * @param options.lock - 传 `false` 禁用 lockfile,传字符串指定 lockfile 路径
 */
export function generateDenoConfig(options: {
  tasks?: Record<string, string>;
  importMap?: string;
  lock?: string | false;
  nodeModulesDir?: boolean;
  unstable?: string[];
}): DenoConfig {
  const config: DenoConfig = {};

  if (options.tasks) {
    config.tasks = options.tasks;
  }

  if (options.importMap) {
    config.importMap = options.importMap;
  }

  if (options.lock !== undefined) {
    config.lock = options.lock;
  }

  if (options.nodeModulesDir !== undefined) {
    config.nodeModulesDir = options.nodeModulesDir;
  }

  if (options.unstable && options.unstable.length > 0) {
    config.unstable = options.unstable;
  }

  return config;
}

/**
 * 序列化 Deno 配置为 JSON 字符串
 */
export function serializeDenoConfig(config: DenoConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}
