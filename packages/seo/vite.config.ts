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
    entry: ['src/index.ts', 'src/conventions.ts', 'src/og-image.ts', 'src/json-ld.ts'],
    deps: {
      neverBundle: [/^@ubean\//, '@unhead/vue', 'vue', /^node:/]
    }
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node'
  }
});
