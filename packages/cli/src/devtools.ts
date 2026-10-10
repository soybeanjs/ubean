import { getLogger } from '@ubean/shared/logger';
import type { CommandDef } from 'citty';

const logger = getLogger('cli');

export const devtoolsCommand: CommandDef = {
  meta: {
    name: 'devtools',
    description: 'Manage DevTools configuration and information'
  },
  subCommands: {
    info: {
      meta: {
        name: 'info',
        description: 'Show DevTools information'
      },
      async run() {
        logger.info('DevTools Information');
        logger.info('');
        logger.info('  DevTools is built into ubean and available in dev mode.');
        logger.info('');
        logger.info('  Access:');
        logger.info('    - Start dev server: pnpm dev');
        logger.info('    - Open the DevTools URL printed in the dev server banner (default /_devtools)');
        logger.info('      which redirects to the devframe hub shell.');
        logger.info('');
        logger.info('  Configuration (ubean.config.ts):');
        logger.info('    devtools: {');
        logger.info('      enabled: true,     // Enable/disable DevTools (dev only)');
        logger.info("      route: '/_devtools'  // Panel path (optional)");
        logger.info('    }');
        logger.info('');
        logger.info('  Features:');
        logger.info('    - Routes: View all registered routes and their handlers');
        logger.info('    - Pages: Inspect page components and layouts');
        logger.info('    - APIs: Browse API routes with OpenAPI integration');
        logger.info('    - Middleware: View registered middleware');
        logger.info('    - Crons: See scheduled tasks and their status');
        logger.info('    - Config: View resolved configuration');
        logger.info('    - Plugins: Browse installed plugins and their tabs');
        logger.info('    - CRUD: Create/delete pages, APIs, layouts, middleware, crons');
      }
    },

    path: {
      meta: {
        name: 'path',
        description: 'Print the DevTools URL path'
      },
      args: {
        port: {
          type: 'string',
          description: 'Dev server port',
          default: '9527'
        }
      },
      async run({ args }) {
        const port = args.port as string;
        logger.info(`http://localhost:${port}/_devtools`);
      }
    }
  }
};
