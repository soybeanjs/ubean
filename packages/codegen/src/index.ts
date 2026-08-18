import { mkdir } from 'node:fs/promises';
import type { ScanResult } from '@ubean/scan';
import { join } from 'pathe';
import { generateAutoImports } from './auto-imports';
import type { AutoImportOptions } from './auto-imports';
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
export { generateOpenApiTypes, generateOpenApiTypesFromServer } from './openapi-types';
export type { GenerateOpenApiTypesOptions } from './openapi-types';

export interface CodegenOptions extends Omit<AutoImportOptions, 'cwd' | 'srcDir' | 'buildDir'> {
  cwd: string;
  srcDir: string;
  buildDir: string;
}

export interface CodegenResult {
  routeTypesPath: string;
  pageTypesPath: string;
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

  const autoImportsResult = await generateAutoImports(result, {
    cwd,
    srcDir,
    buildDir,
    ...autoImportOptions
  });

  const { autoImportsDtsPath, componentsDtsPath } = autoImportsResult;
  generated.push(autoImportsDtsPath, componentsDtsPath);

  return { routeTypesPath, pageTypesPath, autoImportsDtsPath, componentsDtsPath, generated };
}
