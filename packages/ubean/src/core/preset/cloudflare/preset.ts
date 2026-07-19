import { definePreset } from '../_utils/preset';
import { createCapabilitySet } from '../capabilities';

const CLOUDFLARE_CAPABILITIES = createCapabilitySet({
  staticServe: true,
  websocket: true,
  sse: true,
  cronTriggers: true,
  queues: true,
  kv: true,
  storage: true,
  database: true,
  envVars: true,
  secrets: true,
  nodeCompat: false,
  streaming: true,
  compression: false,
  https: true,
  http2: false,
  middleware: true,
  bodyLimit: true,
  multipart: true,
  rpc: false
});

export const cloudflarePreset = definePreset(
  {
    capabilities: CLOUDFLARE_CAPABILITIES,
    entry: 'worker',
    exportConditions: ['workerd', 'worker'],
    build: {
      outputDir: 'dist/cloudflare',
      format: 'esm',
      minify: false,
      externals: ['hono', 'c12', 'citty', 'consola', 'defu', 'hookable', 'pathe', 'ufo', 'zod', 'cloudflare:workers'],
      rollupConfig: {
        external: ['cloudflare:*', 'node:*']
      }
    },
    output: {
      dir: 'dist/cloudflare',
      serverDir: 'dist/cloudflare',
      publicDir: 'dist/cloudflare/public'
    },
    runtime: {
      entry: 'worker/index.mjs',
      handler: 'fetch',
      compatibilityDate: '2024-09-01',
      compatibilityFlags: ['nodejs_compat']
    },
    wasm: {
      lazy: false,
      esmImport: true
    },
    serve: {
      host: 'localhost',
      port: 8787
    },
    commands: {
      preview: 'npx wrangler dev',
      deploy: 'npx wrangler deploy'
    },
    hooks: {
      'build:before': async () => {},
      compiled: async () => {}
    }
  },
  {
    name: 'cloudflare',
    aliases: ['cloudflare-pages', 'cloudflare-module', 'cf', 'wrangler', 'workers'],
    stdName: 'cloudflare_workers',
    dev: true,
    compatibilityDate: '2024-09-01'
  }
);

export const cloudflareDevPreset = definePreset(
  {
    extends: 'cloudflare',
    devServer: {
      runner: 'miniflare'
    }
  },
  {
    name: 'cloudflare-dev',
    aliases: ['cf-dev', 'wrangler-dev'],
    dev: true
  }
);

export interface WranglerConfig {
  name?: string;
  main?: string;
  compatibility_date?: string;
  compatibility_flags?: string[];
  workers_dev?: boolean;
  routes?: string[];
  kv_namespaces?: Array<{ binding: string; id?: string; preview_id?: string }>;
  vars?: Record<string, string>;
  secrets?: string[];
  queues?: {
    producers?: Array<{ binding: string; queue: string }>;
    consumers?: Array<{ queue: string }>;
  };
  d1_databases?: Array<{ binding: string; database_id?: string; preview_database_id?: string }>;
  r2_buckets?: Array<{ binding: string; bucket_name?: string; preview_bucket_name?: string }>;
  observability?: {
    enabled: boolean;
  };
  assets?: {
    directory?: string;
    binding?: string;
  };
}

export function generateWranglerConfig(options: {
  name: string;
  entry?: string;
  compatibilityDate?: string;
  compatibilityFlags?: string[];
  kvNamespaces?: Array<{ binding: string; id?: string }>;
  vars?: Record<string, string>;
  d1Databases?: Array<{ binding: string; databaseId?: string }>;
  r2Buckets?: Array<{ binding: string; bucketName?: string }>;
  queuesProducers?: Array<{ binding: string; queue: string }>;
  queuesConsumers?: Array<{ queue: string }>;
  assetsDir?: string;
  observability?: boolean;
}): WranglerConfig {
  const config: WranglerConfig = {
    name: options.name,
    main: options.entry || 'dist/cloudflare/worker/index.mjs',
    compatibility_date: options.compatibilityDate || '2024-09-01',
    compatibility_flags: options.compatibilityFlags || ['nodejs_compat'],
    workers_dev: true,
    observability: {
      enabled: options.observability ?? true
    }
  };

  if (options.kvNamespaces && options.kvNamespaces.length > 0) {
    config.kv_namespaces = options.kvNamespaces.map(ns => ({
      binding: ns.binding,
      id: ns.id
    }));
  }

  if (options.vars && Object.keys(options.vars).length > 0) {
    config.vars = options.vars;
  }

  if (options.d1Databases && options.d1Databases.length > 0) {
    config.d1_databases = options.d1Databases.map(db => ({
      binding: db.binding,
      database_id: db.databaseId
    }));
  }

  if (options.r2Buckets && options.r2Buckets.length > 0) {
    config.r2_buckets = options.r2Buckets.map(b => ({
      binding: b.binding,
      bucket_name: b.bucketName
    }));
  }

  if (options.queuesProducers && options.queuesProducers.length > 0) {
    config.queues = {
      ...config.queues,
      producers: options.queuesProducers
    };
  }

  if (options.queuesConsumers && options.queuesConsumers.length > 0) {
    config.queues = {
      ...config.queues,
      consumers: options.queuesConsumers
    };
  }

  if (options.assetsDir) {
    config.assets = {
      directory: options.assetsDir,
      binding: 'ASSETS'
    };
  }

  return config;
}

