import { getLogger } from '@ubean/shared/logger';
import type { CommandDef } from 'citty';
import { resolve, basename } from 'pathe';
import { createFsOps } from './shared/fs-ops';
import {
  scaffoldUnifyTemplate,
  scaffoldMinimalTemplate,
  scaffoldStarterTemplate,
  scaffoldBlogTemplate
} from './shared/unify-template';

const logger = getLogger('cli');

interface InitOptions {
  cwd: string;
  dir: string;
  force: boolean;
  template?: string;
  preset?: string;
  typescript?: boolean;
  git?: boolean;
  packageManager?: string;
  name?: string;
  nonInteractive?: boolean;
}

const TEMPLATES = [
  { value: 'unify', label: 'Unify (recommended, full-stack with islands/i18n/layouts/middleware)' },
  { value: 'minimal', label: 'Minimal (just a hello world page)' },
  { value: 'starter', label: 'Starter (includes pages/api/layouts)' },
  { value: 'blog', label: 'Blog (markdown-based blog structure)' }
];

const PRESETS = [
  { value: 'standard', label: 'Standard (Node.js/Bun compatible)' },
  { value: 'node', label: 'Node.js' },
  { value: 'cloudflare', label: 'Cloudflare Workers' }
];

const PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn', 'bun'];

async function prompt(question: string, defaultValue?: string): Promise<string> {
  const readline = await import('node:readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolvePromise => {
    const suffix = defaultValue ? ` (${defaultValue})` : '';
    rl.question(`${question}${suffix}: `, answer => {
      rl.close();
      resolvePromise(answer.trim() || defaultValue || '');
    });
  });
}

async function select(
  question: string,
  options: { value: string; label: string }[],
  defaultValue?: string
): Promise<string> {
  const readline = await import('node:readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log(`\n${question}`);
  options.forEach((opt, i) => {
    const marker = opt.value === defaultValue ? ' (default)' : '';
    console.log(`  ${i + 1}. ${opt.label}${marker} [${opt.value}]`);
  });

  return new Promise(resolvePromise => {
    rl.question('> ', answer => {
      rl.close();
      const idx = parseInt(answer, 10) - 1;
      if (!answer.trim() && defaultValue) {
        resolvePromise(defaultValue);
      } else if (idx >= 0 && idx < options.length) {
        resolvePromise(options[idx].value);
      } else {
        const found = options.find(o => o.value === answer.trim());
        resolvePromise(found ? found.value : defaultValue || options[0].value);
      }
    });
  });
}

async function confirm(question: string, defaultValue = true): Promise<boolean> {
  const readline = await import('node:readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const suffix = defaultValue ? ' (Y/n)' : ' (y/N)';

  return new Promise(resolvePromise => {
    rl.question(`${question}${suffix}: `, answer => {
      rl.close();
      const a = answer.trim().toLowerCase();
      if (!a) {
        resolvePromise(defaultValue);
      } else {
        resolvePromise(a === 'y' || a === 'yes');
      }
    });
  });
}

function isNonInteractive(): boolean {
  return !process.stdin.isTTY || process.env.CI !== undefined || process.env.NONINTERACTIVE !== undefined;
}

export async function scaffoldProject(options: InitOptions): Promise<void> {
  const targetDir = resolve(options.cwd, options.dir);
  const fs = createFsOps(targetDir);
  const projectName = options.name || (options.dir === '.' ? basename(options.cwd) : basename(options.dir));
  const pm = options.packageManager || 'npm';
  const nonInteractive = options.nonInteractive || isNonInteractive();

  const dirExists = await fs.exists('.');
  if (dirExists && !options.force) {
    const files = await fs.readDir('.').catch(() => []);
    const nonHiddenFiles = files.filter(f => !f.startsWith('.') && f !== 'node_modules');
    if (nonHiddenFiles.length > 0) {
      if (nonInteractive) {
        throw new Error(`Directory ${targetDir} is not empty. Use --force to overwrite.`);
      }
      const proceed = await confirm(`Directory ${targetDir} is not empty. Continue anyway?`, false);
      if (!proceed) {
        console.log('Aborted.');
        return;
      }
    }
  }

  const templateOptions = {
    name: projectName,
    preset: options.preset || 'standard',
    packageManager: pm
  };

  switch (options.template) {
    case 'unify':
      await scaffoldUnifyTemplate(fs, templateOptions);
      break;
    case 'minimal':
      await scaffoldMinimalTemplate(fs, templateOptions);
      break;
    case 'blog':
      await scaffoldBlogTemplate(fs, templateOptions);
      break;
    default:
      await scaffoldStarterTemplate(fs, templateOptions);
      break;
  }

  if (options.git) {
    try {
      const { execSync } = await import('node:child_process');
      execSync('git init', { cwd: targetDir, stdio: 'ignore' });
    } catch {}
  }

  console.log('\n✨ ubean project created successfully!\n');
  console.log(`Project: ${projectName}`);
  console.log(`Location: ${targetDir}`);
  console.log(`Preset: ${options.preset || 'standard'}`);
  console.log(`Template: ${options.template || 'unify'}`);
  console.log('\nNext steps:');
  if (options.dir !== '.') {
    console.log(`  cd ${options.dir}`);
  }
  console.log(`  ${pm} install`);
  console.log(`  ${pm} dev`);
  console.log('');
}

export const initCommand: CommandDef = {
  meta: {
    name: 'init',
    description: 'Initialize a new ubean project'
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
      default: false,
      alias: 'f'
    },
    name: {
      type: 'string',
      description: 'Project name'
    },
    template: {
      type: 'string',
      description: 'Project template (unify/minimal/starter/blog)'
    },
    preset: {
      type: 'string',
      description: 'Target preset (standard/node/cloudflare)'
    },
    packageManager: {
      type: 'string',
      description: 'Package manager (npm/pnpm/yarn/bun)',
      alias: 'pm'
    },
    git: {
      type: 'boolean',
      description: 'Initialize git repository'
    },
    yes: {
      type: 'boolean',
      description: 'Skip prompts and use defaults',
      default: false,
      alias: 'y'
    }
  },
  async run({ args, data }) {
    const cwd = data?.cwd || process.cwd();
    const nonInteractive = isNonInteractive() || args.yes;

    let template = args.template as string | undefined;
    let preset = args.preset as string | undefined;
    let packageManager = args.packageManager as string | undefined;
    let git = args.git as boolean | undefined;
    let name = args.name as string | undefined;

    logger.info('🚀 ubean project initializer');

    if (!nonInteractive) {
      name = name || (await prompt('Project name', args.dir === '.' ? basename(cwd) : args.dir));

      template = template || (await select('Select a template:', TEMPLATES, 'unify'));

      preset = preset || (await select('Select a preset:', PRESETS, 'standard'));

      packageManager = packageManager || (await prompt('Package manager (npm/pnpm/yarn/bun)', 'npm'));

      if (git === undefined) {
        git = await confirm('Initialize git repository?', true);
      }
    }

    const options: InitOptions = {
      cwd,
      dir: args.dir as string,
      force: args.force as boolean,
      template: template || 'unify',
      preset: preset || 'standard',
      packageManager: packageManager || 'npm',
      git: git !== false,
      name,
      nonInteractive
    };

    if (!PACKAGE_MANAGERS.includes(options.packageManager!)) {
      options.packageManager = 'npm';
    }

    await scaffoldProject(options);
  }
};
