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

export interface AutoImportResult {
  composablesImports: Import[];
  components: ComponentInfo[];
  autoImportsDtsPath: string;
  componentsDtsPath: string;
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

async function scanComponentsDir(
  dir: string,
  srcDir: string,
  directoryAsNamespace: boolean,
  ignore: string[] = ['**/*.test.*', '**/*.spec.*', '**/_*']
): Promise<ComponentInfo[]> {
  const components: ComponentInfo[] = [];

  const files = await glob('**/*.vue', {
    cwd: dir,
    dot: true,
    ignore,
    absolute: true
  }).catch(() => [] as string[]);

  for (const fullPath of files.sort()) {
    const relativeToSrc = toPosixPath(relative(srcDir, fullPath));
    const relativeToDir = toPosixPath(relative(dir, fullPath));
    const base = fileBasename(fullPath);
    if (base.startsWith('_')) continue;

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

  return components;
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

    const dtsContent = toTypeDeclarationFile(composablesImports, {
      resolvePath: (imp: Import) => {
        if (isPackageSource(imp.from)) {
          return imp.from;
        }
        return transformImportPath(imp.from, srcDir);
      }
    });
    await writeFile(autoImportsDtsPath, dtsContent, 'utf-8');
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
      components.push(...scanned);
    }
  }

  const componentsDts = generateComponentsDts(components, componentsDtsPath);
  await writeFile(componentsDtsPath, componentsDts, 'utf-8');

  return {
    composablesImports,
    components,
    autoImportsDtsPath,
    componentsDtsPath
  };
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
  const BUILTIN_COMPONENTS = ['Link', 'Head', 'PageView'];
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
  lines.push(...sorted.map(([name, declaration]) => `    ${name}: ${declaration}`));
  lines.push('  }');
  lines.push('}');
  lines.push('');

  return `${lines.join('\n')}\n`;
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
