/**
 * 项目级类型声明。
 *
 * ubean 通过 unplugin-auto-import / unplugin-vue-components 在 dev/build 时
 * 自动生成 `.ubean/auto-imports.d.ts` 与 `.ubean/components.d.ts`,提供全局
 * `useHead`、`<Link>`、`<PageView>` 等类型。本示例为了在不运行 dev/build 的
 * 情况下也能通过 `vue-tsc --noEmit`,在此文件预声明示例中实际使用到的全局
 * API 与组件。运行 `pnpm dev` 或 `pnpm build` 后,生成器会产出更完整的声明文件。
 */
export {};

// 全局自动导入声明(仅包含本示例用到的 API)
declare global {
  const useHead: (typeof import('ubean/runtime/vue'))['useHead'];
}

// 全局组件声明(仅包含本示例用到的组件)
declare module 'vue' {
  interface GlobalComponents {
    Link: (typeof import('ubean/runtime/vue'))['Link'];
    PageView: (typeof import('ubean/runtime/vue'))['PageView'];
  }
}

/**
 * `routing` 字段已实现在 `@ubean/config` 的 `UbeanConfig` 中,但 ubean 主包
 * 重新导出的类型定义暂未同步。这里通过 interface 声明合并补齐 `routing` 字段,
 * 以便 `ubean.config.ts` 中能获得类型支持。完整字段见
 * `packages/config/src/types.ts` 的 `RoutingConfig`。
 */
declare module 'ubean' {
  interface UbeanConfig {
    routing?: {
      mode?: 'virtual' | 'file' | 'both';
      outputDir?: string;
      dtsDir?: string;
      routeLazy?: boolean;
      layoutLazy?: boolean;
      watchFile?: boolean;
      fileUpdateDuration?: number;
      onGenerated?: (files: string[]) => void;
    };
  }
}
