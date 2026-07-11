import type { CommandDef } from 'citty';
import { join, extname } from 'node:path';
import { createFsOps } from './shared';
import { renderPageTemplate, renderApiTemplate, toKebabCase, toPascalCase } from './shared';

type ScaffoldType = 'page' | 'api' | 'layout' | 'middleware';

interface ScaffoldOptions {
  cwd?: string;
  type: ScaffoldType;
  path: string;
  method?: string;
  force?: boolean;
  dry?: boolean;
}

interface ScaffoldResult {
  created: string[];
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
      return join(srcDir, 'pages');
    case 'api':
      return join(srcDir, 'api');
    case 'layout':
      return join(srcDir, 'layouts');
    case 'middleware':
      return join(srcDir, 'middleware');
    default:
      return srcDir;
  }
}

function resolveTargetPath(baseDir: string, path: string, type: ScaffoldType): string {
  let normalizedPath = path.startsWith('/') ? path.slice(1) : path;

  if (normalizedPath === '' || normalizedPath === '/') {
    normalizedPath = type === 'page' ? 'index' : 'index';
  }

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

  if (normalizedPath.endsWith('.ts') || normalizedPath.endsWith('.js')) {
    return join(baseDir, normalizedPath);
  }

  const ext = '.ts';
  if (normalizedPath.endsWith('/') || normalizedPath === '') {
    return join(baseDir, normalizedPath, `index${ext}`);
  }

  if ((type === 'api' || type === 'middleware') && !normalizedPath.includes('.')) {
    return join(baseDir, `${normalizedPath}${ext}`);
  }

  return join(baseDir, normalizedPath);
}

function extractNameFromPath(filePath: string, type: ScaffoldType): string {
  const basename = filePath.split('/').pop() || '';
  const nameWithoutExt = basename.replace(extname(basename), '');

  if (nameWithoutExt === 'index') {
    const parts = filePath.split('/');
    const parentDir = parts[parts.length - 2];
    return parentDir ? toPascalCase(parentDir) : 'Index';
  }

  if (type === 'page' || type === 'layout') {
    return toPascalCase(nameWithoutExt);
  }

  return toKebabCase(nameWithoutExt);
}

function getTemplateContent(type: ScaffoldType, name: string, path: string, method?: string): string {
  switch (type) {
    case 'page':
      return renderPageTemplate({
        name,
        path: `/${path.replace(/\.vue$/, '').replace(/\/index$/, '')}`,
        kebabName: '',
        pascalName: '',
        camelName: ''
      });
    case 'api':
      return renderApiTemplate({
        name,
        method: method || 'GET',
        path: `/api/${path.replace(/\.ts$/, '').replace(/\/index$/, '')}`,
        kebabName: ''
      });
    case 'layout':
      return `<template>
  <div class="${toKebabCase(name)}-layout">
    <slot />
  </div>
</template>

<script setup lang="ts">
definePage({
  layout: false
});
</script>
`;
    case 'middleware':
      return `import { defineMiddleware } from 'ubean';

export default defineMiddleware(async (c, next) => {
  console.log('${name} middleware');
  await next();
});
`;
    default:
      return '';
  }
}

export async function scaffold(options: ScaffoldOptions): Promise<ScaffoldResult> {
  const cwd = options.cwd || process.cwd();
  const fs = createFsOps(cwd);
  const result: ScaffoldResult = { created: [], skipped: [], errors: [] };

  try {
    const baseDir = getDirForType(cwd, options.type);
    const targetPath = resolveTargetPath(baseDir, options.path, options.type);
    const relativePath = targetPath.replace(cwd + '/', '');

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
    const content = getTemplateContent(options.type, name, options.path, options.method);

    await fs.writeFile(relativePath, content);
    result.created.push(relativePath);
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
  }

  return result;
}

export async function listScaffoldableFiles(cwd: string, type: ScaffoldType): Promise<string[]> {
  const fs = createFsOps(cwd);
  const baseDir = getDirForType(cwd, type);
  const files = await fs.listFiles(baseDir.replace(cwd + '/', ''));
  return files.map(f => f.replace(cwd + '/', ''));
}

const scaffoldTypes = ['page', 'api', 'layout', 'middleware'] as const;

export const pageCommand: CommandDef = {
  meta: {
    name: 'page',
    description: 'Scaffold pages, api routes, layouts, and middleware'
  },
  subCommands: {
    add: {
      meta: {
        name: 'add',
        description: 'Add a new page, api route, layout, or middleware'
      },
      args: {
        path: {
          type: 'positional',
          description: 'Route path (e.g., users/[id], api/users)'
        },
        type: {
          type: 'string',
          description: 'Type: page, api, layout, middleware',
          default: 'page'
        },
        method: {
          type: 'string',
          description: 'HTTP method for API routes (GET, POST, etc.)',
          default: 'GET'
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

        if (!scaffoldTypes.includes(type)) {
          logger.error(`Invalid type: ${type}. Must be one of: ${scaffoldTypes.join(', ')}`);
          return;
        }

        const result = await scaffold({
          cwd: process.cwd(),
          type,
          path: args.path as string,
          method: args.method as string,
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

    list: {
      meta: {
        name: 'list',
        description: 'List existing scaffoldable files'
      },
      args: {
        type: {
          type: 'string',
          description: 'Type to list: page, api, layout, middleware',
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
