import { mkdir, writeFile } from 'node:fs/promises';
import type { ResolvedEnvConfig } from '@ubean/config';
import type { ScanResult } from '@ubean/scan';
import { join } from 'pathe';
import { generateEnvTypes, ENV_TYPES_FILE_NAME } from '../env/codegen';
import { resolveEnvModules } from '../env/types';
import { generateAutoImports } from './auto-imports';
import type { GenerateAutoImportsOptions } from './auto-imports';
import { generateI18nTypes } from './i18n-types';
import { generateRouteTypes, generatePageTypes } from './route-types';

// Auto-import presets & orchestration (absorbed from the former
// `@ubean/auto-imports` package — single home for all .d.ts generation).
export {
  VUE_PRESET,
  VUE_MACROS_PRESET,
  UBEAN_CLIENT_PRESET,
  VUE_ROUTER_PRESET,
  VUE_I18N_PRESET,
  UBEAN_SERVER_PRESET,
  HONO_OPENAPI_PRESET,
  BUILTIN_PRESETS,
  resolveAutoImportsConfig,
  resolveComponentsConfig,
  getAutoImportPresets,
  toArray,
  generateAutoImports,
  getBuiltinComposables,
  getUbeanAutoImportConfig,
  getUbeanComponentsConfig,
  generateImportsTransform
} from './auto-imports';
export type {
  Import,
  InlinePreset,
  GenerateAutoImportsOptions,
  ResolvedAutoImports,
  ResolvedComponentsAutoImport,
  ComponentInfo,
  AutoImportResult
} from './auto-imports';

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
  { name: 'components.d.ts', module: null, required: true, types: [] },
  // 虚拟组件（配对 / 单边 `.server.vue` / `.client.vue` 的基名）的 ambient 声明。
  // 必须是独立文件：`components.d.ts` 会被 unplugin-vue-components 重写，而它的合并策略会
  // 丢掉周围的 `declare module` 语句（见 generateVirtualComponentsDts）。
  { name: 'virtual-components.d.ts', module: null, required: false, types: [] }
];

/**
 * `generateTypes()` 会写、但**不属于**外部冻结契约的产物。
 *
 * 存在的意义只为一个可执行断言服务：`test/codegen-doc-contract.test.ts` 断言「文档里列出的
 * `*.d.ts` 必须在代码里真的产出」，而 `env.d.ts` 故意不进 `CODEGEN_FILES`（理由见那里），
 * 于是它有产物、没契约条目。把名字登记在这里，比在测试里硬编码字符串更难漂移。
 */
export const CODEGEN_NON_CONTRACT_FILES: readonly string[] = [ENV_TYPES_FILE_NAME];

export interface CodegenManifest {
  contractVersion: typeof CODEGEN_CONTRACT_VERSION;
  generatedAt: string;
  files: Array<{ name: string; module: string | null; required: boolean; types: string[]; generated: boolean }>;
}

export interface CodegenOptions extends Omit<GenerateAutoImportsOptions, 'cwd' | 'srcDir' | 'buildDir'> {
  cwd: string;
  srcDir: string;
  buildDir: string;
  /** `env.schema` 的归一化配置（`ResolvedConfig.env`）。 */
  env?: ResolvedEnvConfig;
  /** Vite 解析后的 `import.meta.env` 快照，用于生成 `ImportMetaEnv`。 */
  importMetaEnv?: Record<string, unknown>;
}

export interface CodegenResult {
  routeTypesPath: string;
  pageTypesPath: string;
  i18nTypesPath?: string | null;
  autoImportsDtsPath?: string;
  componentsDtsPath?: string;
  virtualComponentsDtsPath?: string;
  /**
   * `.ubean/env.d.ts`（`ubean:env/*` 虚拟模块类型 + 生成的 `ImportMetaEnv`）。
   *
   * **刻意不进 `CODEGEN_FILES`**：那份清单是 studio / IDE 插件按名字读产物的**冻结契约**，
   * 加一个文件就要把 `contractVersion` 推到 2 并同步 `docs/contracts/codegen-v1.md`，
   * 而这份产物只给 TypeScript 编译器读，不在外部工具消费面上。
   */
  envTypesPath: string;
  generated: string[];
}

export async function generateTypes(result: ScanResult, options: CodegenOptions): Promise<CodegenResult> {
  const { cwd, srcDir, buildDir, env, importMetaEnv, ...autoImportOptions } = options;
  const outDir = join(cwd, buildDir);
  await mkdir(outDir, { recursive: true });

  const generated: string[] = [];

  const routeTypesPath = await generateRouteTypes(result, { cwd, outDir });
  generated.push(routeTypesPath);

  const pageTypesPath = await generatePageTypes(result, { outDir });
  generated.push(pageTypesPath);

  const i18nTypesPath = await generateI18nTypes(result, { outDir });
  if (i18nTypesPath) generated.push(i18nTypesPath);

  // schema 为空也生成：文件里还有 `ImportMetaEnv` 一半，而那一半与 schema 无关。
  const envTypesPath = await generateEnvTypes({
    outDir,
    modules: resolveEnvModules({
      schema: (env?.schema ?? {}) as Record<string, unknown>,
      importMetaEnv
    }),
    importMetaEnv
  });
  generated.push(envTypesPath);

  const autoImportsResult = await generateAutoImports(result, {
    cwd,
    srcDir,
    buildDir,
    ...autoImportOptions
  });

  const { autoImportsDtsPath, componentsDtsPath, virtualComponentsDtsPath } = autoImportsResult;
  generated.push(autoImportsDtsPath, componentsDtsPath, virtualComponentsDtsPath);

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

  return {
    routeTypesPath,
    pageTypesPath,
    i18nTypesPath,
    autoImportsDtsPath,
    componentsDtsPath,
    virtualComponentsDtsPath,
    envTypesPath,
    generated
  };
}
