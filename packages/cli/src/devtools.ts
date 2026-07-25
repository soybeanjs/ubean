import type { CommandDef } from 'citty';
import { consola } from 'consola';

const logger = consola.withTag('ubean-cli');

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
        logger.log('');
        logger.log('  DevTools is built into ubean and available in dev mode.');
        logger.log('');
        logger.log('  Access:');
        logger.log('    - Start dev server: pnpm dev');
        logger.log('    - Open DevTools: Press Shift+Alt+D in the browser, or visit /__ubean/devtools/');
        logger.log('');
        logger.log('  Configuration (ubean.config.ts):');
        logger.log('    devtools: {');
        logger.log('      enabled: true,     // Enable/disable DevTools (dev only)');
        logger.log('    }');
        logger.log('');
        logger.log('  Features:');
        logger.log('    - Routes: View all registered routes and their handlers');
        logger.log('    - Pages: Inspect page components and layouts');
        logger.log('    - APIs: Browse API routes with OpenAPI integration');
        logger.log('    - Middleware: View registered middleware');
        logger.log('    - Crons: See scheduled tasks and their status');
        logger.log('    - Config: View resolved configuration');
        logger.log('    - Plugins: Browse installed plugins and their tabs');
        logger.log('    - CRUD: Create/delete pages, APIs, layouts, middleware, crons');
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
        logger.log(`http://localhost:${port}/__ubean/devtools/`);
      }
    }
  }
};
