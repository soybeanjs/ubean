import { getLogger } from '@ubean/shared/logger';
import type { UbeanConfig } from './types';

/**
 * 页面扫描扩展名（不带点）。
 *
 * 顺序即优先级，且被 Vite 插件用来决定注入哪些编译器：
 * - `vue` → `@vitejs/plugin-vue`
 * - `tsx` / `jsx` → `@vitejs/plugin-vue-jsx`
 */
export const PAGE_EXTENSIONS = ['vue', 'tsx', 'jsx'] as const;

export type PageExtension = (typeof PAGE_EXTENSIONS)[number];

/** 解析后的 `pages` 配置。 */
export interface ResolvedPagesConfig {
  extensions: string[];
}

export const pagesConfigDefaults: ResolvedPagesConfig = {
  extensions: [...PAGE_EXTENSIONS]
};

/**
 * 归一化用户提供的扩展名列表：去掉前导点、小写、去重、剔除空串。
 *
 * 不回退到「部分合法值」—— 用户写了 `['.vue']` 或 `['Vue']` 与写 `['vue']` 等价，
 * 让配置尽可能宽容；只有**整个数组为空**时才回落到默认值（空数组等于没有页面可扫，
 * 一定是笔误，静默产出空站点比警告更糟）。
 */
export function resolvePagesConfig(userConfig?: UbeanConfig['pages']): ResolvedPagesConfig {
  const raw = userConfig?.extensions;
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ...pagesConfigDefaults };
  }

  const normalized: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const ext = entry.trim().replace(/^\.+/, '').toLowerCase();
    if (!ext || normalized.includes(ext)) continue;
    normalized.push(ext);
  }

  if (normalized.length === 0) {
    getLogger('config').warn(
      `\`pages.extensions\` ${JSON.stringify(raw)} 不含任何有效扩展名，回落到默认值 ${JSON.stringify(pagesConfigDefaults.extensions)}。`
    );
    return { ...pagesConfigDefaults };
  }

  return { extensions: normalized };
}

/**
 * 扩展名 → 需要注入的编译器。
 *
 * 与 `scanPages` 的 `extensions` 是同一份数组：扫描到什么后缀，就必须有对应的编译器
 * 能编译它，否则构建期报 `[PARSE_ERROR] Unexpected JSX expression`（tsx 页面只被扫描、
 * 没有 jsx 插件时的真实表现）。
 */
export function resolvePageCompilers(extensions: string[] | undefined): { vue: boolean; jsx: boolean } {
  // `undefined` / 空数组视为「未配置」→ 回落到默认全开。这里有真实理由：
  // 测试与手工构造的 config 对象可能不带 `pages`，若当成「什么编译器都不装」
  // 会变成 `.vue` 无法编译（比多装一个 babel 插件糟得多）。
  const exts = extensions && extensions.length > 0 ? extensions : pagesConfigDefaults.extensions;
  return {
    vue: exts.includes('vue'),
    jsx: exts.some(ext => ext === 'tsx' || ext === 'jsx')
  };
}
