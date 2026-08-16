import { STANDARD_CAPABILITIES } from './capabilities';
import { definePreset } from './registry';

export const standardPreset = definePreset(
  {
    capabilities: STANDARD_CAPABILITIES,
    build: {
      outputDir: 'dist',
      format: 'esm',
      externals: ['hono', 'c12', 'citty', 'tslog', 'defu', 'hookable', 'pathe', 'ufo', 'zod']
    },
    runtime: {
      entry: 'server'
    },
    serve: {
      host: 'localhost',
      port: 9527
    }
  },
  {
    name: 'standard',
    aliases: ['default'],
    static: false,
    dev: true
  }
);
