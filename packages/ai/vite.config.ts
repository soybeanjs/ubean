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
    entry: ['src/index.ts', 'src/vite.ts', 'src/runtime/vue.ts', 'src/gateway.ts'],
    deps: {
      neverBundle: ['vue', 'ai', '@ai-sdk/openai-compatible', 'hono', 'zod', /^node:/]
    }
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node'
  }
});
