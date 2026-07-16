import { join, extname } from 'node:path';
import type { CommandDef } from 'citty';
import {
  createFsOps,
  renderPageTemplate,
  renderApiTemplate,
  renderLayoutTemplate,
  renderCronTemplate,
  renderPluginTemplate,
  toKebabCase,
  toPascalCase,
  toCamelCase
} from './shared';

export type ScaffoldType = 'page' | 'api' | 'layout' | 'middleware' | 'reuse' | 'cron' | 'plugin';

export interface ScaffoldOptions {
  cwd?: string;
  type: ScaffoldType;
  path: string;
  method?: string;
  schedule?: string;
  force?: boolean;
  dry?: boolean;
}

export interface ScaffoldResult {
  created: string[];
  deleted: string[];
  restored: string[];
  skipped: string[];
  errors: string[];
}

function getSrcDir(cwd: string): string {
  return join(cwd, 'src');
}

function getDirForType(cwd: string, type: ScaffoldType): string {
  const srcDir = getSrcDir(cwd);
  switch (type) {
    case 'page':
    case 'reuse':
      return join(srcDir, 'pages');
    case 'api':
      return join(srcDir, 'api');
    case 'layout':
      return join(srcDir, 'layouts');
    case 'middleware':
      return join(srcDir, 'middleware');
    case 'cron':
      return join(srcDir, 'server', 'crons');
    case 'plugin':
      return join(srcDir, 'plugins');
    default:
      return srcDir;
  }
}

function resolveTargetPath(baseDir: string, path: string, type: ScaffoldType): string {
  let normalizedPath = path.startsWith('/') ? path.slice(1) : path;

  if (normalizedPath === '' || normalizedPath === '/') {
    normalizedPath = type === 'page' || type === 'reuse' ? 'index' : 'index';
  }

  if (type === 'page' || type === 'layout' || type === 'reuse') {
    if (type === 'page' || type === 'layout') {
      if (normalizedPath.endsWith('.vue')) {
        return join(baseDir, normalizedPath);
      }
      const ext = '.vue';
      if (normalizedPath.endsWith('/') || normalizedPath === '') {
        return join(baseDir, normalizedPath, `index${ext}`);
      }
      return join(baseDir, `${normalizedPath}${ext}`);
    }

    if (normalizedPath.endsWith('.reuse.ts')) {
      return join(baseDir, normalizedPath);
    }
    if (normalizedPath.endsWith('.ts')) {
      return join(baseDir, normalizedPath.replace(/\.ts$/, '.reuse.ts'));
    }
    const ext = '.reuse.ts';
    if (normalizedPath.endsWith('/') || normalizedPath === '') {
      return join(baseDir, normalizedPath, `index${ext}`);
    }
    return join(baseDir, `${normalizedPath}${ext}`);
  }

  if (normalizedPath.endsWith('.ts') || normalizedPath.endsWith('.js')) {
    return join(baseDir, normalizedPath);
  }

  const ext = '.ts';
  if (normalizedPath.endsWith('/') || normalizedPath === '') {
    return join(baseDir, normalizedPath, `index${ext}`);
  }

  if (
    (type === 'api' || type === 'middleware' || type === 'cron' || type === 'plugin') &&
    !normalizedPath.includes('.')
  ) {
    return join(baseDir, `${normalizedPath}${ext}`);
  }

  return join(baseDir, normalizedPath);
}

function sanitizeNameSegment(seg: string): string {
  return seg
    .replace(/^\[\.\.\.(.+)\]$/, 'All$1')
    .replace(/^\[\[(.+)\]\]$/, '$1Optional')
    .replace(/^\[(.+)\]$/, '$1')
    .replace(/[^a-zA-Z0-9$_]/g, '');
}

