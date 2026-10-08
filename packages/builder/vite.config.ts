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
      'src/vue.ts',
      'src/production.ts',
      'src/prerender.ts',
      'src/static-render.ts',
      'src/codegen/index.ts',
      'src/actions-plugin.ts'
    ],
    deps: {
      neverBundle: [/^@ubean\//, /^node:/, 'openapi-typescript', 'pathe', 'unimport', 'tinyglobby']
    }
  },
  test: {
    /**
     * TS-29：**并行**跑文件（此前是 `false`）。
     *
     * 当初串行的理由是「共享 fixture」：`production-build` 与 `cloudflare-preview` 都在
     * `test/fixtures/build-project` 上落 `.ubean/virtual` 与各自的 outDir。实测两者在时间
     * 线上真的重叠（cloudflare-preview 0.00→3.62s、production-build 1.06→2.59s，重叠 1.5s），
     * 跑 6 次都绿但那是时序运气，不是隔离。
     *
     * 红证：把 `materializeFixture` 临时退化成返回共享目录后，同一对文件跑 8 次有 **7 次红**
     * （`cloudflare-preview` 的 workerd 进程被信号杀掉 → `build.status` 为 null；
     * `production-build` 的内联 `assetTags.css` 变成空串）。
     *
     * 修法不是「让它们别重叠」，而是**给每个 suite 独占的 fixture 副本**
     * （`test/fixtures/materialize.ts`：复制到仓库根 `.temp/`，仍在工作区内以保证 Vite 的
     * 依赖解析正常）。隔离后并行全绿，墙钟 20.5s → 4.1s。
     */
    fileParallelism: true,
    include: ['test/**/*.test.ts'],
    environment: 'node'
  }
});
