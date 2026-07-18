import { existsSync } from 'node:fs';
import { join, resolve, isAbsolute } from 'node:path';
import { createFsOps, scaffold, deleteScaffold, recoverScaffold } from 'ubean';
import type { ScaffoldType } from 'ubean';
import type {
  CrudResult,
  CreateCrudParams,
  ReadCrudParams,
  UpdateCrudParams,
  DeleteCrudParams,
  CrudResourceType
} from '../types';
import type { DevToolsHooksInstance } from './hooks';

const SCAFFOLD_TYPES: CrudResourceType[] = ['page', 'api', 'layout', 'middleware', 'reuse'];
const SCAFFOLD_TYPE_SET = new Set<string>(SCAFFOLD_TYPES);

interface CrudServerOptions {
  cwd: string;
  hooks?: DevToolsHooksInstance;
  getEnv?: () => Record<string, string>;
  setEnv?: (env: Record<string, string>) => void;
  getConfig?: () => Record<string, unknown>;
  onFileChange?: () => void | Promise<void>;
}

export function createCrudServer(options: CrudServerOptions) {
  const { cwd, hooks, getEnv, setEnv, getConfig, onFileChange } = options;
  const fs = createFsOps(cwd);

  /**
   * Determine the correct base directory for a scaffold type, taking the
   * project's `dir` config into account. Returns an absolute path.
   *
   * For the 'api' type:
   *   1. Use `config.dir.routes` (default 'routes') relative to srcDir.
   *   2. If that directory doesn't exist, fall back to src/routes.
   *
   * For other types, the scaffold function's built-in defaults are used.
   */
  function getBaseDirForType(type: CrudResourceType): string | undefined {
    if (type !== 'api') return undefined;
    const config = getConfig?.() ?? {};
    const dir = (config.dir ?? {}) as Record<string, string>;
    const rawSrcDir = (config.srcDir as string) || 'src';
    const srcDir = isAbsolute(rawSrcDir) ? rawSrcDir : resolve(cwd, rawSrcDir);
    const routesDir = dir.routes || 'routes';
    const primaryDir = join(srcDir, routesDir);
    if (existsSync(primaryDir)) {
      return primaryDir;
    }
    const fallbackDir = join(srcDir, 'routes');
    if (existsSync(fallbackDir)) {
      return fallbackDir;
    }
    return primaryDir;
  }

  function normalizeResult(scaffoldRes: Awaited<ReturnType<typeof scaffold>>): CrudResult {
    const hasErrors = scaffoldRes.errors && scaffoldRes.errors.length > 0;
    return {
      success: !hasErrors,
      created: scaffoldRes.created,
      deleted: scaffoldRes.deleted,
      restored: scaffoldRes.restored,
      skipped: scaffoldRes.skipped,
      errors: scaffoldRes.errors
    };
  }

  async function notifyChange() {
    if (onFileChange) {
      await onFileChange();
    }
  }

  async function create(params: CreateCrudParams): Promise<CrudResult> {
    const { type, path, method, schedule, content, force } = params;

    if (hooks) {
      await hooks.runHook('beforeCreate', { type, path, content });
    }

    try {
      let result: CrudResult;

      if (SCAFFOLD_TYPE_SET.has(type)) {
        const baseDir = getBaseDirForType(type);
        const scaffoldRes = await scaffold({
          cwd,
          type: type as ScaffoldType,
          path,
          method,
          force,
          dry: false,
          ...(baseDir ? { baseDir } : {})
        });

        if (content && scaffoldRes.created && scaffoldRes.created.length > 0) {
          await fs.writeFile(scaffoldRes.created[0], content);
        }

        result = normalizeResult(scaffoldRes);
      } else if (type === 'cron') {
        const cronDir = 'src/server/crons';
        const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
        const fileName = normalizedPath.endsWith('.ts') ? normalizedPath : `${normalizedPath}.ts`;
        const filePath = join(cronDir, fileName);

        if ((await fs.exists(filePath)) && !force) {
          result = { success: false, skipped: [filePath], errors: ['File already exists'] };
        } else {
          const cronSchedule = schedule || '* * * * *';
          const cronContent =
            content ||
            `import { defineScheduled } from 'ubean';

export default defineScheduled({
  schedule: '${cronSchedule}',
  async run() {
    console.log('Cron job running');
  }
});
`;
          await fs.writeFile(filePath, cronContent);
          result = { success: true, created: [filePath] };
        }
      } else if (type === 'plugin') {
        const pluginDir = 'src/plugins';
        const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
        const fileName = normalizedPath.endsWith('.ts') ? normalizedPath : `${normalizedPath}.ts`;
        const filePath = join(pluginDir, fileName);

        if ((await fs.exists(filePath)) && !force) {
          result = { success: false, skipped: [filePath], errors: ['File already exists'] };
        } else {
          const pluginContent =
            content ||
            `import { definePlugin } from 'ubean';

export default definePlugin({
  name: '${fileName.replace(/\.ts$/, '').replace(/[^\w]/g, '-')}',
  setup() {
    console.log('Plugin loaded');
  }
});
`;
          await fs.writeFile(filePath, pluginContent);
          result = { success: true, created: [filePath] };
        }
      } else {
        result = { success: false, errors: [`Unsupported resource type: ${type}`] };
      }

      if (hooks) {
        await hooks.runHook('afterCreate', { type, path, content });
      }

      if (result.success) {
        await notifyChange();
      }

      return result;
    } catch (err) {
      return {
        success: false,
        errors: [err instanceof Error ? err.message : String(err)]
      };
    }
  }

  async function read(
    params: ReadCrudParams
  ): Promise<{ success: boolean; content?: string; data?: unknown; error?: string }> {
    const { type, path } = params;

    try {
      if (type === 'env') {
        if (getEnv) {
          return { success: true, data: getEnv() };
        }
        return { success: false, error: 'Env not available' };
      }

      if (type === 'config') {
        // If path is provided, treat as config file read (e.g. ubean.config.ts).
        if (path) {
          const fileExists = await fs.exists(path);
          if (!fileExists) {
            return { success: false, error: `File not found: ${path}` };
          }
          const content = await fs.readFile(path);
          return { success: true, content };
        }
        if (getConfig) {
          return { success: true, data: getConfig() };
        }
        return { success: false, error: 'Config not available' };
      }

      if (!path) {
        return { success: false, error: 'Path is required for file read' };
      }

      if (SCAFFOLD_TYPE_SET.has(type) || type === 'cron' || type === 'plugin') {
        const fileExists = await fs.exists(path);
        if (!fileExists) {
          return { success: false, error: `File not found: ${path}` };
        }
        const content = await fs.readFile(path);
        return { success: true, content };
      }

      return { success: false, error: `Unsupported resource type: ${type}` };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }

  async function update(params: UpdateCrudParams): Promise<CrudResult> {
    const { type, path, key, content, value } = params;

    if (hooks) {
      await hooks.runHook('beforeUpdate', { type, path, key, content, value });
    }

    try {
      let result: CrudResult;

      if (type === 'env') {
        if (!key) {
          result = { success: false, errors: ['Key is required for env update'] };
        } else if (!setEnv || !getEnv) {
          result = { success: false, errors: ['Env not available'] };
        } else {
          const env = { ...getEnv() };
          if (value !== undefined) {
            env[key] = value;
          } else {
            delete env[key];
          }
          setEnv(env);
          result = { success: true, updated: [`env:${key}`] };
        }
      } else if (type === 'config') {
        // Support writing config files (e.g. ubean.config.ts) when path is provided.
        if (!path) {
          result = { success: false, errors: ['Path is required for config file update'] };
        } else {
          const fileExists = await fs.exists(path);
          if (!fileExists) {
            result = { success: false, errors: [`File not found: ${path}`] };
          } else {
            await fs.writeFile(path, content || '');
            result = { success: true, updated: [path] };
          }
        }
      } else if (!path) {
        result = { success: false, errors: ['Path is required for file update'] };
      } else if (SCAFFOLD_TYPE_SET.has(type) || type === 'cron' || type === 'plugin') {
        const fileExists = await fs.exists(path);
        if (!fileExists) {
          result = { success: false, errors: [`File not found: ${path}`] };
        } else {
          await fs.writeFile(path, content || '');
          result = { success: true, updated: [path] };
        }
      } else {
        result = { success: false, errors: [`Unsupported resource type: ${type}`] };
      }

      if (hooks) {
        await hooks.runHook('afterUpdate', { type, path, key, content, value });
      }

      if (result.success) {
        await notifyChange();
      }

      return result;
    } catch (err) {
      return {
        success: false,
        errors: [err instanceof Error ? err.message : String(err)]
      };
    }
  }

  async function del(params: DeleteCrudParams): Promise<CrudResult> {
    const { type, path, key, force } = params;

    if (hooks) {
      await hooks.runHook('beforeDelete', { type, path, key });
    }

    try {
      let result: CrudResult;

      if (type === 'env') {
        if (!key) {
          result = { success: false, errors: ['Key is required for env delete'] };
        } else if (!setEnv || !getEnv) {
          result = { success: false, errors: ['Env not available'] };
        } else {
          const env = { ...getEnv() };
          delete env[key];
          setEnv(env);
          result = { success: true, deleted: [`env:${key}`] };
        }
      } else if (!path) {
        result = { success: false, errors: ['Path is required for file delete'] };
      } else if (SCAFFOLD_TYPE_SET.has(type)) {
        const baseDir = getBaseDirForType(type);
        const scaffoldRes = await deleteScaffold({
          cwd,
          type: type as ScaffoldType,
          path,
          force,
          dry: false,
          ...(baseDir ? { baseDir } : {})
        });
        result = normalizeResult(scaffoldRes);
      } else if (type === 'cron' || type === 'plugin') {
        const fileExists = await fs.exists(path);
        if (!fileExists) {
          result = { success: false, errors: [`File not found: ${path}`] };
        } else {
          if (force) {
            await fs.remove(path);
          } else {
            await fs.createBackup(path, { removeOriginal: true });
          }
          result = { success: true, deleted: [path] };
        }
      } else {
        result = { success: false, errors: [`Unsupported resource type: ${type}`] };
      }

      if (hooks) {
        await hooks.runHook('afterDelete', { type, path, key });
      }

      if (result.success) {
        await notifyChange();
      }

      return result;
    } catch (err) {
      return {
        success: false,
        errors: [err instanceof Error ? err.message : String(err)]
      };
    }
  }

  async function restore(path: string): Promise<CrudResult> {
    try {
      for (const type of SCAFFOLD_TYPES) {
        const baseDir = getBaseDirForType(type);
        const scaffoldRes = await recoverScaffold({
          cwd,
          type: type as ScaffoldType,
          path,
          dry: false,
          ...(baseDir ? { baseDir } : {})
        });
        if (scaffoldRes.restored && scaffoldRes.restored.length > 0) {
          await notifyChange();
          return normalizeResult(scaffoldRes);
        }
      }

      const backupPath = `${path}.bak`;
      if (await fs.exists(backupPath)) {
        await fs.copyFile(backupPath, path);
        await fs.removeBackup(path);
        await notifyChange();
        return { success: true, restored: [path] };
      }

      return { success: false, errors: [`No backup found for ${path}`] };
    } catch (err) {
      return {
        success: false,
        errors: [err instanceof Error ? err.message : String(err)]
      };
    }
  }

  return {
    create,
    read,
    update,
    delete: del,
    restore
  };
}

export type DevToolsCrudServer = ReturnType<typeof createCrudServer>;
