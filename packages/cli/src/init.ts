import type { CommandDef } from 'citty';
import { consola } from 'consola';
import { resolve, basename } from 'pathe';
import { createFsOps } from './shared/fs-ops';
import { renderTemplate } from './shared/templates';

const logger = consola.withTag('ubean-cli');

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

/**
 * 类型化请求客户端模板 - 浏览器端
 *
 * 启动 dev server 后,ubean 会自动生成 .ubean/openapi.d.ts(包含项目所有 API 的 paths 类型)。
 * 本文件将 paths 类型绑定到 createTypedClient,使浏览器端请求的路径、参数、请求体和返回值都获得类型安全。
 *
 * 使用方式:
 *   import { api } from '../request/client';
 *   const user = await api.get('/api/users/{id}', { params: { path: { id: 1 } } });
 */
const REQUEST_CLIENT_TEMPLATE = `import { createClient } from 'ubean';
import { createTypedClient, createFlatTypedClient } from '@soybeanjs/fetch/openapi';
import type { paths } from '../../.ubean/openapi';

/**
 * 底层 HTTP 客户端实例(ofetch 封装)。
 *
 * api 和 flatApi 共用同一个 client 实例,共享 baseURL/timeout/headers 等配置。
 * 调整配置时只需修改此处一处。
 */
const client = createClient({
  // baseURL: '/api',  // 按需设置 API 基础路径
  // timeout: 10000,
});

/**
 * 浏览器端类型化 HTTP 客户端(抛异常模式)
 *
 * 路径、参数、请求体和返回值类型均从 OpenAPI schema 自动推断。
 * 启动 dev server 后类型会自动更新(.ubean/openapi.d.ts)。
 *
 * 支持通过 responseType 配置不同的返回类型:
 * - 'json' (默认): 返回解析后的 JSON 数据
 * - 'blob': 返回 { file: Blob; filename: string; contentType: string }
 * - 'text': 返回 string
 * - 'arraybuffer': 返回 { file: ArrayBuffer; filename: string; contentType: string }
 *
 * @example
 * import { api } from '../request/client';
 *
 * // JSON 请求(默认)
 * const user = await api.get('/api/users/{id}', { pathParams: { id: 1 } });
 *
 * // 文件下载
 * const file = await api.get('/api/export', { responseType: 'blob' });
 * // file: { file: Blob; filename: string; contentType: string }
 *
 * // 文本
 * const text = await api.get('/api/readme', { responseType: 'text' });
 * // text: string
 */
export const api = createTypedClient<paths>(client);

/**
 * 扁平模式类型化 HTTP 客户端(不抛异常,通过返回值判断)
 *
 * 返回 { data, error, response } — 成功时 error 为 null,失败时 data 为 null。
 * 接口与 api 一致,同样支持 responseType。
 *
 * @example
 * import { flatApi } from '../request/client';
 *
 * const { data, error } = await flatApi.get('/api/users/{id}', {
 *   pathParams: { id: 1 }
 * });
 * if (error) {
 *   console.error('Failed:', error.message);
 * } else {
 *   console.log('User:', data);
 * }
 */
export const flatApi = createFlatTypedClient<paths>(client);
`;

/**
 * 类型化请求客户端模板 - server 端内部调度
 *
 * 在 API 路由或 useData 的 fetcher 中使用,自动转发 cookie/authorization 等请求头。
 * 与 client.ts 接口一致,但内部通过 createInternalAdapter + @soybeanjs/fetch 发起请求(进程内调度)。
 *
 * 使用方式:
 *   import { createServerApi } from '../request/internal';
 *   export const GET = defineHandler(async (c) => {
 *     const api = createServerApi(c);
 *     const user = await api.get('/api/users/{id}', { pathParams: { id: 1 } });
 *     return c.json(user);
 *   });
 */
