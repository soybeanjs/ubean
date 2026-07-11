import { join, relative, basename, extname, dirname } from 'pathe';
import { glob } from 'tinyglobby';
import { mkdir, writeFile } from 'node:fs/promises';
import { logger } from '../log';
import type { ScanResult } from '../routing/types';

export interface AutoImport {
  name: string;
  as?: string;
  from: string;
}

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

const BUILTIN_COMPOSABLES: AutoImport[] = [
  { name: 'ref', from: 'vue' },
  { name: 'computed', from: 'vue' },
  { name: 'reactive', from: 'vue' },
  { name: 'readonly', from: 'vue' },
  { name: 'watch', from: 'vue' },
  { name: 'watchEffect', from: 'vue' },
  { name: 'watchPostEffect', from: 'vue' },
  { name: 'watchSyncEffect', from: 'vue' },
  { name: 'onMounted', from: 'vue' },
  { name: 'onUnmounted', from: 'vue' },
  { name: 'onBeforeMount', from: 'vue' },
  { name: 'onBeforeUnmount', from: 'vue' },
  { name: 'onUpdated', from: 'vue' },
  { name: 'onBeforeUpdate', from: 'vue' },
  { name: 'onActivated', from: 'vue' },
  { name: 'onDeactivated', from: 'vue' },
  { name: 'onErrorCaptured', from: 'vue' },
  { name: 'onServerPrefetch', from: 'vue' },
  { name: 'onRenderTracked', from: 'vue' },
  { name: 'onRenderTriggered', from: 'vue' },
  { name: 'provide', from: 'vue' },
  { name: 'inject', from: 'vue' },
  { name: 'shallowRef', from: 'vue' },
  { name: 'shallowReactive', from: 'vue' },
  { name: 'shallowReadonly', from: 'vue' },
  { name: 'isRef', from: 'vue' },
  { name: 'isReactive', from: 'vue' },
  { name: 'isReadonly', from: 'vue' },
  { name: 'isProxy', from: 'vue' },
  { name: 'unref', from: 'vue' },
  { name: 'toRef', from: 'vue' },
  { name: 'toRefs', from: 'vue' },
  { name: 'toRaw', from: 'vue' },
  { name: 'markRaw', from: 'vue' },
  { name: 'triggerRef', from: 'vue' },
  { name: 'customRef', from: 'vue' },
  { name: 'effectScope', from: 'vue' },
  { name: 'getCurrentScope', from: 'vue' },
  { name: 'onScopeDispose', from: 'vue' },
  { name: 'defineComponent', from: 'vue' },
  { name: 'defineAsyncComponent', from: 'vue' },
  { name: 'defineProps', from: 'vue' },
  { name: 'defineEmits', from: 'vue' },
  { name: 'defineExpose', from: 'vue' },
  { name: 'defineOptions', from: 'vue' },
  { name: 'defineSlots', from: 'vue' },
  { name: 'defineModel', from: 'vue' },
  { name: 'useSlots', from: 'vue' },
  { name: 'useAttrs', from: 'vue' },
  { name: 'useTemplateRef', from: 'vue' },
  { name: 'nextTick', from: 'vue' },
  { name: 'toValue', from: 'vue' },
  { name: 'useId', from: 'vue' },
  { name: 'useCssModule', from: 'vue' },
  { name: 'useCssVars', from: 'vue' },
  { name: 'useTransitionState', from: 'vue' },
  { name: '$', from: 'vue/macros' },
  { name: '$$', from: 'vue/macros' },
  { name: '$ref', from: 'vue/macros' },
  { name: '$computed', from: 'vue/macros' },
  { name: '$shallowRef', from: 'vue/macros' },
  { name: '$customRef', from: 'vue/macros' },
  { name: '$toRef', from: 'vue/macros' },
  { name: 't', from: 'ubean' },
  { name: 'useI18n', from: 'ubean' },
  { name: 'useSeoMeta', from: 'ubean' },
  { name: 'useData', from: 'ubean' },
  { name: 'callInternal', from: 'ubean' },
  { name: 'navigateTo', from: 'ubean' },
  { name: 'redirect', from: 'ubean' },
  { name: 'useRuntimeConfig', from: 'ubean' },
  { name: 'defineScheduled', from: 'ubean' },
  { name: 'defineQueue', from: 'ubean' },
  { name: 'sendMessage', from: 'ubean' },
  { name: 'sendMessages', from: 'ubean' },
  { name: 'getQueueStats', from: 'ubean' },
  { name: 'useDatabase', from: 'ubean' },
  { name: 'defineDatabase', from: 'ubean' },
  { name: 'useKV', from: 'ubean' },
  { name: 'createKV', from: 'ubean' },
  { name: 'useStorage', from: 'ubean' }
];

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

function getExportName(filePath: string): string {
  const base = basename(filePath, extname(filePath));
  if (base === 'index') {
    const dir = basename(dirname(filePath));
    return toCamelCase(dir);
  }
  return toCamelCase(base);
}

