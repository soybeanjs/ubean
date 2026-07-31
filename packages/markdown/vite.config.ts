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
    entry: ['src/index.ts', 'src/mdx.ts', 'src/jsx-runtime.ts', 'src/vite-plugin.ts'],
    deps: {
      neverBundle: [/^@ubean\//, 'vue', '@mdx-js/mdx', /^node:/]
    }
  }
});
