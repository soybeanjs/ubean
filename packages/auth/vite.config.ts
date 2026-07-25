import { defineConfig } from 'vite-plus';

export default defineConfig({
  resolve: {
    tsconfigPaths: true
  },
  pack: {
    dts: false,
    clean: true,
    sourcemap: true,
    format: ['esm'],
    fixedExtension: false,
    outDir: 'dist',
    entry: ['src/index.ts', 'src/core.ts', 'src/vite.ts', 'src/runtime.ts'],
    onSuccess: 'tsc --emitDeclarationOnly',
    deps: {
      neverBundle: ['vue', 'better-auth', 'hono', /^node:/]
    }
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node'
  }
});
