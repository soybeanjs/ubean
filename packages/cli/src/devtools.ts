import { getLogger } from '@ubean/logger';
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
        logger.info('    - Open DevTools: Press Shift+Alt+D in the browser, or visit /__ubean/devtools/');
        logger.info('');
        logger.info('  Configuration (ubean.config.ts):');
        logger.info('    devtools: {');
        logger.info('      enabled: true,     // Enable/disable DevTools (dev only)');
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
        logger.info(`http://localhost:${port}/__ubean/devtools/`);
      }
    }
  }
};
