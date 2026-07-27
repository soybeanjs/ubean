import { mkdir } from 'node:fs/promises';
import { generateAutoImports } from '@ubean/auto-imports';
import type { AutoImportOptions } from '@ubean/auto-imports';
import type { ScanResult } from '@ubean/routing';
import { join } from 'pathe';
import { generateRouteTypes, generatePageTypes } from './route-types';

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