function extractNameFromPath(filePath: string, _type: ScaffoldType): string {
  const parts = filePath.split('/');
  const basename = parts.pop() || '';
  let nameWithoutExt = basename.replace(extname(basename), '');
  if (nameWithoutExt.endsWith('.reuse')) {
    nameWithoutExt = nameWithoutExt.slice(0, -'.reuse'.length);
  }

  const segments: string[] = [];
  for (const part of parts) {
    const cleaned = sanitizeNameSegment(part);
    if (cleaned) segments.push(toPascalCase(cleaned));
  }

  if (nameWithoutExt !== 'index') {
    segments.push(toPascalCase(sanitizeNameSegment(nameWithoutExt)));
  } else if (segments.length === 0) {
    return 'Index';
  }

  return segments.join('') || 'Index';
}

function getTemplateContent(
  type: ScaffoldType,
  name: string,
  path: string,
  method?: string,
  schedule?: string
): string {
  switch (type) {
    case 'page': {
      const routePath = `/${path.replace(/\.vue$/, '').replace(/\/index$/, '')}`;
      return renderPageTemplate({
        name,
        path: routePath,
        kebabName: toKebabCase(name),
        pascalName: name,
        camelName: toCamelCase(name)
      });
    }
    case 'reuse': {
      return `import { definePage } from 'ubean';

export default definePage({
  name: '${name}'
});
`;
    }
    case 'api':
      return renderApiTemplate({
        name,
        method: method || 'GET',
        path: `/api/${path.replace(/\.ts$/, '').replace(/\/index$/, '')}`,
        kebabName: toKebabCase(name)
      });
    case 'layout':
      return renderLayoutTemplate({
        name,
        path: `/${path.replace(/\.vue$/, '').replace(/\/index$/, '')}`,
        pascalName: toPascalCase(name)
      });
    case 'middleware':
      return `import { defineMiddleware } from 'ubean';

export default defineMiddleware(async (c, next) => {
  console.log('${name} middleware');
  await next();
});
`;
    case 'cron':
      return renderCronTemplate({
        name,
        schedule: schedule || '* * * * *',
        kebabName: toKebabCase(name)
      });
    case 'plugin':
      return renderPluginTemplate({
        name,
        kebabName: toKebabCase(name),
        pascalName: toPascalCase(name)
      });
    default:
      return '';
  }
}

export async function scaffold(options: ScaffoldOptions): Promise<ScaffoldResult> {
  const cwd = options.cwd || process.cwd();
  const fs = createFsOps(cwd);
  const result: ScaffoldResult = { created: [], deleted: [], restored: [], skipped: [], errors: [] };

  try {
    const baseDir = getDirForType(cwd, options.type);
    const targetPath = resolveTargetPath(baseDir, options.path, options.type);
    const relativePath = targetPath.replace(`${cwd}/`, '');

    if (await fs.exists(relativePath)) {
      if (!options.force) {
        result.skipped.push(relativePath);
        return result;
      }
      await fs.createBackup(relativePath);
    }

    if (options.dry) {
      result.created.push(relativePath);
      return result;
    }

    const name = extractNameFromPath(relativePath, options.type);
    const content = getTemplateContent(options.type, name, options.path, options.method, options.schedule);

    await fs.writeFile(relativePath, content);
    result.created.push(relativePath);
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
  }

  return result;
}

export async function deleteScaffold(options: {
  cwd?: string;
  type: ScaffoldType;
  path: string;
  force?: boolean;
  dry?: boolean;
}): Promise<ScaffoldResult> {
  const cwd = options.cwd || process.cwd();
  const fs = createFsOps(cwd);
  const result: ScaffoldResult = { created: [], deleted: [], restored: [], skipped: [], errors: [] };

  try {
    const baseDir = getDirForType(cwd, options.type);
    const targetPath = resolveTargetPath(baseDir, options.path, options.type);
    const relativePath = targetPath.replace(`${cwd}/`, '');

    if (!(await fs.exists(relativePath))) {
      result.errors.push(`${relativePath} does not exist`);
      return result;
    }

    if (options.dry) {
      result.deleted.push(relativePath);
      return result;
    }

    if (options.force) {
      await fs.remove(relativePath);
      result.deleted.push(relativePath);
      return result;
    }

    await fs.createBackup(relativePath, { removeOriginal: true });
    result.deleted.push(relativePath);
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
  }

  return result;
}

