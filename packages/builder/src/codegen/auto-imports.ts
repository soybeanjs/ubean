import { mkdir, writeFile } from 'node:fs/promises';
import type { Options as UnpluginComponentsOptions } from 'unplugin-vue-components/types';
import type { Options as UnpluginAutoImportOptions } from 'unplugin-auto-import/types';
import type { AutoImportOptions, ComponentsOptions } from '@ubean/config';
import type { ScanResult } from '@ubean/scan';
import { join, relative, normalize } from 'pathe';
import { glob } from 'tinyglobby';
import { createUnimport, toTypeDeclarationFile } from 'unimport';
import type { Import, InlinePreset } from 'unimport';

export type { Import, InlinePreset };

export interface GenerateAutoImportsOptions {
  cwd: string;
  srcDir: string;
  buildDir: string;
  /** `srcDir` 内扫描目录名（默认 `composables` / `components`）。 */
  dirs?: {
    composables?: string;
    components?: string;
  };
  /** `ubean.config.ts` 的 `autoImports` 配置（`boolean | AutoImportOptions`）。 */
  autoImports?: boolean | AutoImportOptions;
  /** `ubean.config.ts` 的 `components` 配置（`boolean | ComponentsOptions`）。 */
  components?: boolean | ComponentsOptions;
}

/* -------------------------------------------------------------------------- */
/* 配置解析（vue-plugin 运行时插件与 codegen 共用）                              */
/* -------------------------------------------------------------------------- */

export interface ResolvedAutoImports {
  /** 总开关（`autoImports: false` 时为 `false`）。 */
  enabled: boolean;
  /** ubean 内置 API（client + server 预设），默认 `true`。 */
  ubean: boolean;
  /** vue composables + reactivity macros，默认 `false`。 */
  vue: boolean;
  /** vue-router `useRouter`，默认 `false`。 */
  vueRouter: boolean;
  /** vue-i18n `useI18n`，默认 `false`。 */
  vueI18n: boolean;
  /** hono-openapi `validator`/`describeRoute`，默认 `false`。 */
  honoOpenapi: boolean;
  /** 用户对象形态配置（boolean/undefined 时为 `{}`）。 */
  options: AutoImportOptions;
}

/** 将 `boolean | AutoImportOptions` 归一化为分库开关 + 透传选项。 */
export function resolveAutoImportsConfig(input: boolean | AutoImportOptions | undefined): ResolvedAutoImports {
  const options = typeof input === 'object' && input !== null ? input : {};
  return {
    enabled: input !== false,
    ubean: options.ubean ?? true,
    vue: options.vue ?? false,
    vueRouter: options.vueRouter ?? false,
    vueI18n: options.vueI18n ?? false,
    honoOpenapi: options.honoOpenapi ?? false,
    options
  };
}

/** 按分库开关组装内置预设（顺序稳定：ubean client/server → vue → vue-router → vue-i18n → hono-openapi）。 */
export function getAutoImportPresets(resolved: ResolvedAutoImports): InlinePreset[] {
  const presets: InlinePreset[] = [];
  if (resolved.ubean) presets.push(UBEAN_CLIENT_PRESET, UBEAN_SERVER_PRESET);
  if (resolved.vue) presets.push(VUE_PRESET, VUE_MACROS_PRESET);
  if (resolved.vueRouter) presets.push(VUE_ROUTER_PRESET);
  if (resolved.vueI18n) presets.push(VUE_I18N_PRESET);
  if (resolved.honoOpenapi) presets.push(HONO_OPENAPI_PRESET);
  return presets;
}

export interface ResolvedComponentsAutoImport {
  /** 目录扫描 + dts 总开关（`components: false` 时为 `false`；resolver 仍然生效）。 */
  enabled: boolean;
  /** ubean 内置组件（`Link`/`Head`/`PageView`）resolver，默认 `true`。 */
  ubean: boolean;
  /** 用户对象形态配置（boolean/undefined 时为 `{}`）。 */
  options: ComponentsOptions;
}

