import { existsSync, mkdirSync } from 'node:fs';
import type { CommandDef } from 'citty';
import { join, resolve } from 'pathe';
import { loadUbeanConfig } from '../config/loader';
import { generateTypes } from '../codegen';
import { logger } from '../log';
import { scanProject } from '../routing/scan';

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
    const buildDir = config.build.outputDir || '.ubean';
    await ensureBuildDir(cwd, buildDir);

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
    const codegenResult = await generateTypes(result, { cwd, buildDir });

    for (const file of codegenResult.generated) {
      logger.success(`Generated ${file.replace(`${cwd}/`, '')}`);
    }

    logger.success('Prepare complete!');
  }
};
