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
import type { ResolvedConfig } from '@ubean/config';
import type { PresetBuildConfig } from '../production';
import { ssrSingletonProdOptimizeExclude } from '../ssr-singleton';
import { getBuildOutDirs } from './build-steps';

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

/**
 * 服务端产物命名 + 打包形态。
 *
 * **非 node 目标必须内联动态 import**：默认路径用 `ssr.target: 'webworker'` 表达这一点
 * （Vite 对 webworker 目标的 SSR 构建会内联），env 驱动路径没有 env 级的 `ssr.target`
 * 等价字段，于是同一个 preset 下两条路径的 server bundle 形状分叉 —— 实测 `standard`
 * （`entryType: 'fetch'`、target 为 webworker）：默认路径 60 个文件（单文件 bundle），
 * builder 路径 175 个（带 `chunks/`）。`node` 与 `cloudflare` 两格原本就一致（前者 target=node，
 * 后者 entryType=worker），因此这里按 **target 是否为 node** 判定内联，与默认路径对齐。
 */
export function serverOutputNames(presetBuildConfig: PresetBuildConfig) {
  const isNodeTarget = presetBuildConfig.target === 'node18' || presetBuildConfig.entryType === 'node';
  return {
    format: presetBuildConfig.format,
    entryFileNames: 'entry.mjs',
    chunkFileNames: 'chunks/[name]-[hash].mjs',
    inlineDynamicImports: !isNodeTarget || presetBuildConfig.entryType === 'worker'
  };
}

/** 由已解析配置取产物目录（插件 `config` 钩子用）。 */
export function getBuildOutDirsForConfig(config: ResolvedConfig) {
  return getBuildOutDirs(config.rootDir, config.build.outputDir);
}

/** `createBuildEnvironments` 的输入：两侧（CLI 自建 builder / 插件 config 钩子）各自算好后传入。 */
export interface BuildEnvironmentsInput {
  /** 绝对路径：`dist`、`dist/public`、`dist/server`、`.ubean/virtual`…… */
  outDirs: { public: string; server: string; virtual: string };
  /** 客户端入口（源码 `src/entry.client.ts` 优先，否则虚拟模块目录里的 `client-entry.mjs`）。 */
  clientInput: string;
  minify: boolean;
  sourcemap: boolean;
  presetBuildConfig: PresetBuildConfig;
  /** `ssrSingletonProdSsr().noExternal`（把 `@ubean/*` 内联进 SSR 图）。 */
  ssrNoExternal: (string | RegExp)[] | undefined;
}

/**
 * 两个 environment 的构建配置（RM-V17 / RM-V21）。
 *
 * **两条路径共用同一份**：CLI 自建 builder 时把它传给 `createBuilder({ environments })`；
 * 插件在 `config` 钩子里把它作为 `environments` 返回（`vite build` 路径由 Vite 建 builder）。
 * 各自写一份必然漂移 —— 之前只有 `outDir` 的极简版本会让客户端环境退回默认入口 `index.html`，
 * `vite build` 直接以 `Cannot resolve entry module index.html` 失败（实测）。
 */
export function createBuildEnvironments(input: BuildEnvironmentsInput) {
  const { outDirs, clientInput, minify, sourcemap, presetBuildConfig, ssrNoExternal } = input;
  return {
    client: {
      consumer: 'client' as const,
      optimizeDeps: { exclude: clientOptimizeDepsExclude() },
      build: {
        outDir: outDirs.public,
        assetsDir: 'assets',
        minify: minify ? ('oxc' as const) : false,
        sourcemap,
        manifest: true,
        ssrManifest: true,
        emptyOutDir: false,
        rollupOptions: {
          input: { app: clientInput },
          output: clientOutputNames()
        }
      }
    },
    ubean: {
      consumer: 'server' as const,
      resolve: {
        // 旧路径的 `ssr.noExternal`：把 `@ubean/*` 内联进 SSR 图，否则各包从自身
        // node_modules 解析，虚拟模块 import 会以裸 specifier 泄漏给 Node。
        noExternal: ssrNoExternal,
        external: ['@ubean/i18n']
      },
      build: {
        outDir: outDirs.server,
        ssr: true,
        minify: false,
        sourcemap,
        emptyOutDir: false,
        rollupOptions: {
          input: `${outDirs.virtual}/server-entry.mjs`,
          external: serverExternal(presetBuildConfig),
          output: serverOutputNames(presetBuildConfig)
        }
      }
    }
  };
}
