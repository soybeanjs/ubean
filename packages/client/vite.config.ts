import { defineConfig } from 'vite-plus';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // pnpm peer-variant duplication can install multiple copies of vue-router
    // (@ubean/client's provide side vs @ubean/vue's inject side). vue-router's
    // injection keys are per-instance Symbols, so `<Link>` (RouterLink) fails
    // to inject the router context in tests. Dedupe to a single instance.
    dedupe: ['vue', 'vue-router']
  },
  pack: {
    dts: true,
    clean: true,
    format: ['esm'],
    fixedExtension: false,
    outDir: 'dist',
    entry: ['src/index.ts', 'src/app.ts', 'src/define-app.ts', 'src/server.ts', 'src/ssr.ts'],
    deps: {
      neverBundle: ['vue', 'vue-router', 'vue-i18n', '@unhead/vue', '@vue/server-renderer', /^@ubean\//, /^node:/]
    }
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node'
  }
});
