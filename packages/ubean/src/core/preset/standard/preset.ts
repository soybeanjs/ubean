import { definePreset } from '../_utils/preset';

export const standardPreset = definePreset({
  name: 'standard',
  build: {
    outputDir: '.ubean/dist',
    format: 'esm',
    externals: ['hono', 'c12', 'citty', 'consola', 'defu', 'hookable', 'pathe', 'ufo', 'zod']
  },
  runtime: {
    entry: 'server'
  }
});
