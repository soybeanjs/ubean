/**
 * @ubean/cli — CLI 入口(运行时调用 `runMain`)
 *
 * 此文件仅由 `bin/ubean-next.mjs` 导入,不应被库代码 import
 * (会产生启动 CLI 的副作用)。
 *
 * 库代码请从 `@ubean/cli`(主入口)导入 scaffold / fs-ops / templates。
 */
import { defineCommand, runMain } from 'citty';
import { configCommand } from './config';
import { analyzeCommand } from './analyze';
import { buildCommand } from './build';
import { devCommand } from './dev';
import { devtoolsCommand } from './devtools';
import { envCommand } from './env';
import { initCommand } from './init';
import { pageCommand } from './page';
import { prepareCommand } from './prepare';
import { previewCommand } from './preview';
import {
  apiCommand,
  cronCommand,
  layoutCommand,
  middlewareCommand,
  pluginCommand,
  scaffoldCommand
} from './scaffold-commands';

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
    plugin: pluginCommand,
    scaffold: scaffoldCommand,
    analyze: analyzeCommand
  }
});

runMain(main);
