import { NODE_CAPABILITIES } from './capabilities';
import { definePreset } from './registry';

export const nodePreset = definePreset(
  {
    extends: 'standard',
    capabilities: NODE_CAPABILITIES,
    build: {
      outputDir: 'dist',
      format: 'esm',
      externals: [
        'hono',
        'c12',
        'citty',
        'tslog',
        'defu',
        'hookable',
        'pathe',
        'ufo',
        'zod',
        'mlly',
        'rou3',
        'scule',
        'tinyglobby',
        'ofetch',
        '@standard-schema/spec'
      ]
    },
    runtime: {
      entry: 'server/index.mjs',
      handler: 'handler'
    },
    serve: {
      host: 'localhost',
      port: 9527
    },
    commands: {
      preview: 'node dist/server/server.mjs'
    }
  },
  {
    name: 'node',
    aliases: ['node-server', 'nodedev'],
    stdName: 'node',
    dev: true,
    compatibilityDate: '2024-09-01'
  }
);
