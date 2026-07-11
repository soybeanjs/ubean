import { existsSync, promises as fs } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';

export interface FsOpsOptions {
  cwd?: string;
}

export function resolvePath(cwd: string, ...paths: string[]): string {
  return resolve(cwd, ...paths);
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

export function existsSync_(path: string): boolean {
  return existsSync(path);
}

export async function readFile(path: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
  return fs.readFile(path, encoding);
}

export async function writeFile(path: string, content: string, encoding: BufferEncoding = 'utf-8'): Promise<void> {
  await ensureDir(dirname(path));
  await fs.writeFile(path, content, encoding);
}

export async function appendFile(path: string, content: string, encoding: BufferEncoding = 'utf-8'): Promise<void> {
  await fs.appendFile(path, content, encoding);
}

export async function remove(path: string): Promise<void> {
  await fs.rm(path, { recursive: true, force: true });
}

export async function copyFile(src: string, dest: string): Promise<void> {
  await ensureDir(dirname(dest));
  await fs.copyFile(src, dest);
}

export async function copyDir(src: string, dest: string, options?: { filter?: (file: string) => boolean }): Promise<void> {
  await ensureDir(dest);
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (options?.filter && !options.filter(srcPath)) {
      continue;
    }

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath, options);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}

export async function readDir(path: string): Promise<string[]> {
  return fs.readdir(path);
}

export async function readJson<T = unknown>(path: string): Promise<T> {
  const content = await readFile(path);
  return JSON.parse(content) as T;
}

export async function writeJson(path: string, data: unknown, indent = 2): Promise<void> {
  const content = JSON.stringify(data, null, indent) + '\n';
  await writeFile(path, content);
}

export interface BackupOptions {
  backupSuffix?: string;
  removeOriginal?: boolean;
}

export async function createBackup(path: string, options: BackupOptions = {}): Promise<string | null> {
  const suffix = options.backupSuffix || '.bak';
  const backupPath = `${path}${suffix}`;

  if (!(await exists(path))) {
    return null;
  }

  await copyFile(path, backupPath);

  if (options.removeOriginal) {
    await remove(path);
  }

  return backupPath;
}

export async function restoreBackup(path: string, options: BackupOptions = {}): Promise<boolean> {
  const suffix = options.backupSuffix || '.bak';
  const backupPath = `${path}${suffix}`;

  if (!(await exists(backupPath))) {
    return false;
  }

  await copyFile(backupPath, path);
  return true;
}

export async function removeBackup(path: string, options: BackupOptions = {}): Promise<void> {
  const suffix = options.backupSuffix || '.bak';
  const backupPath = `${path}${suffix}`;
  await remove(backupPath);
}

export async function listFiles(dir: string, pattern?: RegExp): Promise<string[]> {
  const results: string[] = [];

  async function walk(current: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.') && entry.name !== '.ubean') continue;
        await walk(fullPath);
      } else {
        if (!pattern || pattern.test(entry.name)) {
          results.push(fullPath);
        }
      }
    }
  }

  if (await exists(dir)) {
    await walk(dir);
  }

  return results;
}

export function createFsOps(cwd: string) {
  return {
    cwd,
    resolve: (...paths: string[]) => resolvePath(cwd, ...paths),
    exists: (path: string) => exists(resolvePath(cwd, path)),
    existsSync: (path: string) => existsSync_(resolvePath(cwd, path)),
    readFile: (path: string, enc?: BufferEncoding) => readFile(resolvePath(cwd, path), enc),
    writeFile: (path: string, content: string, enc?: BufferEncoding) => writeFile(resolvePath(cwd, path), content, enc),
    appendFile: (path: string, content: string, enc?: BufferEncoding) => appendFile(resolvePath(cwd, path), content, enc),
    remove: (path: string) => remove(resolvePath(cwd, path)),
    ensureDir: (path: string) => ensureDir(resolvePath(cwd, path)),
    copyFile: (src: string, dest: string) => copyFile(resolvePath(cwd, src), resolvePath(cwd, dest)),
    copyDir: (src: string, dest: string, opts?: { filter?: (f: string) => boolean }) => copyDir(resolvePath(cwd, src), resolvePath(cwd, dest), opts),
    readDir: (path: string) => readDir(resolvePath(cwd, path)),
    readJson: <T = unknown>(path: string) => readJson<T>(resolvePath(cwd, path)),
    writeJson: (path: string, data: unknown, indent?: number) => writeJson(resolvePath(cwd, path), data, indent),
    createBackup: (path: string, opts?: BackupOptions) => createBackup(resolvePath(cwd, path), opts),
    restoreBackup: (path: string, opts?: BackupOptions) => restoreBackup(resolvePath(cwd, path), opts),
    removeBackup: (path: string, opts?: BackupOptions) => removeBackup(resolvePath(cwd, path), opts),
    listFiles: (dir?: string, pattern?: RegExp) => listFiles(resolvePath(cwd, dir || '.'), pattern),
    relative: (to: string) => relative(cwd, resolve(cwd, to))
  };
}

export type FsOps = ReturnType<typeof createFsOps>;
