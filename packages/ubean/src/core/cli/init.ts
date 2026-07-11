import type { CommandDef } from 'citty';

export const initCommand: CommandDef = {
  meta: {
    name: 'init',
    description: 'Initialize a new ubean project interactively'
  },
  args: {
    dir: {
      type: 'positional',
      description: 'Directory to initialize',
      default: '.'
    },
    force: {
      type: 'boolean',
      description: 'Overwrite existing files',
      default: false
    }
  },
  async run() {
    const { logger } = await import('../log');
    logger.info('ubean init interactive wizard coming in Phase 2');
  }
};