async function scanComposablesDir(
  dir: string,
  srcDir: string,
  ignore: string[] = ['**/*.test.*', '**/*.spec.*', '**/_*', '**/*.d.ts']
): Promise<AutoImport[]> {
  const imports: AutoImport[] = [];

  const files = await glob('**/*.{ts,js,mts,mjs,cts,cjs}', {
    cwd: dir,
    dot: true,
    ignore: [...ignore, '**/*.vue'],
    absolute: true
  }).catch(() => [] as string[]);

  for (const fullPath of files.sort()) {
    const relativeToSrc = toPosixPath(relative(srcDir, fullPath));
    const name = getExportName(relativeToSrc);
    if (name) {
      imports.push({
        name,
        from: `~/${  relativeToSrc.replace(/\.(ts|js|mts|mjs|cts|cjs)$/, '')}`
      });
    }
  }

  return imports;
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
    const base = basename(fullPath, extname(fullPath));
    if (base.startsWith('_')) continue;

    let name: string;
    if (directoryAsNamespace) {
      const dirPart = dirname(relativeToDir) === '.' ? '' : dirname(relativeToDir);
      const parts = dirPart ? dirPart.split('/').filter(Boolean) : [];
      parts.push(base);
      name = parts.map(toPascalCase).join('');
    } else {
      name = toPascalCase(base);
    }

    components.push({
      name,
      filePath: fullPath,
      importPath: `~/${  relativeToSrc}`,
      pascalName: name
    });
  }

  return components;
}

export interface ComponentInfo {
  name: string;
  filePath: string;
  importPath: string;
  pascalName: string;
}

export interface AutoImportResult {
  composablesImports: AutoImport[];
  components: ComponentInfo[];
  autoImportsDtsPath: string;
  componentsDtsPath: string;
}

export async function generateAutoImports(
  scanResult: ScanResult,
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

  let composablesImports: AutoImport[] = [];
  let components: ComponentInfo[] = [];

  if (autoImportEnabled) {
    composablesImports = [...BUILTIN_COMPOSABLES];

    const allComposablesDirs = [join(srcDir, composablesDir), ...composablesDirs];
    for (const dir of allComposablesDirs) {
      const scanned = await scanComposablesDir(dir, srcDir);
      composablesImports.push(...scanned);
    }
  }

  if (componentAutoImportEnabled) {
    const allComponentsDirs = [join(srcDir, componentsDir), ...componentsDirs];
    for (const dir of allComponentsDirs) {
      const scanned = await scanComponentsDir(dir, srcDir, directoryAsNamespace);
      components.push(...scanned);
    }
  }

  const autoImportsDts = generateAutoImportsDts(composablesImports);
  const autoImportsDtsPath = join(outDir, 'auto-imports.d.ts');
  await writeFile(autoImportsDtsPath, autoImportsDts, 'utf-8');

  const componentsDts = generateComponentsDts(components);
  const componentsDtsPath = join(outDir, 'components.d.ts');
  await writeFile(componentsDtsPath, componentsDts, 'utf-8');

  logger.debug(
    `Generated auto-imports: ${composablesImports.length} composables, ${components.length} components`
  );

  return {
    composablesImports,
    components,
    autoImportsDtsPath,
    componentsDtsPath
  };
}

function generateAutoImportsDts(imports: AutoImport[]): string {
  const lines: string[] = [
    '// Auto-generated by ubean - do not edit manually',
    '/* eslint-disable */',
    '// @ts-nocheck',
    '',
    'export {}',
    '',
    'declare global {'
  ];

  const importGroups = new Map<string, Set<string>>();
  for (const imp of imports) {
    if (!importGroups.has(imp.from)) {
      importGroups.set(imp.from, new Set());
    }
    importGroups.get(imp.from)!.add(imp.as ? `${imp.name} as ${imp.as}` : imp.name);
  }

  const globalDeclarations: string[] = [];
  const importLines: string[] = [];

  for (const [from, names] of importGroups) {
    const nameList = Array.from(names);
    importLines.push(`  import { ${nameList.join(', ')} } from ${JSON.stringify(from)};`);

    for (const nameEntry of nameList) {
      const localName = nameEntry.includes(' as ') ? nameEntry.split(' as ')[1] : nameEntry;
      globalDeclarations.push(`  const ${localName}: typeof import(${JSON.stringify(from)})['${nameEntry.includes(' as ') ? nameEntry.split(' as ')[0] : nameEntry}'];`);
    }
  }

  lines.push(...importLines);
  lines.push('');
  lines.push(...globalDeclarations);
  lines.push('}');

  return `${lines.join('\n')}\n`;
}

function generateComponentsDts(components: ComponentInfo[]): string {
  const lines: string[] = [
    '// Auto-generated by ubean - do not edit manually',
    '/* eslint-disable */',
    '// @ts-nocheck',
    '',
    'declare module \'vue\' {',
  ];

  const importLines: string[] = [];
  const componentEntries: string[] = [];

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

export function getBuiltinComposables(): AutoImport[] {
  return [...BUILTIN_COMPOSABLES];
}

export function generateImportsTransform(imports: AutoImport[]): { code: string; map?: null } {
  const importGroups = new Map<string, Set<string>>();
  for (const imp of imports) {
    if (!importGroups.has(imp.from)) {
      importGroups.set(imp.from, new Set());
    }
    importGroups.get(imp.from)!.add(imp.as ? `${imp.name} as ${imp.as}` : imp.name);
  }

  const importStatements: string[] = [];
  for (const [from, names] of importGroups) {
    importStatements.push(`import { ${Array.from(names).join(', ')} } from '${from}';`);
  }

  return { code: importStatements.join('\n') };
}
