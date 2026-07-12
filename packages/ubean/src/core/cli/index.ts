import { defineCommand, runMain } from 'citty';
import { configCommand } from './config';
import { buildCommand } from './build';
import { devCommand } from './dev';
import { devtoolsCommand } from './devtools';
import { envCommand } from './env';
import { initCommand } from './init';
import { pageCommand } from './page';
import { prepareCommand } from './prepare';
import { previewCommand } from './preview';
import { apiCommand, cronCommand, layoutCommand, middlewareCommand, pluginCommand } from './scaffold-commands';

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
    init: initCommand,
    page: pageCommand,
    env: envCommand,
    config: configCommand,
    devtools: devtoolsCommand,
    api: apiCommand,
    layout: layoutCommand,
    middleware: middlewareCommand,
    cron: cronCommand,
    plugin: pluginCommand
  }
});

runMain(main);
