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
    entry: ['src/index.ts'],
    deps: {
      neverBundle: [/^@ubean\//, /^node:/, 'pathe', '@vitejs/plugin-vue', 'vite']
    }
  }
});
