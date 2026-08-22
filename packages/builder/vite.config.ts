import { defineConfig } from 'vite-plus';

export default defineConfig({
  resolve: {
    tsconfigPaths: true
  },
  pack: {
    dts: true,
    clean: true,
    format: ['esm'],
    fixedExtension: false,
    outDir: 'dist',
    entry: [
      'src/index.ts',
      'src/vite.ts',
      'src/vue.ts',
      'src/production.ts',
      'src/prerender.ts',
      'src/codegen/index.ts',
      'src/actions-plugin.ts'
    ],
    deps: {
      neverBundle: [/^@ubean\//, /^node:/, 'openapi-typescript', 'pathe', 'unimport', 'tinyglobby']
    }
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node'
  }
});
