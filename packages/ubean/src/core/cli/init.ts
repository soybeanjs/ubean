import type { CommandDef } from 'citty';
import { resolve, basename } from 'pathe';
import { createFsOps } from './shared/fs-ops';
import { renderTemplate } from './shared/templates';

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
  { value: 'minimal', label: 'Minimal (just a hello world page)' },
  { value: 'starter', label: 'Starter (recommended, includes pages/api/layouts)' },
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

async function select(question: string, options: { value: string; label: string }[], defaultValue?: string): Promise<string> {
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

const PACKAGE_JSON_TEMPLATE = `{
  "name": "{{name}}",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "ubean dev",
    "build": "ubean build",
    "preview": "ubean preview",
    "prepare": "ubean prepare",
    "typecheck": "vue-tsc --noEmit"
  },
  "dependencies": {
    "ubean": "latest",
    "vue": "^3.5.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vue-tsc": "^2.1.0"
  }
}
`;

const TSCONFIG_TEMPLATE = `{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "jsx": "preserve",
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "types": ["ubean/client"]
  },
  "include": ["src/**/*.ts", "src/**/*.vue", ".ubean/**/*.d.ts"],
  "exclude": ["node_modules", "dist"]
}
`;

const UBEAN_CONFIG_TEMPLATE = `import { defineConfig } from 'ubean';

export default defineConfig({
  srcDir: 'src',
  preset: '{{preset}}'
});
`;

const APP_VUE_TEMPLATE = `<template>
  <div id="app">
    <RouterView />
  </div>
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router';
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
}

#app {
  min-height: 100vh;
}
</style>
`;

const INDEX_PAGE_TEMPLATE = `<template>
  <div class="home-page">
    <h1>Welcome to ubean</h1>
    <p>Your Vue meta framework is ready! 🚀</p>
    <div class="links">
      <RouterLink to="/about">About</RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';

definePage({
  meta: {
    title: 'Home'
  }
});
</script>

<style scoped>
.home-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 2rem;
  text-align: center;
}

h1 {
  font-size: 3rem;
  margin-bottom: 1rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

p {
  color: #666;
  font-size: 1.2rem;
  margin-bottom: 2rem;
}

.links {
  display: flex;
  gap: 1rem;
}

a {
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  background: #667eea;
  color: white;
  text-decoration: none;
  font-weight: 500;
  transition: all 0.2s;
}

a:hover {
  background: #5a67d8;
  transform: translateY(-1px);
}
</style>
`;

const ABOUT_PAGE_TEMPLATE = `<template>
  <div class="about-page">
    <h1>About</h1>
    <p>This page is built with ubean.</p>
    <RouterLink to="/">Back to Home</RouterLink>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';

definePage({
  meta: {
    title: 'About'
  }
});
</script>

<style scoped>
.about-page {
  max-width: 800px;
  margin: 0 auto;
  padding: 3rem 2rem;
}

h1 {
  margin-bottom: 1rem;
  color: #333;
}

p {
  color: #666;
  line-height: 1.6;
  margin-bottom: 2rem;
}

a {
  color: #667eea;
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}
</style>
`;

const HELLO_API_TEMPLATE = `import { defineHandler } from 'ubean';

export const GET = defineHandler(c => {
  return c.json({
    message: 'Hello from ubean API!',
    timestamp: Date.now()
  });
});
`;

const DEFAULT_LAYOUT_TEMPLATE = `<template>
  <slot />
</template>

<script setup lang="ts">
</script>

<style>
body {
  line-height: 1.5;
}
</style>
`;

const GITIGNORE_TEMPLATE = `node_modules
dist
.ubean
.DS_Store
*.log
.env
.env.local
.env.*.local
`;

const README_TEMPLATE = `# {{name}}

A Vue meta-framework project powered by ubean.

## Getting Started

\`\`\`bash
# Install dependencies
{{pm}} install

# Start dev server
{{pm}} dev

# Build for production
{{pm}} build

# Preview production build
{{pm}} preview
\`\`\`

## Project Structure

\`\`\`
├── src/
│   ├── pages/          # File-based routing
│   ├── layouts/        # Layout components
│   ├── routes/         # API routes
│   ├── components/     # Vue components
│   ├── composables/    # Auto-imported composables
│   ├── plugins/        # App plugins
│   ├── middleware/     # Request middleware
│   ├── crons/          # Scheduled tasks
│   ├── queues/         # Background jobs
│   └── app.vue         # Root app component
├── public/             # Static assets
└── ubean.config.ts     # ubean configuration
\`\`\`
`;

const BLOG_INDEX_TEMPLATE = `<template>
  <div class="blog-page">
    <h1>Blog</h1>
    <div class="posts">
      <article v-for="post in posts" :key="post.slug" class="post-card">
        <h2><RouterLink :to="'/blog/' + post.slug">{{ post.title }}</RouterLink></h2>
        <p class="date">{{ post.date }}</p>
        <p class="excerpt">{{ post.excerpt }}</p>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { useData } from 'ubean';

definePage({
  meta: {
    title: 'Blog'
  }
});

const { data: posts } = await useData('posts', () => {
  return [
    { slug: 'hello-world', title: 'Hello World', date: '2024-01-15', excerpt: 'Welcome to my blog!' }
  ];
});
</script>

<style scoped>
.blog-page {
  max-width: 800px;
  margin: 0 auto;
  padding: 3rem 2rem;
}

h1 {
  margin-bottom: 2rem;
}

.posts {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.post-card {
  padding: 1.5rem;
  border-radius: 8px;
  border: 1px solid #eee;
}

h2 {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
}

h2 a {
  color: #333;
  text-decoration: none;
}

h2 a:hover {
  color: #667eea;
}

.date {
  color: #999;
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
}

.excerpt {
  color: #666;
}
</style>
`;

const BLOG_POST_MD_TEMPLATE = `---
title: Hello World
date: 2024-01-15
description: Welcome to my ubean blog!
---

# Hello World

Welcome to my new blog built with **ubean**!

This is a markdown blog post.

## Features

- File-based routing
- Markdown support
- Auto-imports
- API routes
- And much more!
`;

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

  await fs.ensureDir('src');
  await fs.ensureDir('src/pages');
  await fs.ensureDir('src/layouts');
  await fs.ensureDir('src/routes');
  await fs.ensureDir('src/components');
  await fs.ensureDir('src/composables');
  await fs.ensureDir('src/plugins');
  await fs.ensureDir('public');

  await fs.writeFile('package.json', renderTemplate(PACKAGE_JSON_TEMPLATE, { variables: { name: projectName } }));
  await fs.writeFile('tsconfig.json', TSCONFIG_TEMPLATE);
  await fs.writeFile('ubean.config.ts', renderTemplate(UBEAN_CONFIG_TEMPLATE, { variables: { preset: options.preset || 'standard' } }));
  await fs.writeFile('.gitignore', GITIGNORE_TEMPLATE);
  await fs.writeFile('README.md', renderTemplate(README_TEMPLATE, { variables: { name: projectName, pm } }));
  await fs.writeFile('src/app.vue', APP_VUE_TEMPLATE);
  await fs.writeFile('src/layouts/default.vue', DEFAULT_LAYOUT_TEMPLATE);

  if (options.template === 'minimal') {
    await fs.writeFile('src/pages/index.vue', INDEX_PAGE_TEMPLATE);
  } else if (options.template === 'blog') {
    await fs.writeFile('src/pages/index.vue', INDEX_PAGE_TEMPLATE);
    await fs.writeFile('src/pages/about.vue', ABOUT_PAGE_TEMPLATE);
    await fs.ensureDir('src/pages/blog');
    await fs.writeFile('src/pages/blog/index.vue', BLOG_INDEX_TEMPLATE);
    await fs.writeFile('src/pages/blog/hello-world.md', BLOG_POST_MD_TEMPLATE);
    await fs.writeFile('src/routes/hello.get.ts', HELLO_API_TEMPLATE);
  } else {
    await fs.writeFile('src/pages/index.vue', INDEX_PAGE_TEMPLATE);
    await fs.writeFile('src/pages/about.vue', ABOUT_PAGE_TEMPLATE);
    await fs.writeFile('src/routes/hello.get.ts', HELLO_API_TEMPLATE);
  }

  if (options.git) {
    try {
      const { execSync } = await import('node:child_process');
      execSync('git init', { cwd: targetDir, stdio: 'ignore' });
    } catch {
    }
  }

  console.log('\n✨ ubean project created successfully!\n');
  console.log(`Project: ${projectName}`);
  console.log(`Location: ${targetDir}`);
  console.log(`Preset: ${options.preset || 'standard'}`);
  console.log(`Template: ${options.template || 'starter'}`);
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
      description: 'Project template (minimal/starter/blog)'
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
    const { logger } = await import('../log');

    const cwd = data?.cwd || process.cwd();
    const nonInteractive = isNonInteractive() || args.yes;

    let template = args.template as string | undefined;
    let preset = args.preset as string | undefined;
    let packageManager = args.packageManager as string | undefined;
    let git = args.git as boolean | undefined;
    let name = args.name as string | undefined;

    logger.info('🚀 ubean project initializer');

    if (!nonInteractive) {
      name = name || await prompt('Project name', args.dir === '.' ? basename(cwd) : args.dir);

      template = template || await select('Select a template:', TEMPLATES, 'starter');

      preset = preset || await select('Select a preset:', PRESETS, 'standard');

      packageManager = packageManager || await prompt('Package manager (npm/pnpm/yarn/bun)', 'npm');

      if (git === undefined) {
        git = await confirm('Initialize git repository?', true);
      }
    }

    const options: InitOptions = {
      cwd,
      dir: args.dir as string,
      force: args.force as boolean,
      template: template || 'starter',
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