const REQUEST_INTERNAL_TEMPLATE = `import { createInternalAdapter } from 'ubean';
import { createRequest } from '@soybeanjs/fetch';
import { createTypedClient } from '@soybeanjs/fetch/openapi';
import type { paths } from '../../.ubean/openapi';

/**
 * server 端类型化内部 fetch
 *
 * 在 API 路由或 useData 的 fetcher 中使用,自动转发 cookie/authorization 等请求头。
 * 与 client.ts 的 api 接口一致,但通过进程内调度发起请求(不发起新的网络请求)。
 *
 * @example
 * // src/routes/api/posts.ts
 * import { defineHandler } from 'ubean';
 * import { createServerApi } from '../request/internal';
 *
 * export const GET = defineHandler(async (c) => {
 *   const api = createServerApi(c);
 *   const user = await api.get('/api/users/{id}', { pathParams: { id: 1 } });
 *   return c.json(user);
 * });
 *
 * @example
 * // 在 useData 中使用
 * import { useData, defineHandler } from 'ubean';
 * import { createServerApi } from '../request/internal';
 *
 * export const GET = defineHandler(async (c) => {
 *   const api = createServerApi(c);
 *   const result = await useData({
 *     fetcher: async () => api.get('/api/users/{id}', { pathParams: { id: 1 } })
 *   });
 *   return c.json(result.data);
 * });
 */
export function createServerApi(context: Parameters<typeof createInternalAdapter>[0]) {
  const adapter = createInternalAdapter(context);
  const request = createRequest(
    { retry: { retries: 0 }, adapter },
    { isBackendSuccess: () => true, transform: response => response.data }
  );
  return createTypedClient<paths>(request);
}
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

// ubean logo SVG — written to public/favicon.svg so freshly scaffolded
// projects have a working favicon out of the box. Replaces the Vue.js
// placeholder logo used previously. Sourced from
// https://r2.soybeanjs.tech/soybeanjs/logo-ubean.svg
const FAVICON_SVG_TEMPLATE = `<svg width="100%" height="100%" version="1.1" viewBox="0 0 1000 1000" xmlns="http://www.w3.org/2000/svg"
  xmlns:xlink="http://www.w3.org/1999/xlink">
  <g>
    <path
      d="M 200,866 C 100,866 50,779.4 100,692.8 L 200,519.6 C 220,485 240,490 265,499.6 S 360,542.68 360,542.68 C 480.5,601 498,642.5 500,720 C 498,811 462,856 420,866"
      fill="url(#LinearGradient)" fill-rule="nonzero" opacity="1" stroke="none" />
    <path
      d="M 420,866 C 455,861 478,846 500,827 C 614,696 615,597 500,517 C 394,444 333,374 380,207.82 L 260,415.67 C 240.22,450 254.37,465.1 275.28,481.79 S 360,542.68 360,542.68 C 480.5,601 498,642.5 500,720 C 498,811 462,856 420,866"
      fill="url(#LinearGradient_2)" fill-rule="nonzero" opacity="1" stroke="none" />
    <path d="M 500,517 C 394,444 333,374 380,207.82 L 400,173.2 C 367,295 421,350 603,428 C 572,440 524,474 500,517"
      fill="url(#LinearGradient_3)" fill-rule="nonzero" opacity="1" stroke="none" />
    <path d="M 500,827 L 660,660 C 738,589 710,482 603,428 C 572,440 524,474 500,517 C 615,597 614,696 500,827"
      fill="url(#LinearGradient_4)" fill-rule="nonzero" opacity="1" stroke="none" />
    <path d="M 400,173.2 C 367,295 421,350 603,428 C 690,389, 750,445 788,500 L 600,173.2 C 550,86.6 450,86.6 400,173.2"
      fill="url(#LinearGradient_5)" fill-rule="nonzero" opacity="1" stroke="none" />
    <path
      d="M 500,827 L 660,660 C 738,589 710,482 603,428 C 690,389, 750,445 788,500 C 816,554 797,606 750,640 L 500,827"
      fill="url(#LinearGradient_6)" fill-rule="nonzero" opacity="1" stroke="none" />
    <path
      d="M 788,500 C 816,554 797,606 750,640 L 500,827 C 497,851 513,862 540,866 L 800,866 C 900,866 950,779.4 900,692.8 L 788,500"
      fill="url(#LinearGradient_7)" fill-rule="nonzero" opacity="1" stroke="none" />
    <g transform="translate(140, 650) scale(0.18)">
  <path d="M539.04,146.5c-77.37,32.74-126.47,114.53-123.22,198,.61,150.92,169.47,210.6,214.99,341.13,39.71,96.62-16.62,230.68-122.31,253.16-374.89-83.15-390.44-785.49,30.54-792.29ZM564.61,948.5c68.1-32.18,118.51-95.45,132.49-169.97,41.81-214.6-158.22-254.7-215.15-413.02-31.14-86.21,21.33-198.66,114.56-214.57,129.21,21.58,214.93,148.7,230.96,272.19,7.94,38.53,21.57,75.37,34.41,112.43,75.75,198.26-76.06,438.99-297.26,412.94Z" fill="#ffffff" fill-rule="evenodd"/>