export async function recoverScaffold(options: {
  cwd?: string;
  type: ScaffoldType;
  path: string;
  dry?: boolean;
}): Promise<ScaffoldResult> {
  const cwd = options.cwd || process.cwd();
  const fs = createFsOps(cwd);
  const result: ScaffoldResult = { created: [], deleted: [], restored: [], skipped: [], errors: [] };

  try {
    const baseDir = getDirForType(cwd, options.type);
    const targetPath = resolveTargetPath(baseDir, options.path, options.type);
    const relativePath = targetPath.replace(`${cwd}/`, '');

    if (options.dry) {
      const backupPath = `${relativePath}.bak`;
      if (await fs.exists(backupPath)) {
        result.restored.push(relativePath);
      } else {
        result.errors.push(`No backup found for ${relativePath}`);
      }
      return result;
    }

    const restored = await fs.restoreBackup(relativePath);
    if (restored) {
      result.restored.push(relativePath);
      await fs.removeBackup(relativePath);
    } else {
      result.errors.push(`No backup found for ${relativePath}`);
    }
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
  }

  return result;
}

export async function listScaffoldableFiles(cwd: string, type: ScaffoldType): Promise<string[]> {
  const fs = createFsOps(cwd);
  const baseDir = getDirForType(cwd, type);
  const relativeBase = baseDir.replace(`${cwd}/`, '');
  const files = await fs.listFiles(relativeBase);
  return files.map(f => f.replace(`${cwd}/`, ''));
}

const scaffoldTypes = ['page', 'api', 'layout', 'middleware', 'cron', 'plugin'] as const;
const allTypes = ['page', 'api', 'layout', 'middleware', 'reuse', 'cron', 'plugin'] as const;

