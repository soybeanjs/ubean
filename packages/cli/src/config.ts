import { getLogger } from '@ubean/shared/logger';
import type { CommandDef } from 'citty';
import { exitCli } from './shared/exit';
import { createFsOps } from './shared/fs-ops';
import { renderTemplate } from './shared/templates';

const logger = getLogger('cli');

const CONFIG_TEMPLATE = `import { defineConfig } from 'ubean';

export default defineConfig({
  srcDir: 'src',
  build: { preset: '{{preset}}' }
});
`;

const CONFIG_EXAMPLE_FULL = `import { defineConfig } from 'ubean';

export default defineConfig({
  // Source directory
  srcDir: 'src',

  // Build options (platform preset lives here — a top-level \`preset\` field
  // is silently ignored, so always nest it under \`build\`).
  build: {
    preset: 'standard', // 'standard' | 'node' | 'cloudflare' | 'cloudflare-dev' | 'vercel' | 'vercel-edge' | 'netlify' | 'bun' | 'deno' | 'aws' | 'azure'
    outputDir: 'dist'
  },

  // Dev server options
  dev: {
    port: 9527,
    host: 'localhost'
  },

  // DevTools (disabled by default)
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
          description: 'Preset to use (standard, node, cloudflare, vercel, netlify, bun, deno, aws, azure, ...)',
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
          // `return` 而非 `await`：让 TS 知道该分支是终态的，后面的 configFile 才收窄成 string。
          return exitCli(1);
        }

        logger.info(fs.resolve(configFile));
      }
    }
  }
};
