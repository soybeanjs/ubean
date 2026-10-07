/**
 * `virtual:ubean-islands-registry` 的测试替身。
 *
 * 该虚拟模块由用户项目的 `ubeanIslandsPlugin` 在 dev/build 期生成,
 * 但 `ubean/client` 产物对它有一条静态 import。在 vitest 的 Node 环境下
 * 没有 Vite 插件参与解析,裸 `import('ubean/client')` 会以
 * `Only URLs with a scheme in: file, data, and node are supported ...
 * Received protocol 'virtual:'` 失败。
 *
 * 因此 `vite.config.ts` 的 `test.alias` 把它指向本文件——与
 * `examples/ubean-test/vitest.config.ts` 的做法一致。本测试只断言导出面
 * (符号名集合),不执行 islands 注册逻辑,故空注册表足够。
 */
export const islands: Record<string, unknown> = {};
