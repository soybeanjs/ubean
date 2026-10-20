import { existsSync, mkdirSync } from 'node:fs';
import { generateTypes } from '@ubean/build/codegen';
import {
  loadUbeanConfig,
  checkProjectDependencies,
  buildInstallCommand as buildInstallCommandImpl,
  detectPackageManager as detectPackageManagerImpl,
  extractPackageName as extractPackageNameImpl,
  resolveProjectUbeanVersion
} from '@ubean/config';
import { scanProject } from '@ubean/scan';
import { getLogger } from '@ubean/shared/logger';
import type { CommandDef } from 'citty';
import { join, resolve } from 'pathe';

const logger = getLogger('cli');

async function ensureBuildDir(cwd: string, buildDir: string): Promise<void> {
  const fullPath = join(cwd, buildDir);
  if (!existsSync(fullPath)) {
    mkdirSync(fullPath, { recursive: true });
  }
}

export type PackageManager = 'pnpm' | 'yarn' | 'bun' | 'npm';

/**
 * Detects the package manager used in the project by inspecting lockfiles.
 * Priority: pnpm > yarn > bun > npm (npm as default fallback).
 *
 * 实现下放到 `@ubean/config`（Vite 插件的依赖提醒也要用同一份探测）；这里保留同名再导出，
 * 兼容既有调用点与单测（OPT-04 4c）。
 */
export const detectPackageManager = detectPackageManagerImpl;

/**
 * Builds the install command args for a given package manager and package list.
 * Examples:
 *   pnpm → ['add', '@ubean/integrations@^0.1.3']
 *   npm  → ['install', '@ubean/integrations@^0.1.3']
 *
 * 同 `detectPackageManager`：实现下放到 `@ubean/config`，这里保留再导出。
 */
export const buildInstallCommand = buildInstallCommandImpl;

/**
 * Extracts the bare package name from a module path.
 *   '@ubean/integrations/pwa' → '@ubean/integrations'
 *   '@ubean/icon/vite'        → '@ubean/icon'
 *
 * 导出供单测复用（OPT-04 4c）。
 */
export const extractPackageName = extractPackageNameImpl;

/**
 * Reads the `ubean` package version from the project's package.json so we can
 * install matching versions of `@ubean/*` extension packages.
 * Returns `null` if ubean isn't declared or version can't be parsed.
 *
 * 实现下放到 `@ubean/config` 的 `resolveProjectUbeanVersion`（依赖提醒共用），
 * 这里保留同名再导出，兼容既有单测（OPT-04 4c）。
 */
export const getUbeanVersion = resolveProjectUbeanVersion;

export const prepareCommand: CommandDef = {
  meta: {
    name: 'prepare',
    description: 'Generate type definitions and check project dependencies'
  },
  args: {
    cwd: {
      type: 'string',
      description: 'Project root directory',
      default: '.'
    },
    install: {
      type: 'boolean',
      description: 'Prompt to install missing project dependencies (use --no-install to only warn)',
      default: true
    }
  },
  async run({ args }) {
    const cwd = resolve(args.cwd || process.cwd());
    logger.info(`Preparing ubean project at ${cwd}...`);

    const config = await loadUbeanConfig(cwd);

    // 项目依赖提醒（对齐 soybeanjs/eslint-config 的 `ensurePackages`）：按配置算出
    // 「用户项目里该装什么」（内建模块包 + 其必需 peer + 功能开关触发的可选包），
    // 缺失时逐条说明「谁要求它 / 为什么需要」，可交互终端下询问并安装。
    //
    // 清单与「必需 / 可选」的判定在 `@ubean/config` 的 `project-deps.ts`，
    // 与 Vite 插件的 `config` 钩子共用同一份实现（裸 `vite dev` 也覆盖）。
    //
    // `--no-install` 只影响**自动安装**，不影响提醒 —— 缺包却什么都不说，正是最难查的
    // 那类问题（模块被静默跳过、组件解析不到）。
    await checkProjectDependencies({
      cwd,
      config: config as unknown as Record<string, unknown>,
      srcDir: config.srcDir,
      mode: args.install !== false ? 'prompt' : 'warn',
      logger: {
        info: message => logger.info(message),
        warn: message => logger.warn(message)
      }
    });

    const typesDir = '.ubean';
    await ensureBuildDir(cwd, typesDir);

    logger.info('Scanning project files...');
    const result = await scanProject({
      cwd,
      srcDir: config.srcDir,
      dirs: config.dir,
      ignore: config.scanOptions?.ignore,
      pageExtensions: config.pages?.extensions
    });

    logger.info(
      `Found ${result.apiRoutes.length} API routes, ${result.pages.length} pages, ${result.layouts.length} layouts, ${result.middlewares.length} middlewares`
    );

    logger.info('Generating type definitions...');
    const codegenResult = await generateTypes(result, {
      cwd,
      srcDir: config.srcDir,
      buildDir: typesDir,
      dirs: config.dir,
      autoImports: config.autoImports,
      components: config.components
    });

    for (const file of codegenResult.generated) {
      logger.info(`Generated ${file.replace(`${cwd}/`, '')}`);
    }

    logger.info('Prepare complete!');
  }
};
