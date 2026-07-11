import type { CommandDef } from 'citty';

export const previewCommand: CommandDef = {
  meta: {
    name: 'preview',
    description: 'Preview the production build'
  },
  args: {
    port: {
      type: 'string',
      description: 'Port to listen on',
      default: '4000'
    }
  },
  async run() {
    const { logger } = await import('../log');
    logger.info('Preview server skeleton coming in Phase 2');
  }
};
