import { getLogger } from '@ubean/shared/logger';
import type { CommandDef } from 'citty';
import { scaffold, deleteScaffold, recoverScaffold, listScaffoldableFiles } from './page';

const logger = getLogger('cli');

type ScaffoldTypeName = 'api' | 'layout' | 'middleware' | 'cron' | 'plugin';

interface CommandMeta {
  name: string;
  description: string;
  pathLabel: string;
  pathExample: string;
  extraArgs?: Record<string, any>;
}

const COMMAND_META: Record<ScaffoldTypeName, CommandMeta> = {
  api: {
    name: 'api',
    description: 'Scaffold API routes',
    pathLabel: 'API route path',
    pathExample: 'users/[id]'
  },
  layout: {
    name: 'layout',
    description: 'Scaffold layout components',
    pathLabel: 'Layout path',
    pathExample: 'admin'
  },
  middleware: {
    name: 'middleware',
    description: 'Scaffold middleware',
    pathLabel: 'Middleware path',
    pathExample: 'auth'
  },
  cron: {
    name: 'cron',
    description: 'Scaffold scheduled cron tasks',
    pathLabel: 'Cron task path',
    pathExample: 'daily-cleanup'
  },
  plugin: {
    name: 'plugin',
    description: 'Scaffold ubean plugins',
    pathLabel: 'Plugin path',
    pathExample: 'my-plugin'
  }
};

function createScaffoldCommand(type: ScaffoldTypeName): CommandDef {
  const meta = COMMAND_META[type];

  return {
    meta: {
      name: meta.name,
      description: meta.description
    },
    subCommands: {
      add: {
        meta: {
          name: 'add',
          description: `Add a new ${type}`
        },
        args: {
          path: {
            type: 'positional',
            description: `${meta.pathLabel} (e.g., ${meta.pathExample})`
          },
          ...(type === 'api'
            ? {
                method: {
                  type: 'string',
                  description: 'HTTP method for API routes (GET, POST, PUT, PATCH, DELETE)',
                  default: 'GET'
                }
              }
            : {}),
          ...(type === 'cron'
            ? {
                schedule: {
                  type: 'string',
                  description: 'Cron schedule expression (e.g., "0 0 * * *" for daily at midnight)',
                  default: '* * * * *'
                }
              }
            : {}),
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
          const result = await scaffold({
            cwd: process.cwd(),
            type,
            path: args.path as string,
            method: args.method as string | undefined,
            schedule: args.schedule as string | undefined,
            force: args.force as boolean,
            dry: args.dry as boolean
          });

          for (const file of result.created) {
            logger.info(`${args.dry ? '[dry-run] Would create' : 'Created'} ${file}`);
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
          description: `Delete a ${type} (creates backup by default)`
        },
        args: {
          path: {
            type: 'positional',
            description: `${meta.pathLabel} to delete`
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
          const result = await deleteScaffold({
            cwd: process.cwd(),
            type,
            path: args.path as string,
            force: args.force as boolean,
            dry: args.dry as boolean
          });

          for (const file of result.deleted) {
            logger.info(
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
          description: `Recover a deleted ${type} from .bak backup`
        },
        args: {
          path: {
            type: 'positional',
            description: `${meta.pathLabel} to recover`
          },
          dry: {
            type: 'boolean',
            description: 'Check if recovery is possible',
            default: false
          }
        },
        async run({ args }) {
          const result = await recoverScaffold({
            cwd: process.cwd(),
            type,
            path: args.path as string,
            dry: args.dry as boolean
          });

          for (const file of result.restored) {
            logger.info(`${args.dry ? '[dry-run] Backup exists for' : 'Recovered'} ${file}`);
          }
          for (const err of result.errors) {
            logger.error(err);
          }
        }
      },

      list: {
        meta: {
          name: 'list',
          description: `List existing ${type} files`
        },
        async run() {
          const files = await listScaffoldableFiles(process.cwd(), type);

          if (files.length === 0) {
            logger.info(`No ${type} files found`);
            return;
          }

          logger.info(`Found ${files.length} ${type}(s):`);
          for (const file of files) {
            logger.info(`  ${file}`);
          }
        }
      }
    }
  };
}

export const apiCommand = createScaffoldCommand('api');
export const layoutCommand = createScaffoldCommand('layout');
export const middlewareCommand = createScaffoldCommand('middleware');
export const cronCommand = createScaffoldCommand('cron');
export const pluginCommand = createScaffoldCommand('plugin');
