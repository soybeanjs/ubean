import type { PresetBuildConfig } from '../production';
/**
 * 两条构建路径共用的构建配置片段（RM-V17）。
 *
 * 旧路径（两次 `viteBuild`）与新路径（一次 `createBuilder` + 两个 environment）的**写法不同但取值必须一致**：
 * `rollupOptions.output` 的命名、manifest 开关、preset external 的过滤规则 —— 任何一处写歪都会让
 * 产物分叉，而这类分叉只会以「某个文件没产出/名字变了」的形式出现在很后面。
 *
 * 因此把这些**易漂移的取值**收在这里，两条路径都从这里取；不再各写一份。RM-V16 的
 * `build-parity.test.ts` 负责证明两条路径的产物清单一致。
 */
import { ssrSingletonProdOptimizeExclude } from '../ssr-singleton';

/** 客户端优化依赖里必须排除的虚拟模块（`ubean` 运行时链与 vue-router 的实例一致性） */
export const CLIENT_VIRTUAL_EXCLUDE = [
  'virtual:ubean-pages',
  'virtual:ubean-app',
  'virtual:ubean-server',
  'virtual:ubean-client-entry',
  '#ubean-pages',
  '#ubean-app',
  '#ubean-server',
  '#ubean-client-entry'
];

/** 客户端 `optimizeDeps.exclude`（含 `ssrSingletonProdOptimizeExclude` 的既有规则）。 */
export function clientOptimizeDepsExclude(): string[] {
  return ssrSingletonProdOptimizeExclude(CLIENT_VIRTUAL_EXCLUDE);
}

/** 客户端产物命名（`assets/[name]-[hash].js` 等）。 */
export function clientOutputNames() {
  return {
    entryFileNames: 'assets/[name]-[hash].js',
    chunkFileNames: 'assets/chunks/[name]-[hash].js',
    assetFileNames: 'assets/[name]-[hash].[ext]'
  };
}

/**
 * 服务端 external 过滤（RM-V17 要求重审这条）。
 *
 * preset 的 external 里带有 `^ubean` 模式，它与 `resolve.noExternal: ['ubean']` **直接冲突**：
 * 保留会把 ubean 外置，Node 从 node_modules 加载时解析不到 `virtual:ubean-*`（构建期由插件
 * 提供，运行时不存在）。因此统一在派生处剔除，两条路径共用同一判断。
 */
export function serverExternal(presetBuildConfig: PresetBuildConfig): (string | RegExp)[] {
  return presetBuildConfig.external.filter(entry => !(entry instanceof RegExp && entry.source.startsWith('^ubean')));
}

/** 服务端产物命名 + 打包形态（worker 需要内联动态 import）。 */
export function serverOutputNames(presetBuildConfig: PresetBuildConfig) {
  return {
    format: presetBuildConfig.format,
    entryFileNames: 'entry.mjs',
    chunkFileNames: 'chunks/[name]-[hash].mjs',
    inlineDynamicImports: presetBuildConfig.entryType === 'worker'
  };
}
