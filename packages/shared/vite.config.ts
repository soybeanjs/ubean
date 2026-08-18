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
    entry: ['src/index.ts', 'src/node.ts'],
    deps: {
      neverBundle: [/^@ubean\//, /^node:/]
    }
  },
  test: {
    include: ['test/**/*.test.ts']
  }
});
