import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { generateTypes } from '@ubean/codegen';
import { loadUbeanConfig } from '@ubean/config';
import type { ResolvedConfig } from '@ubean/config';
import { BUILTIN_MODULES, isBuiltinDisabled } from '@ubean/modules';
import { scanProject } from '@ubean/routing';
import type { CommandDef } from 'citty';
import { consola } from 'consola';
import { join, resolve } from 'pathe';

const logger = consola.withTag('ubean-cli');

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
 * 导出供单测复用（OPT-04 4c）。
 */
export function detectPackageManager(cwd: string): PackageManager {
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(cwd, 'bun.lockb')) || existsSync(join(cwd, 'bun.lock'))) return 'bun';
  return 'npm';
}

/**
 * Builds the install command args for a given package manager and package list.
 * Examples:
 *   pnpm → ['add', '@ubean/ui@^0.1.3']
 *   npm  → ['install', '@ubean/ui@^0.1.3']
 *
 * 导出供单测复用（OPT-04 4c）。
 */
export function buildInstallCommand(pm: PackageManager, packages: string[]): { cmd: string; args: string[] } {
  switch (pm) {
    case 'pnpm':
      return { cmd: 'pnpm', args: ['add', ...packages] };
    case 'yarn':
      return { cmd: 'yarn', args: ['add', ...packages] };
    case 'bun':
      return { cmd: 'bun', args: ['add', ...packages] };
    default:
      return { cmd: 'npm', args: ['install', ...packages] };
  }
}

/**
 * Extracts the bare package name from a module path.
 *   '@ubean/ui/vite'      → '@ubean/ui'
 *   '@ubean/electron/vite' → '@ubean/electron'
 *
 * 导出供单测复用（OPT-04 4c）。
 */
export function extractPackageName(modulePath: string): string {
  if (modulePath.startsWith('@')) {
    return modulePath.split('/').slice(0, 2).join('/');
  }
  return modulePath.split('/')[0];
}

/**
 * Reads the `ubean` package version from the project's package.json so we can
 * install matching versions of `@ubean/*` extension packages.
 * Returns `null` if ubean isn't declared or version can't be parsed.
 *
 * 导出供单测复用（OPT-04 4c）。
 */
export function getUbeanVersion(cwd: string): string | null {
  try {
    const pkgPath = join(cwd, 'package.json');
    if (!existsSync(pkgPath)) return null;
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const spec: string | undefined = pkg.dependencies?.ubean || pkg.devDependencies?.ubean;
    if (!spec) return null;
    // Strip leading range characters (^, ~, >, >=, etc.)
    const match = spec.match(/\d+\.\d+\.\d+/);
    return match ? match[0] : null;
  } catch {
    return null;
  }
}

/**
 * Probes whether a module is importable (i.e., installed in node_modules).
 * Uses dynamic import — same mechanism as `loadBuiltinModule` so detection
 * behavior matches what the runtime will actually encounter.
 */
async function isModuleInstalled(modulePath: string): Promise<boolean> {
  try {
    await import(/* @vite-ignore */ modulePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detects built-in modules enabled in config but not installed, and
 * auto-installs them using the project's package manager.
 *
 * Behavior:
 * - When `autoInstall` is `false`, only prints warnings with install commands.
 * - When `autoInstall` is `true` and a package.json exists, runs the install.
 * - Version pinning: installs `@ubean/<pkg>@^<ubean-version>` to keep in sync.
 * - Failures fall back to warnings (non-fatal — prepare should still proceed).
 */
async function ensureBuiltinModules(cwd: string, config: ResolvedConfig, autoInstall: boolean): Promise<void> {
  const missing: { key: string; packageName: string }[] = [];

  for (const builtin of BUILTIN_MODULES) {
    const configValue = config[builtin.key as keyof ResolvedConfig];
    if (isBuiltinDisabled(configValue)) continue;

    const packageName = extractPackageName(builtin.modulePath);
    const installed = await isModuleInstalled(builtin.modulePath);
    if (!installed) {
      missing.push({ key: builtin.key, packageName });
    }
  }

  if (missing.length === 0) return;

  const pm = detectPackageManager(cwd);
  const ubeanVersion = getUbeanVersion(cwd);

  // Pin to ubean's major.minor.patch range to avoid mismatched versions.
  const packagesToInstall = missing.map(m => (ubeanVersion ? `${m.packageName}@^${ubeanVersion}` : m.packageName));

  if (!autoInstall || !existsSync(join(cwd, 'package.json'))) {
    for (const m of missing) {
      const versionSuffix = ubeanVersion ? `@^${ubeanVersion}` : '';
      logger.warn(
        `Built-in module "${m.key}" is enabled but \`${m.packageName}\` is not installed. ` +
          `Run: ${pm} add ${m.packageName}${versionSuffix}`
      );
    }
    return;
  }

  logger.info(`Auto-installing missing built-in module packages: ${packagesToInstall.join(', ')}`);
  logger.info(`Using package manager: ${pm}`);

  const { cmd, args } = buildInstallCommand(pm, packagesToInstall);

  try {
    execSync([cmd, ...args].join(' '), {
      cwd,
      stdio: 'inherit',
      env: { ...process.env }
    });
    logger.success(`Installed: ${packagesToInstall.join(', ')}`);
  } catch (err) {
    logger.error(`Failed to auto-install packages: ${err instanceof Error ? err.message : String(err)}`);
    for (const m of missing) {
      const versionSuffix = ubeanVersion ? `@^${ubeanVersion}` : '';
      logger.warn(`Please install manually: ${pm} add ${m.packageName}${versionSuffix}`);
    }
  }
}

export const prepareCommand: CommandDef = {
  meta: {
    name: 'prepare',
    description: 'Generate type definitions and prepare the project (runs automatically before dev/build)'
  },
  args: {
    cwd: {
      type: 'string',
      description: 'Project root directory',
      default: '.'
    },
    install: {
      type: 'boolean',
      description: 'Auto-install missing built-in module packages (use --no-install to skip)',
      default: true
    }
  },
  async run({ args }) {
    const cwd = resolve(args.cwd || process.cwd());
    logger.start(`Preparing ubean project at ${cwd}...`);

    const config = await loadUbeanConfig(cwd);

    // Auto-install enabled built-in modules that are not yet installed.
    // Disabled via `--no-install` for CI environments where installs are
    // pre-managed. Failures fall back to warnings (non-fatal).
    await ensureBuiltinModules(cwd, config, args.install !== false);

    const typesDir = '.ubean';
    await ensureBuildDir(cwd, typesDir);

    logger.info('Scanning project files...');
    const result = await scanProject({
      cwd,
      srcDir: config.srcDir,
      dirs: config.dir,
      ignore: config.scanOptions?.ignore
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
      imports: config.imports,
      components: config.components,
      composablesDirs: config.imports.dirs,
      componentsDirs: config.components.dirs
    });

    for (const file of codegenResult.generated) {
      logger.success(`Generated ${file.replace(`${cwd}/`, '')}`);
    }

    logger.success('Prepare complete!');
  }
};
