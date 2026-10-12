import { existsSync } from 'node:fs';
import { join } from 'pathe';

/** 支持的包管理器（按锁文件探测，npm 为默认回退）。 */
export type PackageManager = 'pnpm' | 'yarn' | 'bun' | 'npm';

/**
 * 按锁文件探测包管理器。
 * 优先级：pnpm > yarn > bun > npm（npm 是回退，不依赖 lockfile 存在）。
 */
export function detectPackageManager(cwd: string): PackageManager {
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(cwd, 'bun.lockb')) || existsSync(join(cwd, 'bun.lock'))) return 'bun';
  return 'npm';
}

/**
 * 构造安装命令。
 *
 * - `pnpm` / `yarn` / `bun` → `add`
 * - `npm` → `install`
 * - `dev: true` → 追加各自的生产/开发依赖开关（`-D` / `-d`）
 */
export function buildInstallCommand(
  pm: PackageManager,
  packages: string[],
  options: { dev?: boolean } = {}
): { cmd: string; args: string[] } {
  const devFlag = options.dev ? (pm === 'bun' ? '-d' : '-D') : undefined;
  switch (pm) {
    case 'pnpm':
      return { cmd: 'pnpm', args: ['add', ...(devFlag ? [devFlag] : []), ...packages] };
    case 'yarn':
      return { cmd: 'yarn', args: ['add', ...(devFlag ? [devFlag] : []), ...packages] };
    case 'bun':
      return { cmd: 'bun', args: ['add', ...(devFlag ? [devFlag] : []), ...packages] };
    default:
      return { cmd: 'npm', args: ['install', ...(devFlag ? [devFlag] : []), ...packages] };
  }
}

/** 把 `{cmd, args}` 渲染成一行可复制粘贴的命令。 */
export function formatCommand(command: { cmd: string; args: string[] }): string {
  return [command.cmd, ...command.args].join(' ');
}
