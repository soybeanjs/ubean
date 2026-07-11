import { definePreset } from '../_utils/preset';
import { NODE_CAPABILITIES } from '../capabilities';

export const nodePreset = definePreset({
  name: 'node',
  capabilities: NODE_CAPABILITIES,
  build: {
    outputDir: '.ubean/dist',
    format: 'esm',
    externals: [
      'hono',
      'c12',
      'citty',
      'consola',
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
    port: 3000
  },
  commands: {
    preview: 'node .ubean/dist/server/index.mjs'
  }
});
