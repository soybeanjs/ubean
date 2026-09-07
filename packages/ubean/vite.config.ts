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
    entry: [
      'src/index.ts',
      'src/vite.ts',
      'src/ssr.ts',
      'src/server.ts',
      'src/build.ts',
      'src/i18n.ts',
      'src/client.ts',
      'src/scaffold.ts'
    ],
    deps: {
      neverBundle: [
        /^@ubean\//,
        /^node:/,
        'hono',
        'hono-openapi',
        'vite',
        /^@vitejs\//,
        /^@voidzero-dev\//,
        'devframe',
        // 虚拟模块由用户项目的 Vite 插件(ubeanIslandsPlugin)在构建/开发期解析,
        // ubean 包构建时不解析、不打包,保留为 external import。
        /^virtual:/
      ]
    }
  }
});
