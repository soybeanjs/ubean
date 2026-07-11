import { definePreset } from '../_utils/preset';
import { STANDARD_CAPABILITIES } from '../capabilities';

export const standardPreset = definePreset({
  name: 'standard',
  capabilities: STANDARD_CAPABILITIES,
  build: {
    outputDir: '.ubean/dist',
    format: 'esm',
    externals: ['hono', 'c12', 'citty', 'consola', 'defu', 'hookable', 'pathe', 'ufo', 'zod']
  },
  runtime: {
    entry: 'server'
  }
});