export const pageCommand: CommandDef = {
  meta: {
    name: 'page',
    description: 'Scaffold pages, api routes, layouts, middleware, crons, and plugins'
  },
  subCommands: {
    add: {
      meta: {
        name: 'add',
        description: 'Add a new page, api route, layout, middleware, cron, or plugin'
      },
      args: {
        path: {
          type: 'positional',
          description: 'Route path (e.g., users/[id], api/users, crons/daily)'
        },
        type: {
          type: 'string',
          description: 'Type: page, api, layout, middleware, cron, plugin',
          default: 'page'
        },
        method: {
          type: 'string',
          description: 'HTTP method for API routes (GET, POST, etc.)',
          default: 'GET'
        },
        schedule: {
          type: 'string',
          description: 'Cron schedule expression for cron tasks',
          default: '* * * * *'
        },
        force: {
          type: 'boolean',
          description: 'Overwrite existing files (creates .bak backup)',
          default: false,
          alias: 'f'
        },
        dry: {
          type: 'boolean',
          description: 'Show what would be created without writing files',
          default: false
        }
      },
      async run({ args }) {
        const { logger } = await import('../log');
        const type = args.type as ScaffoldType;

        // @ts-expect-error ignore type type
        if (!scaffoldTypes.includes(type)) {
          logger.error(`Invalid type: ${type}. Must be one of: ${scaffoldTypes.join(', ')}`);
          return;
        }

        const result = await scaffold({
          cwd: process.cwd(),
          type,
          path: args.path as string,
          method: args.method as string,
          schedule: args.schedule as string,
          force: args.force as boolean,
          dry: args.dry as boolean
        });

        for (const file of result.created) {
          logger.success(`${args.dry ? '[dry-run] Would create' : 'Created'} ${file}`);
        }
        for (const file of result.skipped) {
          logger.warn(`Skipped ${file} (already exists, use --force to overwrite)`);
        }
        for (const err of result.errors) {
          logger.error(err);
        }
      }
    },

    'add-reuse': {
      meta: {
        name: 'add-reuse',
        description: 'Add a new reusable page component (.reuse.ts)'
      },
      args: {
        path: {
          type: 'positional',
          description: 'Reusable page path (e.g., users/[id])'
        },
        force: {
          type: 'boolean',
          description: 'Overwrite existing files (creates .bak backup)',
          default: false,
          alias: 'f'
        },
        dry: {
          type: 'boolean',
          description: 'Show what would be created without writing files',
          default: false
        }
      },
      async run({ args }) {
        const { logger } = await import('../log');
        const result = await scaffold({
          cwd: process.cwd(),
          type: 'reuse',
          path: args.path as string,
          force: args.force as boolean,
          dry: args.dry as boolean
        });

        for (const file of result.created) {
          logger.success(`${args.dry ? '[dry-run] Would create' : 'Created'} ${file}`);
        }
        for (const file of result.skipped) {
          logger.warn(`Skipped ${file} (already exists, use --force to overwrite)`);
        }
        for (const err of result.errors) {
          logger.error(err);
        }
      }
    },

    delete: {
      meta: {
        name: 'delete',
        description: 'Delete a scaffold file (creates backup by default)'
      },
      args: {
        path: {
          type: 'positional',
          description: 'Path to delete'
        },
        type: {
          type: 'string',
          description: 'Type: page, api, layout, middleware, reuse, cron, plugin',
          default: 'page'
        },
        force: {
          type: 'boolean',
          description: 'Delete permanently without creating backup',
          default: false,
          alias: 'f'
        },
        dry: {
          type: 'boolean',
          description: 'Show what would be deleted',
          default: false
        }
      },
      async run({ args }) {
        const { logger } = await import('../log');
        const type = args.type as ScaffoldType;

        if (!allTypes.includes(type)) {
          logger.error(`Invalid type: ${type}. Must be one of: ${allTypes.join(', ')}`);
          return;
        }

        const result = await deleteScaffold({
          cwd: process.cwd(),
          type,
          path: args.path as string,
          force: args.force as boolean,
          dry: args.dry as boolean
        });

        for (const file of result.deleted) {
          logger.success(
            `${args.dry ? '[dry-run] Would delete' : args.force ? 'Deleted' : 'Deleted (backup created)'} ${file}`
          );
        }
        for (const err of result.errors) {
          logger.error(err);
        }
      }
    },

    recovery: {
      meta: {
        name: 'recovery',
        description: 'Recover a deleted file from .bak backup'
      },
      args: {
        path: {
          type: 'positional',
          description: 'Path to recover'
        },
        type: {
          type: 'string',
          description: 'Type: page, api, layout, middleware, reuse, cron, plugin',
          default: 'page'
        },
        dry: {
          type: 'boolean',
          description: 'Check if recovery is possible',
          default: false
        }
      },
      async run({ args }) {
        const { logger } = await import('../log');
        const type = args.type as ScaffoldType;

        if (!allTypes.includes(type)) {
          logger.error(`Invalid type: ${type}. Must be one of: ${allTypes.join(', ')}`);
          return;
        }

        const result = await recoverScaffold({
          cwd: process.cwd(),
          type,
          path: args.path as string,
          dry: args.dry as boolean
        });

        for (const file of result.restored) {
          logger.success(`${args.dry ? '[dry-run] Backup exists for' : 'Recovered'} ${file}`);
        }
        for (const err of result.errors) {
          logger.error(err);
        }
      }
    },

    list: {
      meta: {
        name: 'list',
        description: 'List existing scaffoldable files'
      },
      args: {
        type: {
          type: 'string',
          description: 'Type to list: page, api, layout, middleware, reuse, cron, plugin',
          default: 'page'
        }
      },
      async run({ args }) {
        const { logger } = await import('../log');
        const type = args.type as ScaffoldType;
        const files = await listScaffoldableFiles(process.cwd(), type);

        if (files.length === 0) {
          logger.info(`No ${type} files found`);
          return;
        }

        logger.info(`Found ${files.length} ${type}(s):`);
        for (const file of files) {
          logger.log(`  ${file}`);
        }
      }
    }
  }
};
