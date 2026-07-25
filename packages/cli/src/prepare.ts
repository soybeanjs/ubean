import { existsSync, mkdirSync } from 'node:fs';
import { generateTypes } from '@ubean/codegen';
import { loadUbeanConfig } from '@ubean/config';
import { scanProject } from '@ubean/routing';
import type { CommandDef } from 'citty';
import { consola } from 'consola';
import { join, resolve } from 'pathe';

const logger = consola.withTag('ubean-cli');

async function ensureBuildDir(cwd: string, buildDir: string): Promise<void> {
  const fullPath = join(cwd, buildDir);
  if (!existsSync(fullPath)) {
    mkdirSync(fullPath, { recursive: true });
  }
}

export const prepareCommand: CommandDef = {
  meta: {
    name: 'prepare',
    description: 'Generate type definitions and prepare the project (runs automatically before dev/build)'
  },
  args: {
    cwd: {
      type: 'string',
      description: 'Project root directory',
      default: '.'
    }
  },
  async run({ args }) {
    const cwd = resolve(args.cwd || process.cwd());
    logger.start(`Preparing ubean project at ${cwd}...`);

    const config = await loadUbeanConfig(cwd);
    const typesDir = '.ubean';
    await ensureBuildDir(cwd, typesDir);

    logger.info('Scanning project files...');
    const result = await scanProject({
      cwd,
      srcDir: config.srcDir,
      dirs: config.dir,
      ignore: config.scanOptions?.ignore
    });

    logger.info(
      `Found ${result.apiRoutes.length} API routes, ${result.pages.length} pages, ${result.layouts.length} layouts, ${result.middlewares.length} middlewares`
    );

    logger.info('Generating type definitions...');
    const codegenResult = await generateTypes(result, {
      cwd,
      srcDir: config.srcDir,
      buildDir: typesDir,
      dirs: config.dir,
      imports: config.imports,
      components: config.components,
      composablesDirs: config.imports.dirs,
      componentsDirs: config.components.dirs
    });

    for (const file of codegenResult.generated) {
      logger.success(`Generated ${file.replace(`${cwd}/`, '')}`);
    }

    logger.success('Prepare complete!');
  }
};