/** 将 `boolean | ComponentsOptions` 归一化。 */
export function resolveComponentsConfig(input: boolean | ComponentsOptions | undefined): ResolvedComponentsAutoImport {
  const options = typeof input === 'object' && input !== null ? input : {};
  return {
    enabled: input !== false,
    ubean: options.ubean ?? true,
    options
  };
}

/** unplugin 系选项普遍使用 `Arrayable<T>`，合并进数组前先归一化。 */
export function toArray<T>(value: T | T[] | undefined): T[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

export const VUE_PRESET: InlinePreset = {
  from: 'vue',
  imports: [
    'ref',
    'computed',
    'reactive',
    'readonly',
    'watch',
    'watchEffect',
    'watchPostEffect',
    'watchSyncEffect',
    'onMounted',
    'onUnmounted',
    'onBeforeMount',
    'onBeforeUnmount',
    'onUpdated',
    'onBeforeUpdate',
    'onActivated',
    'onDeactivated',
    'onErrorCaptured',
    'onServerPrefetch',
    'onRenderTracked',
    'onRenderTriggered',
    'provide',
    'inject',
    'shallowRef',
    'shallowReactive',
    'shallowReadonly',
    'isRef',
    'isReactive',
    'isReadonly',
    'isProxy',
    'unref',
    'toRef',
    'toRefs',
    'toRaw',
    'markRaw',
    'triggerRef',
    'customRef',
    'effectScope',
    'getCurrentScope',
    'onScopeDispose',
    'defineComponent',
    'defineAsyncComponent',
    'defineProps',
    'defineEmits',
    'defineExpose',
    'defineOptions',
    'defineSlots',
    'defineModel',
    'useSlots',
    'useAttrs',
    'useTemplateRef',
    'nextTick',
    'toValue',
    'useId',
    'useCssModule',
    'useCssVars',
    'useTransitionState'
  ]
};

export const VUE_MACROS_PRESET: InlinePreset = {
  from: 'vue/macros',
  imports: ['$', '$$', '$ref', '$computed', '$shallowRef', '$customRef', '$toRef']
};

/**
 * Client-safe symbols sourced from the first-class `ubean/client` entry.
 * These are safe to auto-import in Vue components (browser-side) because
 * `@ubean/client` has zero build-time dependencies and no `node:*` imports.
 */
export const UBEAN_CLIENT_PRESET: InlinePreset = {
  from: 'ubean/client',
  imports: [
    'definePage',
    'defineMiddleware',
    'defineApp',
    'applyAppConfig',
    'createDefaultAppConfig',
    'setLocale',
    'useLocalePath',
    'useSwitchLocalePath',
    'useLocaleRoute',
    'useLocaleHead',
    'useColorMode',
    'useScript',
    'useSearch',
    'useSeoMeta',
    'usePage',
    'useHead',
    'useViewTransition',
    'useData',
    'useAsyncData',
    'useFetch',
    // Page cache (keep-alive) runtime control
    'useCacheViews',
    'enablePageCache',
    'disablePageCache',
    'excludePageCache',
    'includePageCache',
    'isPageExcluded',
    'resetRouteCache',
    'invalidatePageCache',
    'isPageCached',
    // Page transition + reload signal runtime control
    'usePageTransition',
    'setPageTransition',
    'clearPageTransition',
    'useReloadSignal',
    'reloadPage',
    'isReloading'
  ]
};

/**
 * vue-router composables, sourced directly from `vue-router` (not re-exported
 * through `ubean/client` — third-party APIs are imported from their own packages).
 */
export const VUE_ROUTER_PRESET: InlinePreset = {
  from: 'vue-router',
  imports: ['useRouter']
};

/**
 * vue-i18n Composition API, sourced directly from `vue-i18n` (ubean no longer
 * wraps `useI18n` — same instance is exposed by the framework-installed
 * vue-i18n plugin; `t` is destructured from the returned composer).
 */
export const VUE_I18N_PRESET: InlinePreset = {
  from: 'vue-i18n',
  imports: ['useI18n']
};

/**
 * Server-only symbols sourced from the `ubean/server` aggregation entry
 * (`@ubean/app` + `@ubean/routes` + `@ubean/server` + `@ubean/shared/node`).
 * Sourcing from `ubean/server` (instead of the full `ubean` barrel) keeps
 * build-time tooling (scan / build / cli, oxc-parser WASM…) out of the import
 * closure, so these must still only be used in server-side files
 * (API routes, middleware, etc.) — the closure still contains Hono and
 * `node:*` builtins.
 *
 * Note: the isomorphic data composables (`useData` / `useAsyncData` /
 * `useFetch`) are intentionally NOT listed here — they are exported from
 * `ubean/client` (see UBEAN_CLIENT_PRESET) and re-exported from the same
 * `@ubean/pages` source. Declaring them in both presets makes
 * unplugin-auto-import emit a "Duplicated imports" warning, so they live in
 * the client preset only.
 */
export const UBEAN_SERVER_PRESET: InlinePreset = {
  from: 'ubean/server',
  imports: [
    'defineHandlerMeta',
    'defineAction',
    'defineServerFn',
    'invokeServerFn',
    'createInternalAdapter',
    'defineScheduled',
    'defineQueue',
    'sendMessage',
    'sendMessages',
    'getQueueStats',
    'useDatabase',
    'defineDatabase',
    'useKV',
    'createKV',
    'useStorage'
  ]
};

export const HONO_OPENAPI_PRESET: InlinePreset = {
  from: 'hono-openapi',
  imports: ['validator', 'describeRoute']
};

export const BUILTIN_PRESETS: InlinePreset[] = [
  UBEAN_CLIENT_PRESET,
  VUE_ROUTER_PRESET,
  VUE_I18N_PRESET,
  UBEAN_SERVER_PRESET,
  HONO_OPENAPI_PRESET
];

export interface ComponentInfo {
  name: string;
  filePath: string;
  importPath: string;
  pascalName: string;
}

/**
 * 虚拟组件：磁盘上**没有** `Base.vue`，但存在 `Base.server.vue` / `Base.client.vue` 兄弟。
 *
 * `@ubean/islands` 在解析阶段按基名合成：两边都有 → 配对包装（首屏服务端变体，水合后切客户端
 * 变体）；只有一边 → 直接指向那一边（另一侧在不适用的图谱里换 stub）。所以 `Base.vue` 这个
 * 导入说明符在 Vite 里成立、在 TS 里却不成立 —— 需要一个 ambient 声明（见
 * `generateVirtualComponentsDts`），否则每个使用配对组件的项目 `pnpm type-check` 都会红。
 *
 * 注意与 `ComponentInfo` 的区别：这是**模块路径**级别的事（`*.vue` 说明符），与自动导入的
 * 组件名、`directoryAsNamespace` 无关。
 */
export interface VirtualComponentInfo {
  /** 文件名基名（`theme-badge`）—— 通配声明必须用它，导入说明符里写的就是它。 */
  baseName: string;
  /** PascalCase 名，仅用于生成注释。 */
  name: string;
  /** 声明里 `typeof import(...)` 指向的真实文件：优先服务端变体（配对与 server-only），否则客户端变体。 */
  typeSourcePath: string;
}

/** 一次目录扫描的结果：可直接自动导入的组件 + 需要 ambient 声明的虚拟组件。 */
export interface ComponentsScanResult {
  components: ComponentInfo[];
  virtualComponents: VirtualComponentInfo[];
}

export interface AutoImportResult {
  composablesImports: Import[];
  components: ComponentInfo[];
  autoImportsDtsPath: string;
  componentsDtsPath: string;
  /** 虚拟组件（配对/单边基名）的 ambient 声明文件。没有虚拟组件时内容为空声明。 */
  virtualComponentsDtsPath: string;
}

function toPosixPath(p: string): string {
  return p.replace(/\\/g, '/');
}

function toCamelCase(str: string): string {
  return str.replace(/[-_](\w)/g, (_, c) => c.toUpperCase());
}

function toPascalCase(str: string): string {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

function fileBasename(p: string, ext?: string): string {
  const parts = toPosixPath(p).split('/');
  let base = parts[parts.length - 1] || '';
  if (ext && base.endsWith(ext)) {
    base = base.slice(0, -ext.length);
  } else if (!ext) {
    const dotIdx = base.lastIndexOf('.');
    if (dotIdx > 0) base = base.slice(0, dotIdx);
  }
  return base;
}

function fileDirname(p: string): string {
  const parts = toPosixPath(p).split('/');
  parts.pop();
  return parts.join('/') || '.';
}

function transformImportPath(filePath: string, srcDir: string): string {
  const posixPath = toPosixPath(normalize(filePath));
  const posixSrcDir = toPosixPath(normalize(srcDir));
  const rel = toPosixPath(relative(posixSrcDir, posixPath));
  const withoutExt = rel.replace(/\.(ts|js|mts|mjs|cts|cjs|tsx|jsx)$/, '');
  return `~/${withoutExt}`;
}

/**
 * Bare package specifiers (`vue`, `vue-router`, `hono-openapi`, `ubean/client`…)
 * keep their source in the generated dts; only project-relative files are
 * rewritten to `~/` paths.
 */
function isPackageSource(from: string): boolean {
  return !from.startsWith('.') && !from.startsWith('/') && !from.startsWith('~');
}

/**
 * `.server.vue` / `.client.vue` 不是独立组件，**不能**进自动导入表。
 *
 * 它们是同一个组件的两个变体：`.client.vue` 客户端独有、`.server.vue` 服务端独有，
 * 成对出现时（`Foo.server.vue` + `Foo.client.vue`）由 `@ubean/islands` 的
 * `resolveId` 按基名 `Foo.vue` 生成配对包装。用户侧的用法是**显式 import**
 * （`import Foo from './Foo.vue'` 或直接 import 某一半），不存在 `<Foo.server />` 这种写法。
 *
 * 而按文件名派生名字会把它们扫成 `Foo.server` / `Foo.client` —— 这些名字进了
 * `components.d.ts` 就是**非法 TypeScript**：ubean 自己的写入器会产出未加引号的
 * 带点键（接口成员不允许限定名，`@ts-nocheck` 也压不住语法错误），
 * unplugin-vue-components 重写时会产出 `const 'Foo.server': …`（`declare global` 块里
 * 非法）—— 结果示例项目的 `pnpm type-check` 直接红。
 *
 * codegen 侧在 `scanComponentsDir` 里按这个形态分区（半成品不进组件表，但会被收成虚拟组件）；
 * unplugin 没有分区逻辑，所以这份 glob 直接喂给它的 `globsExclude`（`./vue-plugin.ts`），
 * 保证两个写入器都不产出这些条目。
 */
export const COMPONENT_HALF_GLOBS = ['**/*.server.vue', '**/*.client.vue'];

async function scanComponentsDir(
  dir: string,
  srcDir: string,
  directoryAsNamespace: boolean,
  ignore: string[] = ['**/*.test.*', '**/*.spec.*', '**/_*']
): Promise<ComponentsScanResult> {
  const components: ComponentInfo[] = [];
  const virtualComponents: VirtualComponentInfo[] = [];

  // 半成品也要 glob 进来（不能靠 ignore 滤掉）：它们既是「不是独立组件」要排除的对象，
  // 又是「虚拟组件」的唯一线索。分区在下面的循环里做。
  const files = await glob('**/*.vue', {
    cwd: dir,
    dot: true,
    ignore,
    absolute: true
  }).catch(() => [] as string[]);

  /** 基名 → 半成品真实路径（`/foo/Base.server.vue` 等）。 */
  const halves = new Map<string, { server?: string; client?: string }>();
  /** 同目录下真实存在的 `.vue` 基名 —— 它们由 TS 自行解析，不需要 ambient 声明。 */
  const realBases = new Set<string>();

  for (const fullPath of files.sort()) {
    const relativeToSrc = toPosixPath(relative(srcDir, fullPath));
    const relativeToDir = toPosixPath(relative(dir, fullPath));
    const base = fileBasename(fullPath);
    if (base.startsWith('_')) continue;

    const half = /^(.*)\.(server|client)$/.exec(base);
    if (half) {
      const entry = halves.get(half[1]) ?? {};
      entry[half[2] as 'server' | 'client'] = fullPath;
      halves.set(half[1], entry);
      continue;
    }
    realBases.add(base);

    let name: string;
    if (directoryAsNamespace) {
      const dirPart = fileDirname(relativeToDir) === '.' ? '' : fileDirname(relativeToDir);
      const parts = dirPart ? dirPart.split('/').filter(Boolean) : [];
      parts.push(base);
      name = parts.map(toPascalCase).join('');
    } else {
      name = toPascalCase(base);
    }

    components.push({
      name,
      filePath: fullPath,
      importPath: `~/${relativeToSrc}`,
      pascalName: name
    });
  }

  // 每个半成品基名 → 一条 ambient 声明，**除非**同名真实文件也在（那时 TS 解析真实文件，
  // 声明永远不会被用到 —— 那种「真实文件被兄弟文件遮蔽」的运行时优先级另见 islands 插件）。
  for (const [baseName, pair] of halves) {
    if (realBases.has(baseName)) continue;
    virtualComponents.push({
      baseName,
      name: toPascalCase(baseName),
      typeSourcePath: pair.server ?? pair.client!
    });
  }

  return { components, virtualComponents };
}

export async function generateAutoImports(
  _scanResult: ScanResult,
  options: GenerateAutoImportsOptions
): Promise<AutoImportResult> {
  const { cwd, srcDir, buildDir, dirs = {}, autoImports: autoImportsInput, components: componentsInput } = options;

  const outDir = join(cwd, buildDir);
  await mkdir(outDir, { recursive: true });

  const resolvedAutoImports = resolveAutoImportsConfig(autoImportsInput);
  const resolvedComponents = resolveComponentsConfig(componentsInput);
  const directoryAsNamespace = resolvedComponents.options.directoryAsNamespace ?? false;

  const composablesDir = dirs.composables || 'composables';
  const componentsDir = dirs.components || 'components';

  let composablesImports: Import[] = [];
  let components: ComponentInfo[] = [];
  const virtualComponents: VirtualComponentInfo[] = [];

  const autoImportsDtsPath = join(outDir, 'auto-imports.d.ts');
  const componentsDtsPath = join(outDir, 'components.d.ts');

  if (resolvedAutoImports.enabled) {
    const allComposablesDirs = [join(srcDir, composablesDir), ...(resolvedAutoImports.options.dirs ?? [])];

    const existingDirs: string[] = [];
    for (const dir of allComposablesDirs) {
      try {
        const { statSync } = await import('node:fs');
        if (statSync(dir).isDirectory()) {
          existingDirs.push(dir);
        }
      } catch {
        // directory doesn't exist, skip
      }
    }

    const unimport = createUnimport({
      presets: getAutoImportPresets(resolvedAutoImports),
      dirs: existingDirs,
      dirsScanOptions: {
        cwd: srcDir,
        filePatterns: ['*.{ts,js,mts,mjs,cts,cjs}'],
        types: false
      }
    });

    await unimport.init();
    const allImports = await unimport.getImports();

    composablesImports = allImports.map(imp => {
      if (isPackageSource(imp.from)) {
        return imp;
      }
      return {
        ...imp,
        from: transformImportPath(imp.from, srcDir)
      };
    });

    const resolveFrom = (from: string) => (isPackageSource(from) ? from : transformImportPath(from, srcDir));

    const dtsContent = toTypeDeclarationFile(composablesImports, {
      resolvePath: (imp: Import) => resolveFrom(imp.from)
    });
    await writeFile(
      autoImportsDtsPath,
      `${dtsContent}\n\n${buildTemplateAutoImportBlock(composablesImports, resolveFrom)}`,
      'utf-8'
    );
  } else {
    await writeFile(
      autoImportsDtsPath,
      '// Auto-generated by ubean - auto-imports disabled\n/* eslint-disable */\n// @ts-nocheck\nexport {}\n',
      'utf-8'
    );
  }

  if (resolvedComponents.enabled) {
    const allComponentsDirs = [join(srcDir, componentsDir), ...(resolvedComponents.options.dirs ?? [])];
    for (const dir of allComponentsDirs) {
      const scanned = await scanComponentsDir(dir, srcDir, directoryAsNamespace);
      components.push(...scanned.components);
      virtualComponents.push(...scanned.virtualComponents);
    }
  }

  const componentsDts = generateComponentsDts(components, componentsDtsPath);
  await writeFile(componentsDtsPath, componentsDts, 'utf-8');

  const virtualComponentsDtsPath = join(outDir, 'virtual-components.d.ts');
  await writeFile(
    virtualComponentsDtsPath,
    generateVirtualComponentsDts(virtualComponents, virtualComponentsDtsPath),
    'utf-8'
  );

  return {
    composablesImports,
    components,
    autoImportsDtsPath,
    componentsDtsPath,
    virtualComponentsDtsPath
  };
}

/**
 * 生成「模板里的自动导入」声明段（对齐 `AutoImport({ vueTemplate: true })` 的产物）。
 *
 * **为什么必须自己产出这段**：模板表达式里的标识符由 vue 的**组件实例类型**解析
 * （vue-tsc 把模板编译成 `__VLS_ctx.x`，即 `ComponentCustomProperties`），而不是走模块作用域的
 * 全局声明。只有 `declare global { const … }` 时，`<script setup>` 里的自动导入照常工作，而
 * **模板里**用同一个 helper 会报 `Property 'isPageCached' does not exist on type '{ $: … }'`。
 *
 * ubean 的 codegen 与 unplugin-auto-import 写的是同一份文件（谁后写谁赢），所以两边都必须产出
 * 这段：codegen 只在 `prepare` / CLI dev / build 跑，unplugin 在每次 Vite dev/build 重写 ——
 * 少一段就会出现「先跑 CLI 时红、跑过一次 dev 后变绿」这种漂移。
 */
function buildTemplateAutoImportBlock(imports: Import[], resolveFrom: (from: string) => string): string {
  const entries = imports
    .filter(imp => imp.name && imp.from && imp.type !== true)
    .map(
      imp => `    readonly ${toDtsKey(imp.name)}: UnwrapRef<typeof import('${resolveFrom(imp.from)}')['${imp.name}']>`
    )
    .sort();

  return [
    '// for vue template auto import',
    "import { UnwrapRef } from 'vue'",
    "declare module 'vue' {",
    '  interface GlobalComponents {}',
    '  interface ComponentCustomProperties {',
    ...entries,
    '  }',
    '}'
  ].join('\n');
}

/**
 * 生成 `.ubean/virtual-components.d.ts` —— 虚拟组件（配对/单边基名）的 ambient 声明。
 *
 * 为什么必须单独一份文件：这份内容会被 `unplugin-vue-components` 的重写丢掉（它只捞
 * `GlobalComponents` 接口里的条目，周围的 `declare module` 语句一律不保留），而
 * `components.d.ts` 正是它拥有的文件。
 *
 * 用**通配**说明符（`*foo.vue`）而不是相对路径：`declare module` 里的相对路径只在「说明符
 * 字符串完全相同」时匹配，而同一个虚拟组件可以从任意目录、任意相对路径导入。通配声明只在
 * TS 无法解析到真实文件时才生效，因此不会遮蔽真实 `.vue` 文件。
 *
 * 类型取服务端变体（配对与 server-only 都有），单边 `.client.vue` 则取客户端变体 —— 与
 * 运行时首屏渲染的那一侧一致。
 */
function generateVirtualComponentsDts(virtual: VirtualComponentInfo[], dtsPath: string): string {
  const dtsDir = fileDirname(toPosixPath(normalize(dtsPath)));

  const lines: string[] = [
    '// Auto-generated by ubean - do not edit manually',
    '/* eslint-disable */',
    '// @ts-nocheck',
    '',
    // **不能写 `export {}`**：那会让本文件变成模块，而模块里的 `declare module '*X.vue'` 是
    // 「模块增强」而不是全局 ambient 声明 —— TS 随后会报找不到被增强的模块，
    // 声明也就不再解析任何东西（实测：加了 `export {}` 后 `ThemeBadge.vue` 依旧找不到）。
    '// 本文件刻意保持 script（非模块）语义，让下面的声明成为全局 ambient 声明。',
    ''
  ];

  const sorted = [...virtual].sort((a, b) => a.baseName.localeCompare(b.baseName));
  for (const comp of sorted) {
    const rel = toPosixPath(relative(dtsDir, toPosixPath(normalize(comp.typeSourcePath))));
    lines.push(
      `// ${comp.name}：磁盘上没有 ${comp.baseName}.vue，由 @ubean/islands 按同名 .server.vue / .client.vue 合成`,
      `declare module '*${comp.baseName}.vue' {`,
      `  const component: typeof import('./${rel}')['default'];`,
      '  export default component;',
      '}',
      ''
    );
  }

  return `${lines.join('\n')}\n`;
}

/**
 * Generate the `.ubean/components.d.ts` in a format compatible with
 * unplugin-vue-components (both writers own the same file).
 *
 * `ubean dev` runs codegen first, then unplugin-vue-components rewrites the
 * file in dev mode using its append merge: it keeps entries scraped from the
 * existing `GlobalComponents` interface but drops any surrounding
 * `import`/`const` declaration lines. Entries must therefore be
 * self-contained inline `typeof import('...')` declarations so they stay
 * valid after unplugin merges them.
 */
function generateComponentsDts(components: ComponentInfo[], dtsPath: string): string {
  const dtsDir = fileDirname(toPosixPath(normalize(dtsPath)));

  const entries = new Map<string, string>();

  // Keep in sync with UBEAN_BUILTIN_COMPONENTS in ../vue-plugin.ts
  const BUILTIN_COMPONENTS = ['Link', 'Head', 'PageView', 'ClientOnly'];
  for (const name of BUILTIN_COMPONENTS) {
    entries.set(name, `typeof import('ubean/client')['${name}']`);
  }

  for (const comp of components) {
    const rel = toPosixPath(relative(dtsDir, toPosixPath(normalize(comp.filePath))));
    // Always prefix `./` like unplugin-vue-components does, so both writers
    // emit byte-identical entries and neither triggers a redundant rewrite.
    const importPath = `./${rel}`;
    entries.set(comp.pascalName, `typeof import('${importPath}')['default']`);
  }

  const lines: string[] = [
    '// Auto-generated by ubean - do not edit manually',
    '/* eslint-disable */',
    '// @ts-nocheck',
    '// biome-ignore lint: disable',
    '// oxlint-disable',
    '',
    'export {}',
    '',
    '/* prettier-ignore */',
    "declare module 'vue' {",
    '  export interface GlobalComponents {'
  ];

  const sorted = [...entries.entries()].sort(([a], [b]) => a.localeCompare(b));
  lines.push(...sorted.map(([name, declaration]) => `    ${toDtsKey(name)}: ${declaration}`));
  lines.push('  }');
  lines.push('}');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

/**
 * 接口成员名 → 合法的 TS 键。
 *
 * 名字里含 `.` 时（如 `My.Comp.vue` 这种文件名）直接写就是**限定名**，在接口里是语法
 * 错误 —— 而语法错误不受本文件顶部 `@ts-nocheck` 影响，整个 d.ts 会连累项目 type-check。
 * 加引号后是合法的字符串字面量键，且 unplugin-vue-components 重写时也用同样形式
 * （实测它把非标识符名写成 `'My.Comp': …`），两边不会互相反复改写。
 *
 * 注意这里只改**写法**不改名字：名字必须与 unplugin 的派生结果一致，否则两个写入器
 * 会各自重写同一份文件。
 */
function toDtsKey(name: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
}

export function getBuiltinComposables(): Import[] {
  const imports: Import[] = [];
  for (const preset of BUILTIN_PRESETS) {
    for (const name of preset.imports) {
      if (typeof name === 'string') {
        imports.push({ name, from: preset.from! });
      } else if (Array.isArray(name)) {
        imports.push({ name: name[0], as: name[1], from: preset.from! });
      }
    }
  }
  return imports;
}

/** unplugin-auto-import 的组装结果（透传字段类型直接引用 unplugin 类型，避免跨包类型命名问题）。 */
export interface UbeanAutoImportConfig {
  imports: UnpluginAutoImportOptions['imports'];
  dirs: string[];
  dts: UnpluginAutoImportOptions['dts'];
  vueTemplate: boolean;
  eslintrc: UnpluginAutoImportOptions['eslintrc'];
}

export function getUbeanAutoImportConfig(
  options: {
    cwd?: string;
    srcDir?: string;
    buildDir?: string;
    composablesDirs?: string[];
    /** `ubean.config.ts` 的 `autoImports` 配置（默认最小：仅 ubean 内置 API）。 */
    autoImports?: boolean | AutoImportOptions;
  } = {}
): UbeanAutoImportConfig {
  const cwd = options.cwd || process.cwd();
  const srcDir = options.srcDir || join(cwd, 'src');
  const buildDir = options.buildDir || '.ubean';
  const composablesDirName = 'composables';
  const resolved = resolveAutoImportsConfig(options.autoImports);
  const composablesDirs = [
    join(srcDir, composablesDirName),
    ...(resolved.options.dirs ?? []),
    ...(options.composablesDirs || [])
  ];

  return {
    imports: [...getAutoImportPresets(resolved), ...toArray(resolved.options.imports)],
    dirs: composablesDirs,
    dts: resolved.options.dts === undefined ? join(cwd, buildDir, 'auto-imports.d.ts') : resolved.options.dts,
    vueTemplate: resolved.options.vueTemplate ?? true,
    eslintrc: resolved.options.eslintrc ?? { enabled: false }
  };
}

/** unplugin-vue-components 的组装结果（类型直接引用 unplugin，理由同上）。 */
export interface UbeanComponentsConfig {
  dirs: string[];
  extensions: string[];
  directoryAsNamespace: boolean;
  dts: UnpluginComponentsOptions['dts'];
  deep: boolean;
}

export function getUbeanComponentsConfig(
  options: {
    cwd?: string;
    srcDir?: string;
    buildDir?: string;
    componentsDirs?: string[];
    directoryAsNamespace?: boolean;
    /** `ubean.config.ts` 的 `components` 配置。 */
    components?: boolean | ComponentsOptions;
  } = {}
): UbeanComponentsConfig {
  const cwd = options.cwd || process.cwd();
  const srcDir = options.srcDir || join(cwd, 'src');
  const buildDir = options.buildDir || '.ubean';
  const componentsDirName = 'components';
  const resolved = resolveComponentsConfig(options.components);
  const componentsDirs = [
    join(srcDir, componentsDirName),
    ...(resolved.options.dirs ?? []),
    ...(options.componentsDirs || [])
  ];
  const directoryAsNamespace = resolved.options.directoryAsNamespace ?? options.directoryAsNamespace ?? false;

  return {
    dirs: componentsDirs,
    extensions: ['vue'],
    directoryAsNamespace,
    dts: resolved.options.dts === undefined ? join(cwd, buildDir, 'components.d.ts') : resolved.options.dts,
    deep: resolved.options.deep ?? true
  };
}

export function generateImportsTransform(imports: Import[]): { code: string; map?: null } {
  const importGroups = new Map<string, Set<string>>();
  for (const imp of imports) {
    if (!importGroups.has(imp.from)) {
      importGroups.set(imp.from, new Set());
    }
    const namePart = imp.as ? `${imp.name} as ${imp.as}` : imp.name;
    importGroups.get(imp.from)!.add(namePart);
  }

  const importStatements: string[] = [];
  for (const [from, names] of importGroups) {
    importStatements.push(`import { ${Array.from(names).join(', ')} } from '${from}';`);
  }

  return { code: importStatements.join('\n') };
}
