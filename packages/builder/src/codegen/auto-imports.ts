import { mkdir, writeFile } from 'node:fs/promises';
import type { ScanResult } from '@ubean/scan';
import { join, relative, normalize } from 'pathe';
import { glob } from 'tinyglobby';
import { createUnimport, toTypeDeclarationFile } from 'unimport';
import type { Import, InlinePreset } from 'unimport';

export type { Import, InlinePreset };

export interface AutoImportOptions {
  cwd: string;
  srcDir: string;
  buildDir: string;
  composablesDirs?: string[];
  componentsDirs?: string[];
  dirs?: {
    composables?: string;
    components?: string;
  };
  imports?: {
    autoImport?: boolean;
    global?: boolean;
  };
  components?: {
    autoImport?: boolean;
    directoryAsNamespace?: boolean;
  };
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
 * (`ubean/runtime/vue` still works — it re-exports the same kernel — but
 * new code should prefer `ubean/client`.)
 */
export const UBEAN_CLIENT_PRESET: InlinePreset = {
  from: 'ubean/client',
  imports: [
    'definePage',
    'defineMiddleware',
    'defineApp',
    'applyAppConfig',
    'createDefaultAppConfig',
    't',
    'useI18n',
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
    'useRouter',
    'useHead',
    'useViewTransition',
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
 * Server-only symbols that come from the main `ubean` package.
 * These import the full ubean entry (which includes build tools like `vite`),
 * so they must only be used in server-side files (API routes, middleware, etc.).
 */
export const UBEAN_SERVER_PRESET: InlinePreset = {
  from: 'ubean',
  imports: [
    'defineHandlerMeta',
    'useData',
    'useAsyncData',
    'useFetch',
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

export const BUILTIN_PRESETS: InlinePreset[] = [UBEAN_CLIENT_PRESET, UBEAN_SERVER_PRESET, HONO_OPENAPI_PRESET];

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
  options: AutoImportOptions
): Promise<AutoImportResult> {
  const {
    cwd,
    srcDir,
    buildDir,
    composablesDirs = [],
    componentsDirs = [],
    dirs = {},
    imports: importsConfig,
    components: componentsConfig
  } = options;

  const outDir = join(cwd, buildDir);
  await mkdir(outDir, { recursive: true });

  const autoImportEnabled = importsConfig?.autoImport !== false;
  const componentAutoImportEnabled = componentsConfig?.autoImport !== false;
  const directoryAsNamespace = componentsConfig?.directoryAsNamespace ?? false;

  const composablesDir = dirs.composables || 'composables';
  const componentsDir = dirs.components || 'components';

  let composablesImports: Import[] = [];
  let components: ComponentInfo[] = [];

  const autoImportsDtsPath = join(outDir, 'auto-imports.d.ts');
  const componentsDtsPath = join(outDir, 'components.d.ts');

  if (autoImportEnabled) {
    const allComposablesDirs = [join(srcDir, composablesDir), ...composablesDirs];

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
      presets: BUILTIN_PRESETS,
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
      if (imp.from === 'vue' || imp.from === 'vue/macros' || imp.from === 'ubean' || imp.from.startsWith('ubean/')) {
        return imp;
      }
      return {
        ...imp,
        from: transformImportPath(imp.from, srcDir)
      };
    });

    const dtsContent = toTypeDeclarationFile(composablesImports, {
      resolvePath: (imp: Import) => {
        if (imp.from === 'vue' || imp.from === 'vue/macros' || imp.from === 'ubean' || imp.from.startsWith('ubean/')) {
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

  if (componentAutoImportEnabled) {
    const allComponentsDirs = [join(srcDir, componentsDir), ...componentsDirs];
    for (const dir of allComponentsDirs) {
      const scanned = await scanComponentsDir(dir, srcDir, directoryAsNamespace);
      components.push(...scanned);
    }
  }

  const componentsDts = generateComponentsDts(components);
  await writeFile(componentsDtsPath, componentsDts, 'utf-8');

  return {
    composablesImports,
    components,
    autoImportsDtsPath,
    componentsDtsPath
  };
}

function generateComponentsDts(components: ComponentInfo[]): string {
  const lines: string[] = [
    '// Auto-generated by ubean - do not edit manually',
    '/* eslint-disable */',
    '// @ts-nocheck',
    '',
    "declare module 'vue' {"
  ];

  const importLines: string[] = [];
  const componentEntries: string[] = [];

  const BUILTIN_COMPONENTS = ['Link', 'Head'];
  for (const name of BUILTIN_COMPONENTS) {
    importLines.push(`  const ${name}: typeof import('ubean/client')['${name}'];`);
    componentEntries.push(`    ${name}: typeof ${name};`);
  }

  for (const comp of components) {
    importLines.push(`  import ${comp.pascalName} from ${JSON.stringify(comp.importPath)};`);
    componentEntries.push(`    ${comp.pascalName}: typeof ${comp.pascalName};`);
  }

  if (importLines.length > 0) {
    lines.push(...importLines);
    lines.push('');
    lines.push('  export interface GlobalComponents {');
    lines.push(...componentEntries);
    lines.push('  }');
  } else {
    lines.push('  export interface GlobalComponents {}');
  }

  lines.push('}');
  lines.push('');
  lines.push('export {}');

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

export function getUbeanAutoImportConfig(
  options: {
    cwd?: string;
    srcDir?: string;
    buildDir?: string;
    composablesDirs?: string[];
  } = {}
) {
  const cwd = options.cwd || process.cwd();
  const srcDir = options.srcDir || join(cwd, 'src');
  const buildDir = options.buildDir || '.ubean';
  const composablesDirName = 'composables';
  const composablesDirs = [join(srcDir, composablesDirName), ...(options.composablesDirs || [])];

  return {
    imports: [UBEAN_CLIENT_PRESET, UBEAN_SERVER_PRESET, HONO_OPENAPI_PRESET],
    dirs: composablesDirs,
    dts: join(cwd, buildDir, 'auto-imports.d.ts'),
    vueTemplate: true,
    eslintrc: { enabled: false }
  };
}

export function getUbeanComponentsConfig(
  options: {
    cwd?: string;
    srcDir?: string;
    buildDir?: string;
    componentsDirs?: string[];
    directoryAsNamespace?: boolean;
  } = {}
) {
  const cwd = options.cwd || process.cwd();
  const srcDir = options.srcDir || join(cwd, 'src');
  const buildDir = options.buildDir || '.ubean';
  const componentsDirName = 'components';
  const componentsDirs = [join(srcDir, componentsDirName), ...(options.componentsDirs || [])];
  const directoryAsNamespace = options.directoryAsNamespace ?? false;

  return {
    dirs: componentsDirs,
    extensions: ['vue'],
    directoryAsNamespace,
    dts: join(cwd, buildDir, 'components.d.ts'),
    deep: true
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