</g>
  </g>
  <defs>
    <linearGradient gradientTransform="matrix(104.391 -73.3432 73.3432 104.391 277.441 710.122)"
      gradientUnits="userSpaceOnUse" id="LinearGradient" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#373ebf" />
      <stop offset="1" stop-color="#5058e6" />
    </linearGradient>
    <linearGradient gradientTransform="matrix(-173.747 557.324 -557.324 -173.747 508.829 258.172)"
      gradientUnits="userSpaceOnUse" id="LinearGradient_2" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#c2d6ff" />
      <stop offset="1" stop-color="#646cff" />
    </linearGradient>
    <linearGradient gradientTransform="matrix(157.951 295.666 -295.666 157.951 382.944 193.642)"
      gradientUnits="userSpaceOnUse" id="LinearGradient_3" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#5058e6" />
      <stop offset="1" stop-color="#373ebf" />
    </linearGradient>
    <linearGradient gradientTransform="matrix(-44.3023 219.578 -219.578 -44.3023 619.69 469.652)"
      gradientUnits="userSpaceOnUse" id="LinearGradient_4" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#91a7ff" />
      <stop offset="1" stop-color="#5058e6" />
    </linearGradient>
    <linearGradient gradientTransform="matrix(125.52 334.256 -334.256 125.52 539.723 235.139)"
      gradientUnits="userSpaceOnUse" id="LinearGradient_5" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#646cff" />
      <stop offset="1" stop-color="#c2d6ff" />
    </linearGradient>
    <linearGradient gradientTransform="matrix(-241.23 357.206 -357.206 -241.23 754.054 449.312)"
      gradientUnits="userSpaceOnUse" id="LinearGradient_6" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#c2d6ff" />
      <stop offset="1" stop-color="#646cff" />
    </linearGradient>
    <linearGradient gradientTransform="matrix(125.978 210.065 -210.065 125.978 596.433 613.665)"
      gradientUnits="userSpaceOnUse" id="LinearGradient_7" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#373ebf" />
      <stop offset="1" stop-color="#5058e6" />
    </linearGradient>
  </defs>
</svg>
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
│   ├── request/        # Typed HTTP client & internal fetch
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
  await fs.ensureDir('src/request');
  await fs.ensureDir('public');

  await fs.writeFile('package.json', renderTemplate(PACKAGE_JSON_TEMPLATE, { variables: { name: projectName } }));
  await fs.writeFile('public/favicon.svg', FAVICON_SVG_TEMPLATE);
  await fs.writeFile('tsconfig.json', TSCONFIG_TEMPLATE);
  await fs.writeFile(
    'ubean.config.ts',
    renderTemplate(UBEAN_CONFIG_TEMPLATE, { variables: { preset: options.preset || 'standard' } })
  );
  await fs.writeFile('.gitignore', GITIGNORE_TEMPLATE);
  await fs.writeFile('README.md', renderTemplate(README_TEMPLATE, { variables: { name: projectName, pm } }));
  await fs.writeFile('src/app.vue', APP_VUE_TEMPLATE);
  await fs.writeFile('src/layouts/default.vue', DEFAULT_LAYOUT_TEMPLATE);
  await fs.writeFile('src/request/client.ts', REQUEST_CLIENT_TEMPLATE);
  await fs.writeFile('src/request/internal.ts', REQUEST_INTERNAL_TEMPLATE);

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
    } catch {}
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

      template = template || (await select('Select a template:', TEMPLATES, 'starter'));

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
