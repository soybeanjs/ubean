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
    entry: ['src/index.ts', 'src/node.ts', 'src/logger/index.ts', 'src/logger/hono.ts'],
    deps: {
      neverBundle: [/^@ubean\//, /^node:/, 'tslog', 'hono']
    }
  },
  test: {
    include: ['test/**/*.test.ts']
  }
});
