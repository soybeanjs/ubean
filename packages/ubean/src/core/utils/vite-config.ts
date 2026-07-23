import { existsSync } from 'node:fs';
import { join } from 'pathe';

const VITE_CONFIG_FILES = ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs'];

/**
 * 检测项目根目录下是否存在 vite 配置文件。
 * 返回找到的第一个文件的完整路径,如果都不存在则返回 null。
 */
export function findUserViteConfig(cwd: string): string | null {
  for (const file of VITE_CONFIG_FILES) {
    const fullPath = join(cwd, file);
    if (existsSync(fullPath)) return fullPath;
  }
  return null;
}
