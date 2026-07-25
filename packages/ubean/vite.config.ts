import { defineConfig } from 'vite-plus';

export default defineConfig({
  resolve: {
    tsconfigPaths: false
  },
  pack: {
    dts: true,
    clean: true,
    format: ['esm'],
    outDir: 'dist',
    entry: [
      // 主入口(re-export @ubean/core)
      'src/index.ts',
      // 遗留子路径入口(向后兼容)
      'src/runtime/handler.ts',
      'src/runtime/app.ts',
      'src/runtime/define-server.ts',
      'src/runtime/i18n.ts',
      'src/runtime/i18n-routing.ts',
      'src/runtime/pages/index.ts',
      'src/runtime/vue/index.ts',
      'src/runtime/vue/app.ts',
      'src/runtime/vue/define-app.ts',
      'src/handler.ts',
      'src/config.ts',
      'src/vite.ts',
      'src/vite-vue.ts',
      'src/vue-ssr.ts',
      'src/routing.ts',
      'src/pages.ts',
      'src/vue-runtime.ts',
      'src/vue-runtime/app.ts',
      'src/vue-runtime/define-app.ts'
    ],
    deps: {
      // 所有 ubean 子包都不打包,保留为外部依赖
      neverBundle: [/^@ubean\//, /^node:/]
    }
  }
});
