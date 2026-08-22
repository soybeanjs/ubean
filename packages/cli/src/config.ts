import { getLogger } from '@ubean/shared/logger';
import type { CommandDef } from 'citty';
import { createFsOps } from './shared/fs-ops';
import { renderTemplate } from './shared/templates';

const logger = getLogger('cli');

const CONFIG_TEMPLATE = `import { defineConfig } from 'ubean';

export default defineConfig({
  srcDir: 'src',
  preset: '{{preset}}'
});
`;

const CONFIG_EXAMPLE_FULL = `import { defineConfig } from 'ubean';

export default defineConfig({
  // Source directory
  srcDir: 'src',

  // Preset: 'standard' | 'node' | 'cloudflare'
  preset: 'standard',

  // Dev server options
  dev: {
    port: 9527,
    host: 'localhost',
    open: false
  },

  // Build options
  build: {
    outDir: 'dist'
  },

  // View transitions
  viewTransitions: {
    enabled: true
  },

  // DevTools
  devtools: {
    enabled: true
  }
});
`;

async function findConfigFile(fs: ReturnType<typeof createFsOps>): Promise<string | null> {
  const candidates = ['ubean.config.ts', 'ubean.config.js', 'ubean.config.mjs', 'ubean.config.mts'];
  for (const name of candidates) {
    if (await fs.exists(name)) return name;
  }
  return null;
}

export const configCommand: CommandDef = {
  meta: {
    name: 'config',
    description: 'Manage ubean configuration'
  },
  subCommands: {
    init: {
      meta: {
        name: 'init',
        description: 'Create a default ubean.config.ts file'
      },
      args: {
        preset: {
          type: 'string',
          description: 'Preset to use (standard, node, cloudflare)',
          default: 'standard'
        },
        force: {
          type: 'boolean',
          description: 'Overwrite existing config file',
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
        const preset = args.preset as string;

        const existing = await findConfigFile(fs);
        if (existing && !args.force) {
          logger.warn(`Config file already exists: ${existing} (use --force to overwrite)`);
          return;
        }

        const content = renderTemplate(CONFIG_TEMPLATE, { variables: { preset } });

        if (args.dry) {
          logger.info('[dry-run] Would create ubean.config.ts');
          logger.info(`\n${content}`);
          return;
        }

        await fs.writeFile('ubean.config.ts', content);
        logger.info('Created ubean.config.ts');
      }
    },

    show: {
      meta: {
        name: 'show',
        description: 'Show current configuration file location and content'
      },
      async run() {
        const cwd = process.cwd();
        const fs = createFsOps(cwd);

        const configFile = await findConfigFile(fs);
        if (!configFile) {
          logger.warn('No ubean config file found. Run `ubean config init` to create one.');
          return;
        }

        logger.info(`Config file: ${configFile}`);
        logger.info('');
        const content = await fs.readFile(configFile);
        logger.info(content);
      }
    },

    example: {
      meta: {
        name: 'example',
        description: 'Show a full example configuration with all options'
      },
      async run() {
        logger.info(CONFIG_EXAMPLE_FULL);
      }
    },

    path: {
      meta: {
        name: 'path',
        description: 'Print resolved config file path'
      },
      async run() {
        const cwd = process.cwd();
        const fs = createFsOps(cwd);

        const configFile = await findConfigFile(fs);
        if (!configFile) {
          logger.error('No config file found');
          process.exit(1);
        }

        logger.info(fs.resolve(configFile));
      }
    }
  }
};