export function serializeWranglerToml(config: WranglerConfig): string {
  const lines: string[] = [];
  const indent = '';

  function push(key: string, value: unknown, prefix = '') {
    if (value === undefined || value === null) return;

    if (typeof value === 'string') {
      lines.push(`${prefix}${key} = "${escapeToml(value)}"`);
    } else if (typeof value === 'boolean') {
      lines.push(`${prefix}${key} = ${value}`);
    } else if (typeof value === 'number') {
      lines.push(`${prefix}${key} = ${value}`);
    } else if (Array.isArray(value)) {
      if (value.length === 0) return;
      if (typeof value[0] === 'string') {
        const items = value.map(v => `"${escapeToml(String(v))}"`).join(', ');
        lines.push(`${prefix}${key} = [${items}]`);
      } else {
        lines.push(`${prefix}[[${key}]]`);
        for (const item of value) {
          lines.push(
            `${prefix}  { ${Object.entries(item as Record<string, unknown>)
              .filter(([, v]) => v !== undefined && v !== null)
              .map(([k, v]) => {
                if (typeof v === 'string') return `${k} = "${escapeToml(v)}"`;
                if (typeof v === 'boolean') return `${k} = ${v}`;
                return `${k} = ${v}`;
              })
              .join(', ')} }`
          );
        }
      }
    } else if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const entries = Object.entries(obj).filter(([, v]) => v !== undefined && v !== null);
      if (entries.length === 0) return;
      lines.push(`${prefix}[${key}]`);
      for (const [k, v] of entries) {
        if (Array.isArray(v) && typeof v[0] !== 'string' && v.length > 0) {
          lines.push(`${prefix}[[${key}.${k}]]`);
          for (const item of v as Array<Record<string, unknown>>) {
            const itemEntries = Object.entries(item).filter(([, iv]) => iv !== undefined && iv !== null);
            lines.push(
              itemEntries
                .map(([ik, iv]) => {
                  if (typeof iv === 'string') return `${prefix}  ${ik} = "${escapeToml(iv)}"`;
                  return `${prefix}  ${ik} = ${iv}`;
                })
                .join('\n')
            );
          }
        } else if (typeof v === 'string') {
          lines.push(`${prefix}${k} = "${escapeToml(v)}"`);
        } else if (typeof v === 'boolean') {
          lines.push(`${prefix}${k} = ${v}`);
        } else if (typeof v === 'number') {
          lines.push(`${prefix}${k} = ${v}`);
        }
      }
    }
  }

  push('name', config.name);
  push('main', config.main);
  push('compatibility_date', config.compatibility_date);
  push('compatibility_flags', config.compatibility_flags);
  push('workers_dev', config.workers_dev);

  if (config.routes && config.routes.length > 0) {
    push('routes', config.routes);
  }

  if (config.assets) {
    push('assets', config.assets);
  }

  if (config.observability) {
    push('observability', config.observability);
  }

  if (config.kv_namespaces && config.kv_namespaces.length > 0) {
    for (const ns of config.kv_namespaces) {
      const nsLines: string[] = [`${indent}[[kv_namespaces]]`];
      if (ns.binding) nsLines.push(`${indent}binding = "${escapeToml(ns.binding)}"`);
      if (ns.id) nsLines.push(`${indent}id = "${escapeToml(ns.id)}"`);
      if (ns.preview_id) nsLines.push(`${indent}preview_id = "${escapeToml(ns.preview_id)}"`);
      lines.push(nsLines.join('\n'));
    }
  }

  if (config.vars && Object.keys(config.vars).length > 0) {
    lines.push(`${indent}[vars]`);
    for (const [k, v] of Object.entries(config.vars)) {
      lines.push(`${indent}${k} = "${escapeToml(v)}"`);
    }
  }

  if (config.d1_databases && config.d1_databases.length > 0) {
    for (const db of config.d1_databases) {
      const dbLines: string[] = [`${indent}[[d1_databases]]`];
      if (db.binding) dbLines.push(`${indent}binding = "${escapeToml(db.binding)}"`);
      if (db.database_id) dbLines.push(`${indent}database_id = "${escapeToml(db.database_id)}"`);
      if (db.preview_database_id)
        dbLines.push(`${indent}preview_database_id = "${escapeToml(db.preview_database_id)}"`);
      lines.push(dbLines.join('\n'));
    }
  }

  if (config.r2_buckets && config.r2_buckets.length > 0) {
    for (const b of config.r2_buckets) {
      const bLines: string[] = [`${indent}[[r2_buckets]]`];
      if (b.binding) bLines.push(`${indent}binding = "${escapeToml(b.binding)}"`);
      if (b.bucket_name) bLines.push(`${indent}bucket_name = "${escapeToml(b.bucket_name)}"`);
      if (b.preview_bucket_name) bLines.push(`${indent}preview_bucket_name = "${escapeToml(b.preview_bucket_name)}"`);
      lines.push(bLines.join('\n'));
    }
  }

  if (config.queues) {
    if (config.queues.producers && config.queues.producers.length > 0) {
      for (const p of config.queues.producers) {
        const pLines: string[] = [`${indent}[[queues.producers]]`];
        if (p.binding) pLines.push(`${indent}binding = "${escapeToml(p.binding)}"`);
        if (p.queue) pLines.push(`${indent}queue = "${escapeToml(p.queue)}"`);
        lines.push(pLines.join('\n'));
      }
    }
    if (config.queues.consumers && config.queues.consumers.length > 0) {
      for (const c of config.queues.consumers) {
        const cLines: string[] = [`${indent}[[queues.consumers]]`];
        if (c.queue) cLines.push(`${indent}queue = "${escapeToml(c.queue)}"`);
        lines.push(cLines.join('\n'));
      }
    }
  }

  return `${lines.join('\n')}\n`;
}

function escapeToml(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
