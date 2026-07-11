import { consola } from 'consola';

export const logger = consola.withTag('ubean');

export { consola as baseLogger } from 'consola';
export { logger as default };
