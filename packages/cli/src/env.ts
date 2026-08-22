import { getLogger } from '@ubean/shared/logger';
import type { CommandDef } from 'citty';
import { createFsOps } from './shared';

const logger = getLogger('cli');

interface EnvVar {
  key: string;
  value: string;
  comment?: string;
  public?: boolean;
}

function parseEnvContent(content: string): EnvVar[] {
  const vars: EnvVar[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    const isPublic = key.startsWith('UBEAN_PUBLIC_') || key.startsWith('VITE_') || key.startsWith('PUBLIC_');
    vars.push({ key, value, public: isPublic });
  }

  return vars;
}

function serializeEnvVars(vars: EnvVar[]): string {
  return `${vars.map(v => `${v.key}=${v.value}`).join('\n')}\n`;
}

async function readEnvFile(fs: ReturnType<typeof createFsOps>, file: string): Promise<EnvVar[]> {
  try {
    const content = await fs.readFile(file);
    return parseEnvContent(content);
  } catch {
    return [];
  }
}

async function writeEnvFile(
  fs: ReturnType<typeof createFsOps>,
  file: string,
  vars: EnvVar[],
  dry = false
): Promise<boolean> {
  if (dry) return true;
  const content = serializeEnvVars(vars);
  await fs.writeFile(file, content);
  return true;
}

export const envCommand: CommandDef = {
  meta: {
    name: 'env',
    description: 'Manage environment variables'
  },
  subCommands: {
    add: {
      meta: {
        name: 'add',
        description: 'Add or update an environment variable'
      },
      args: {
        key: {
          type: 'positional',
          description: 'Variable name (e.g., DATABASE_URL, UBEAN_PUBLIC_API_URL)'
        },
        value: {
          type: 'positional',
          description: 'Variable value'
        },
        file: {
          type: 'string',
          description: 'Environment file',
          default: '.env'
        },
        public: {
          type: 'boolean',
          description: 'Mark as public (prefix with UBEAN_PUBLIC_)',
          default: false
        },
        force: {
          type: 'boolean',
          description: 'Overwrite existing variable without confirmation',
          default: false,
          alias: 'f'
        },
        dry: {
          type: 'boolean',
          description: 'Show what would be changed',
          default: false
        }
      },
      async run({ args }) {
        const cwd = process.cwd();
        const fs = createFsOps(cwd);
        const file = args.file as string;
        let key = args.key as string;
        const value = args.value as string;

        if (args.public && !key.startsWith('UBEAN_PUBLIC_') && !key.startsWith('VITE_') && !key.startsWith('PUBLIC_')) {
          key = `UBEAN_PUBLIC_${key}`;
        }

        const vars = await readEnvFile(fs, file);
        const existing = vars.find(v => v.key === key);

        if (existing && !args.force) {
          logger.warn(`Variable ${key} already exists in ${file} (use --force to overwrite)`);
          logger.info(`  Current value: ${existing.value}`);
          return;
        }

        if (existing) {
          existing.value = value;
        } else {
          vars.push({ key, value, public: key.startsWith('UBEAN_PUBLIC_') || key.startsWith('VITE_') });
        }

        await writeEnvFile(fs, file, vars, args.dry as boolean);

        if (args.dry) {
          logger.info(`[dry-run] Would ${existing ? 'update' : 'add'} ${key}=${value} in ${file}`);
        } else {
          logger.info(`${existing ? 'Updated' : 'Added'} ${key} in ${file}`);
        }

        if (key.startsWith('UBEAN_PUBLIC_') || key.startsWith('VITE_') || key.startsWith('PUBLIC_')) {
          logger.info(`  Note: ${key} is exposed to client-side code`);
        }
      }
    },

    remove: {
      meta: {
        name: 'remove',
        description: 'Remove an environment variable'
      },
      args: {
        key: {
          type: 'positional',
          description: 'Variable name to remove'
        },
        file: {
          type: 'string',
          description: 'Environment file',
          default: '.env'
        },
        dry: {
          type: 'boolean',
          description: 'Show what would be removed',
          default: false
        }
      },
      async run({ args }) {
        const cwd = process.cwd();
        const fs = createFsOps(cwd);
        const file = args.file as string;
        const key = args.key as string;

        const vars = await readEnvFile(fs, file);
        const index = vars.findIndex(v => v.key === key);

        if (index === -1) {
          logger.warn(`Variable ${key} not found in ${file}`);
          return;
        }

        vars.splice(index, 1);

        if (args.dry) {
          logger.info(`[dry-run] Would remove ${key} from ${file}`);
        } else {
          await writeEnvFile(fs, file, vars);
          logger.info(`Removed ${key} from ${file}`);
        }
      }
    },

    list: {
      meta: {
        name: 'list',
        description: 'List environment variables'
      },
      args: {
        file: {
          type: 'string',
          description: 'Environment file',
          default: '.env'
        },
        public: {
          type: 'boolean',
          description: 'Show only public variables',
          default: false
        }
      },
      async run({ args }) {
        const cwd = process.cwd();
        const fs = createFsOps(cwd);
        const file = args.file as string;

        if (!(await fs.exists(file))) {
          logger.info(`${file} does not exist`);
          return;
        }

        const vars = await readEnvFile(fs, file);
        const filtered = args.public ? vars.filter(v => v.public) : vars;

        if (filtered.length === 0) {
          logger.info(`No variables found in ${file}${args.public ? ' (public only)' : ''}`);
          return;
        }

        logger.info(`Variables in ${file} (${filtered.length}):`);
        for (const v of filtered) {
          const suffix = v.public ? ' [public]' : '';
          logger.info(`  ${v.key}=${v.value}${suffix}`);
        }

        const publicCount = vars.filter(v => v.public).length;
        const privateCount = vars.length - publicCount;
        logger.info(`\n  ${publicCount} public, ${privateCount} private`);
      }
    },

    init: {
      meta: {
        name: 'init',
        description: 'Create .env and .env.example files from template'
      },
      args: {
        force: {
          type: 'boolean',
          description: 'Overwrite existing files',
          default: false,
          alias: 'f'
        },
        dry: {
          type: 'boolean',
          description: 'Show what would be created',
          default: false
        }
      },
      async run({ args }) {
        const cwd = process.cwd();
        const fs = createFsOps(cwd);

        const defaultEnv = `# ubean environment variables
# Server-only variables (never exposed to client)
DATABASE_URL=
SESSION_SECRET=

# Public variables (exposed to client - prefix with UBEAN_PUBLIC_)
# UBEAN_PUBLIC_API_URL=/api
`;

        const exampleEnv = `# Example environment variables
DATABASE_URL=your-database-url
SESSION_SECRET=your-session-secret
# UBEAN_PUBLIC_API_URL=/api
`;

        const files: Array<[string, string]> = [
          ['.env', defaultEnv],
          ['.env.example', exampleEnv]
        ];

        for (const [file, content] of files) {
          if ((await fs.exists(file)) && !args.force) {
            logger.warn(`Skipping ${file} (already exists, use --force to overwrite)`);
            continue;
          }
          if (args.dry) {
            logger.info(`[dry-run] Would create ${file}`);
          } else {
            await fs.writeFile(file, content);
            logger.info(`Created ${file}`);
          }
        }

        logger.info('\nTip: Add .env to .gitignore (but commit .env.example)');
      }
    }
  }
};
