import { defineCommand, runMain } from 'citty';
import { buildCommand } from './build';
import { devCommand } from './dev';
import { initCommand } from './init';
import { prepareCommand } from './prepare';
import { previewCommand } from './preview';

const main = defineCommand({
  meta: {
    name: 'ubean',
    version: '0.0.1',
    description: 'Vue meta framework built on Vite-Plus with Hono'
  },
  subCommands: {
    dev: devCommand,
    build: buildCommand,
    prepare: prepareCommand,
    preview: previewCommand,
    init: initCommand
  }
});

runMain(main);
