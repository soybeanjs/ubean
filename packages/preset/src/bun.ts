import { createCapabilitySet } from './capabilities';
import { definePreset } from './registry';

/**
 * Bun 能力矩阵
 *
 * Bun 是一个高性能 JavaScript 运行时,原生支持 Node.js API 和 TypeScript,
 * 内置 SQLite 数据库、bundler 和 test runner。支持 WebSocket / SSE / 流式响应,
 * 性能优于 Node.js,且完全兼容 Node.js 生态。
 */
const BUN_CAPABILITIES = createCapabilitySet({
  staticServe: true,
  websocket: true, // Bun 原生支持 WebSocket
  sse: true,
  cronTriggers: true, // Bun 支持 cron(通过 Bun.cron)
  queues: false, // Bun 无内置队列(需外部服务)
  kv: false, // Bun 无内置 KV(可用 SQLite 模拟)
  storage: true,
  database: true, // Bun 内置 SQLite (bun:sqlite)
  envVars: true,
  secrets: true,
  nodeCompat: true, // Bun 兼容大多数 Node.js API
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
 * Bun preset —— Bun 运行时模式
 *
 * 继承 Node preset 的全部能力,使用 Bun 运行时特性:
 * - 原生 TypeScript 支持(无需编译)
 * - 内置 SQLite (bun:sqlite)
 * - 原生 WebSocket (Bun.serve)
 * - 更快的启动和运行速度
 *
 * 构建输出:`dist/bun/server/index.mjs`
 * 预览命令:`bun run dist/bun/server/index.mjs`
 * 部署命令:`bun run dist/bun/server/index.mjs`
 */
export const bunPreset = definePreset(
  {
    extends: 'node',
    capabilities: BUN_CAPABILITIES,
    entry: 'server',
    exportConditions: ['bun'],
    build: {
      outputDir: 'dist/bun',
      format: 'esm',
      // Bun 原生支持 TypeScript,无需 bundle 依赖
      externals: ['hono', 'c12', 'citty', 'tslog', 'defu', 'hookable', 'pathe', 'ufo', 'zod', 'bun:sqlite']
    },
    output: {
      dir: 'dist/bun',
      serverDir: 'dist/bun/server',
      publicDir: 'dist/bun/public'
    },
    runtime: {
      entry: 'server/index.mjs',
      handler: 'handler',
      // Bun 特有运行时配置
      compatibilityDate: '2024-09-01'
    },
    serve: {
      host: 'localhost',
      port: 3000
    },
    commands: {
      preview: 'bun run dist/bun/server/index.mjs',
      deploy: 'bun run dist/bun/server/index.mjs'
    },
    hooks: {
      'build:before': async () => {},
      'build:after': async () => {}
    }
  },
  {
    name: 'bun',
    aliases: ['bun-runtime'],
    stdName: 'bun',
    dev: true,
    compatibilityDate: '2024-09-01',
    url: 'https://bun.sh/docs/api/http'
  }
);

/**
 * Bun 配置文件类型
 *
 * Bun 使用 `bunfig.toml` 进行配置(可选,大多数场景无需配置)。
 */
export interface BunfigConfig {
  install?: {
    registry?: string;
    lockfile?: boolean;
    production?: boolean;
  };
  test?: {
    coverage?: boolean;
    coverageThreshold?: number;
    preload?: string[];
  };
  macro?: Record<string, string>;
  bun?: {
    framework?: boolean;
  };
}

/**
 * 生成 Bunfig 配置对象
 */
export function generateBunfigConfig(options: {
  registry?: string;
  lockfile?: boolean;
  production?: boolean;
  preload?: string[];
}): BunfigConfig {
  const config: BunfigConfig = {};

  if (options.registry !== undefined || options.lockfile !== undefined || options.production !== undefined) {
    config.install = {};
    if (options.registry) config.install.registry = options.registry;
    if (options.lockfile !== undefined) config.install.lockfile = options.lockfile;
    if (options.production !== undefined) config.install.production = options.production;
  }

  if (options.preload && options.preload.length > 0) {
    config.test = {
      preload: options.preload
    };
  }

  return config;
}

/**
 * 序列化 Bunfig 配置为 TOML 字符串
 */
export function serializeBunfigConfig(config: BunfigConfig): string {
  const lines: string[] = [];

  if (config.install) {
    lines.push('[install]');
    if (config.install.registry) lines.push(`registry = "${escapeToml(config.install.registry)}"`);
    if (config.install.lockfile !== undefined) lines.push(`lockfile = ${config.install.lockfile}`);
    if (config.install.production !== undefined) lines.push(`production = ${config.install.production}`);
    lines.push('');
  }

  if (config.test) {
    lines.push('[test]');
    if (config.test.coverage !== undefined) lines.push(`coverage = ${config.test.coverage}`);
    if (config.test.coverageThreshold !== undefined) lines.push(`coverageThreshold = ${config.test.coverageThreshold}`);
    if (config.test.preload && config.test.preload.length > 0) {
      const preloads = config.test.preload.map(p => `"${escapeToml(p)}"`).join(', ');
      lines.push(`preload = [${preloads}]`);
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function escapeToml(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
