import { mkdir, writeFile } from 'node:fs/promises';
import type { ScanResult } from '@ubean/scan';
import { join } from 'pathe';
import { generateAutoImports } from './auto-imports';
import type { AutoImportOptions } from './auto-imports';
import { generateI18nTypes } from './i18n-types';
import { generateRouteTypes, generatePageTypes } from './route-types';

// Auto-import presets & orchestration (absorbed from the former
// `@ubean/auto-imports` package — single home for all .d.ts generation).
export {
  VUE_PRESET,
  VUE_MACROS_PRESET,
  UBEAN_CLIENT_PRESET,
  UBEAN_SERVER_PRESET,
  HONO_OPENAPI_PRESET,
  BUILTIN_PRESETS,
  generateAutoImports,
  getBuiltinComposables,
  getUbeanAutoImportConfig,
  getUbeanComponentsConfig,
  generateImportsTransform
} from './auto-imports';
export type { Import, InlinePreset, AutoImportOptions, ComponentInfo, AutoImportResult } from './auto-imports';

export { generateRouteTypes, generatePageTypes } from './route-types';
export type { RouteTypesOptions, PageTypesOptions } from './route-types';
export { generateI18nTypes, messagesToTsType } from './i18n-types';
export type { I18nTypesOptions } from './i18n-types';
export { generateOpenApiTypes, generateOpenApiTypesFromServer } from './openapi-types';
export type { GenerateOpenApiTypesOptions } from './openapi-types';

export const CODEGEN_CONTRACT_VERSION = 1 as const;

export interface CodegenFileContract {
  name: string;
  module: string | null;
  required: boolean;
  types: string[];
}

export const CODEGEN_FILES: readonly CodegenFileContract[] = [
  { name: 'routes.d.ts', module: 'ubean:routes', required: true, types: ['ApiRouteMap', 'ApiRoutePath', 'ApiMethod'] },
  { name: 'pages.d.ts', module: 'ubean:pages', required: true, types: ['RouteName', 'LayoutName'] },
  { name: 'i18n.d.ts', module: 'vue-i18n', required: false, types: ['DefineLocaleMessage'] },
  { name: 'auto-imports.d.ts', module: null, required: true, types: [] },
  { name: 'components.d.ts', module: null, required: true, types: [] }
];

export interface CodegenManifest {
  contractVersion: typeof CODEGEN_CONTRACT_VERSION;
  generatedAt: string;
  files: Array<{ name: string; module: string | null; required: boolean; types: string[]; generated: boolean }>;
}

export interface CodegenOptions extends Omit<AutoImportOptions, 'cwd' | 'srcDir' | 'buildDir'> {
  cwd: string;
  srcDir: string;
  buildDir: string;
}

export interface CodegenResult {
  routeTypesPath: string;
  pageTypesPath: string;
  i18nTypesPath?: string | null;
  autoImportsDtsPath?: string;
  componentsDtsPath?: string;
  generated: string[];
}

export async function generateTypes(result: ScanResult, options: CodegenOptions): Promise<CodegenResult> {
  const { cwd, srcDir, buildDir, ...autoImportOptions } = options;
  const outDir = join(cwd, buildDir);
  await mkdir(outDir, { recursive: true });

  const generated: string[] = [];

  const routeTypesPath = await generateRouteTypes(result, { cwd, outDir });
  generated.push(routeTypesPath);

  const pageTypesPath = await generatePageTypes(result, { outDir });
  generated.push(pageTypesPath);

  const i18nTypesPath = await generateI18nTypes(result, { outDir });
  if (i18nTypesPath) generated.push(i18nTypesPath);

  const autoImportsResult = await generateAutoImports(result, {
    cwd,
    srcDir,
    buildDir,
    ...autoImportOptions
  });

  const { autoImportsDtsPath, componentsDtsPath } = autoImportsResult;
  generated.push(autoImportsDtsPath, componentsDtsPath);

  const manifest: CodegenManifest = {
    contractVersion: CODEGEN_CONTRACT_VERSION,
    generatedAt: new Date().toISOString(),
    files: CODEGEN_FILES.map(file => ({
      ...file,
      generated: generated.some(path => path.replace(/\\/g, '/').endsWith(`/${file.name}`) || path.endsWith(file.name))
    }))
  };
  const manifestPath = join(outDir, 'codegen.manifest.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  generated.push(manifestPath);

  return { routeTypesPath, pageTypesPath, i18nTypesPath, autoImportsDtsPath, componentsDtsPath, generated };
}
