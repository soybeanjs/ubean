import { kebabCase } from 'scule';
import { capitalize } from './string';

/* -------------------------------------------------------------------------- */
/* 通用路径工具函数（从 @ubean/content 迁入）                                   */
/* -------------------------------------------------------------------------- */

/**
 * 标准化路径：替换反斜杠、去除首尾多余斜杠、合并连续斜杠。
 */
export function normalizePath(path: string): string {
  return `/${path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '').replace(/\/+/g, '/')}`;
}

/**
 * 获取路径的目录部分（不含文件名）。
 */
export function getDirname(path: string): string {
  const parts = path.split('/');
  parts.pop();
  return parts.join('/') || '/';
}

/**
 * 获取路径的文件名部分（含扩展名）。
 */
export function getBasename(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1];
}

/**
 * 获取文件名的扩展名（小写，不含点）。
 */
export function getExtension(filename: string): string {
  const match = filename.match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : '';
}

/**
 * 获取文件名（不含扩展名）。
 */
export function getStem(filename: string): string {
  return filename.replace(/\.[^.]+$/, '');
}

/**
 * 将文件路径转换为人类可读的标题。
 */
export function pathToTitle(path: string): string {
  const stem = getStem(getBasename(path));
  if (stem === 'index') {
    return kebabCase(getBasename(getDirname(path)) || 'home')
      .split('-')
      .map(capitalize)
      .join(' ');
  }
  return kebabCase(stem).split('-').map(capitalize).join(' ');
}
