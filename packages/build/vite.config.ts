import { defineConfig } from 'vite-plus';

export default defineConfig({
  resolve: {
    tsconfigPaths: true
  },
  pack: {
    dts: true,
    clean: true,
    sourcemap: true,
    format: ['esm'],
    outDir: 'dist',
    entry: ['src/index.ts', 'src/vite.ts', 'src/production.ts'],
    deps: {
      neverBundle: [/^@ubean\//, /^node:/]
    }
  }
});
