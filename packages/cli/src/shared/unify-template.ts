/**
 * Unify 模板 — 基于 soybean-unify-v2 项目结构。
 *
 * 包含: Islands 组件、i18n、多布局、middleware、API 路由(OpenAPI)、
 * 类型化请求客户端、路由守卫、完整工程化配置(eslint/oxc/vscode)。
 */
import type { FsOps } from './fs-ops';
import { renderTemplate } from './templates';

export interface UnifyTemplateOptions {
  name: string;
  preset: string;
  packageManager: string;
}

// ============ 配置文件 ============

const PACKAGE_JSON = `{
  "name": "{{name}}",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "ubean build",
    "commit": "soy git-commit",
    "dev": "ubean dev",
    "fmt": "vp fmt",
    "lint": "vp lint --fix",
    "preview": "ubean preview",
    "typecheck": "vue-tsc --noEmit",
    "upkg": "soy ncu"
  },
  "dependencies": {
    "@soybeanjs/fetch": "^1.0.0",
    "ubean": "latest",
    "valibot": "^1.4.2"
  },
  "devDependencies": {
    "@soybeanjs/cli": "^1.8.1",
    "@soybeanjs/eslint-config-vue": "^0.1.1",
    "@soybeanjs/oxc-config": "^0.2.3",
    "eslint": "^10.8.0",
    "typescript": "^5.6.0",
    "vite-plus": "^0.2.6",
    "vue-tsc": "^2.1.0"
  }
}
`;

const PNPM_WORKSPACE = `shamefullyHoist: true
ignoreWorkspaceRootCheck: true
linkWorkspacePackages: true
allowBuilds:
  esbuild: false
  msw: false
  sharp: false
  unrs-resolver: false
  workerd: false
`;

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ESNext",
    "lib": ["DOM", "ESNext"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "paths": {
      "@/*": ["./src/*"]
    },
    "strict": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true
  },
  "exclude": ["node_modules", "dist"]
}
`;

const VITE_CONFIG = `import { defineConfig } from 'vite-plus';
import { lint, fmt } from '@soybeanjs/oxc-config';
import { ubeanPlugin } from 'ubean/vite';

export default defineConfig({
  staged: {
    '*': 'vp check --fix'
  },
  fmt,
  lint,
  plugins: [ubeanPlugin() as any]
});
`;

const ESLINT_CONFIG = `import { defineConfig } from '@soybeanjs/eslint-config-vue';

export default defineConfig();
`;

const UBEAN_CONFIG = `import { defineConfig } from 'ubean';

export default defineConfig({
  srcDir: 'src',
  preset: '{{preset}}',
  i18n: {
    defaultLocale: 'zh',
    locales: ['en', 'zh'],
    strategy: 'prefix_except_default'
  }
});
`;

const GITIGNORE = `# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

node_modules
.DS_Store
dist
dist-ssr
coverage
*.local
*.local.yaml

# Editor directories and files
.vscode/*
!.vscode/extensions.json
!.vscode/settings.json
!.vscode/launch.json
.idea
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

.VSCodeCounter

.temp
.turbo
.ubean
`;

const EDITORCONFIG = `# Editor configuration, see http://editorconfig.org

root = true

[*]
charset = utf-8
indent_style = space
indent_size = 2
end_of_line = lf
trim_trailing_whitespace = true
insert_final_newline = true
`;

const GITATTRIBUTES = `* text=auto
*.* text eol=lf
`;

const VSCODE_SETTINGS = `{
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit",
    "source.fixAll.oxc": "explicit"
  },
  "editor.defaultFormatter": "oxc.oxc-vscode",
  "editor.formatOnSave": true,
  "editor.formatOnSaveMode": "file",
  "eslint.validate": ["vue"],
  "oxc.fmt.configPath": "./vite.config.ts",
  "i18n-ally.enabledFrameworks": ["vue"],
  "i18n-ally.sourceLanguage": "zh",
  "i18n-ally.keystyle": "nested",
  "i18n-ally.localesPaths": "src/locales",
  "[vue]": {
    "editor.defaultFormatter": "oxc.oxc-vscode"
  }
}
`;

const README = `# {{name}}

A full-stack project powered by ubean.

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

## Features

- Islands Architecture (client:load / idle / visible / media / only)
- i18n (prefix_except_default strategy, zh/en)
- Multiple layouts (default / admin)
- Global & i18n middleware
- Typed HTTP client (@soybeanjs/fetch + OpenAPI)
- API routes with OpenAPI validation (valibot)
- Route guards (beforeEach / afterEach)
- ESLint + OXC formatting

## Project Structure

\`\`\`
├── src/
│   ├── components/     # Vue components (Islands)
│   ├── layouts/        # Layout components (default / admin)
│   ├── locales/        # i18n message files (en / zh)
│   ├── middleware/     # Request middleware (global / i18n)
│   ├── pages/          # File-based routing (with route groups)
│   ├── routes/         # API routes
│   ├── request/        # Typed HTTP client & internal fetch
│   ├── app.ts          # Client app definition (defineApp)
│   └── server.ts       # Server definition (defineServer)
├── public/             # Static assets
├── ubean.config.ts     # ubean configuration
└── vite.config.ts      # Vite + lint/fmt configuration
\`\`\`
`;

// ============ 入口文件 ============

const APP_TS = [
  "import { defineApp, hydrateIslands } from 'ubean/runtime/vue';",
  "import IslandClock from './components/IslandClock.vue';",
  "import IslandCounter from './components/IslandCounter.vue';",
  "import IslandMedia from './components/IslandMedia.vue';",
  "import IslandOnly from './components/IslandOnly.vue';",
  "import IslandVisibility from './components/IslandVisibility.vue';",
  '',
  'export default defineApp({',
  '  head: {',
  "    title: '{{name}}',",
  '    meta: [',
  "      { name: 'description', content: 'A full-stack project powered by ubean' },",
  "      { name: 'viewport', content: 'width=device-width, initial-scale=1' }",
  '    ]',
  '  },',
  "  rootId: 'app',",
  '  // 路由钩子示例 — 在 Client 和 SSR 都会执行。',
  '  // 守卫必须同步注册(函数体本身可以返回 Promise)。',
  '  router: {',
  '    setup(router) {',
  '      // 全局前置守卫:打印每次导航',
  '      router.beforeEach((to, from) => {',
  '        // eslint-disable-next-line no-console',
  '        console.log(`[router] ${from.fullPath} → ${to.fullPath}`);',
  '      });',
  '',
  '      // 全局后置钩子:可在此处做埋点',
  '      router.afterEach(to => {',
  '        // 实际场景:发送到 analytics / 设置页面标题等',
  "        if (typeof document !== 'undefined' && to.meta?.title) {",
  '          document.title = String(to.meta.title);',
  '        }',
  '      });',
  '    }',
  '  },',
  '  onClientReady: app => {',
  '    hydrateIslands({',
  '      components: {',
  '        IslandClock,',
  '        IslandCounter,',
  '        IslandMedia,',
  '        IslandOnly,',
  '        IslandVisibility',
  '      },',
  '      appContext: app',
  '    });',
  '  }',
  '});',
  ''
].join('\n');

const SERVER_TS = [
  "import { defineServer } from 'ubean/runtime/app';",
  '',
  'export default defineServer({',
  '  // 运行时钩子',
  '  hooks: {',
  "    'request:start': c => {",
  '      console.log(`[server] ${c.req.method} ${c.req.path}`);',
  '    }',
  '  },',
  '',
  '  // 在 app.init() 后调用',
  '  onServerReady: async _app => {',
  "    console.log('[server] Server is ready');",
  '  }',
  '});',
  ''
].join('\n');

// ============ 布局 ============

const DEFAULT_LAYOUT = `<script setup lang="ts"></script>

<template>
  <div>
    <div>Default Layout</div>
    <PageView></PageView>
  </div>
</template>
`;

const ADMIN_LAYOUT = `<script setup lang="ts"></script>

<template>
  <div>
    <div>Admin Layout</div>
    <PageView></PageView>
  </div>
</template>
`;

// ============ 页面 ============

const INDEX_PAGE = `<script setup lang="ts"></script>

<template>
  <div>Index Page</div>
</template>
`;

const ABOUT_PAGE = `<script setup lang="ts"></script>

<template>
  <div>About Page</div>
</template>
`;

const ABOUT_REUSE = `import { definePage } from 'ubean';

definePage({
  reuse: 'About'
});
`;

const DASHBOARD_PAGE = `<script setup lang="ts">
definePage({
  layout: 'admin'
});
</script>

<template>
  <div>Dashboard</div>
</template>
`;

// ============ 中间件 ============

const GLOBAL_MIDDLEWARE = [
  "import { defineMiddleware } from 'ubean';",
  '',
  'export default defineMiddleware(async (c, next) => {',
  '  const start = Date.now();',
  '  await next();',
  '  const duration = Date.now() - start;',
  "  c.header('X-Test-Middleware', 'ubean-test-global');",
  "  c.header('X-Response-Time', `${duration}ms`);",
  '});',
  ''
].join('\n');

const I18N_MIDDLEWARE = [
  "import { defineMiddleware, createI18nMiddleware, setI18nConfig } from 'ubean';",
  '',
  '// Set global i18n config (used by localizePath, switchLocalePath, etc.)',
  '// Locale messages are auto-loaded by ubean:locales virtual module.',
  'setI18nConfig({',
  "  defaultLocale: 'en',",
  "  strategy: 'prefix_except_default',",
  "  locales: ['en', 'zh']",
  '});',
  '',
  '// Create i18n middleware instance once.',
  'const i18nHandler = createI18nMiddleware({',
  "  strategy: 'prefix_except_default',",
  "  defaultLocale: 'en',",
  "  locales: ['en', 'zh'],",
  '  detectFromHeader: true,',
  '  detectFromCookie: true,',
  '  redirectOnLocaleMismatch: false',
  '});',
  '',
  'export default defineMiddleware(async (c, next) => {',
  '  return i18nHandler(c, next);',
  '});',
  ''
].join('\n');

// ============ API 路由 ============

const HELLO_API = `import { pipe, description, object, string, number } from 'valibot';
import { defineHandler, describeRoute, resolver } from 'ubean';

const helloWorldSchema = object({
  message: pipe(string(), description('The greeting message')),
  status: pipe(number(), description('The status'))
});

export const GET = defineHandler(
  describeRoute({
    summary: 'Hello World',
    description: 'Returns a greeting message.',
    responses: {
      200: {
        description: 'Successful response',
        content: {
          'application/json': {
            schema: resolver(helloWorldSchema)
          }
        }
      }
    }
  }),
  c =>
    c.json({
      message: 'Hello, World!',
      status: 200
    })
);
`;

// ============ 请求客户端 ============

const REQUEST_CLIENT = `import { createRequest } from '@soybeanjs/fetch';
import { createTypedClient, toFlatTypedClient } from '@soybeanjs/fetch/openapi';
import type { paths } from '../../.ubean/openapi';

const request = createRequest({});

export const api = createTypedClient<paths, '/api'>(request, '/api');

export const flatApi = toFlatTypedClient<paths, '/api'>(request, '/api');
`;

const REQUEST_INTERNAL = `import { createRequest } from '@soybeanjs/fetch';
import { createTypedClient } from '@soybeanjs/fetch/openapi';
import { createInternalAdapter } from 'ubean';
import type { paths } from '../../.ubean/openapi';

export function createServerApi(context: Parameters<typeof createInternalAdapter>[0]) {
  const adapter = createInternalAdapter(context);

  const request = createRequest({
    adapter
  });

  return createTypedClient<paths, '/api'>(request, '/api');
}
`;

// ============ Islands 组件 ============

const ISLAND_COUNTER = `<script setup lang="ts">
import { ref, onMounted } from 'vue';

const count = ref(0);
const mountedAt = ref<string>('');

function increment() {
  count.value++;
}

onMounted(() => {
  mountedAt.value = new Date().toISOString();
});
</script>

<template>
  <div class="island-counter">
    <p class="island-label">client:load Island</p>
    <p class="counter-value">{{ count }}</p>
    <button @click="increment">+1</button>
    <p v-if="mountedAt" class="mounted-info">Mounted at: {{ mountedAt }}</p>
  </div>
</template>

<style scoped>
.island-counter {
  padding: 1rem;
  border: 2px solid #42b883;
  border-radius: 8px;
  background: #f0fdf4;
}

.island-label {
  font-size: 0.8rem;
  color: #15803d;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.counter-value {
  font-size: 2rem;
  font-weight: 700;
  color: #166534;
}

button {
  padding: 0.4rem 1rem;
  background: #42b883;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
}

button:hover {
  background: #35495e;
}

.mounted-info {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: #6b7280;
  font-family: monospace;
}
</style>
`;

const ISLAND_CLOCK = `<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

const now = ref<string>('--:--:--');
let timer: ReturnType<typeof setInterval> | null = null;

function update() {
  now.value = new Date().toLocaleTimeString('zh-CN', { hour12: false });
}

onMounted(() => {
  update();
  timer = setInterval(update, 1000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div class="island-clock">
    <p class="island-label">client:idle Island</p>
    <p class="clock-time">{{ now }}</p>
    <p class="clock-hint">Hydrated when browser is idle</p>
  </div>
</template>

<style scoped>
.island-clock {
  padding: 1rem;
  border: 2px solid #3b82f6;
  border-radius: 8px;
  background: #eff6ff;
}

.island-label {
  font-size: 0.8rem;
  color: #1d4ed8;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.clock-time {
  font-size: 1.8rem;
  font-weight: 700;
  color: #1e3a8a;
  font-family: 'SF Mono', 'Fira Code', monospace;
  letter-spacing: 2px;
}

.clock-hint {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: #6b7280;
}
</style>
`;

const ISLAND_MEDIA = `<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

const isWide = ref(false);
const checks = ref(0);
let mql: MediaQueryList | null = null;

function onChange(e: MediaQueryListEvent) {
  isWide.value = e.matches;
  checks.value++;
}

onMounted(() => {
  mql = window.matchMedia('(min-width: 768px)');
  isWide.value = mql.matches;
  mql.addEventListener('change', onChange);
});

onUnmounted(() => {
  if (mql) mql.removeEventListener('change', onChange);
});
</script>

<template>
  <div class="island-media">
    <p class="island-label">client:media Island</p>
    <p class="media-status" :class="{ wide: isWide, narrow: !isWide }">
      {{ isWide ? '🖥 Wide screen (≥768px)' : '📱 Narrow screen (<768px)' }}
    </p>
    <p class="media-info">Media query changes: {{ checks }}</p>
    <p class="media-hint">Resize browser to trigger media query changes</p>
  </div>
</template>

<style scoped>
.island-media {
  padding: 1rem;
  border: 2px solid #8b5cf6;
  border-radius: 8px;
  background: #f5f3ff;
}

.island-label {
  font-size: 0.8rem;
  color: #6d28d9;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.media-status {
  font-size: 1.1rem;
  font-weight: 600;
}

.media-status.wide {
  color: #166534;
}

.media-status.narrow {
  color: #92400e;
}

.media-info,
.media-hint {
  margin-top: 0.3rem;
  font-size: 0.75rem;
  color: #6b7280;
}
</style>
`;

const ISLAND_ONLY = `<script setup lang="ts">
import { ref, onMounted } from 'vue';

const clientTime = ref<string>('');

onMounted(() => {
  clientTime.value = new Date().toISOString();
});
</script>

<template>
  <div class="island-only">
    <p class="island-label">client:only Island</p>
    <p class="only-status">✓ Rendered on client only</p>
    <p v-if="clientTime" class="only-time">Client time: {{ clientTime }}</p>
    <p class="only-hint">This component was NOT server-side rendered</p>
  </div>
</template>

<style scoped>
.island-only {
  padding: 1rem;
  border: 2px dashed #ec4899;
  border-radius: 8px;
  background: #fdf2f8;
}

.island-label {
  font-size: 0.8rem;
  color: #be185d;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.only-status {
  font-size: 1.1rem;
  font-weight: 600;
  color: #166534;
}

.only-time {
  margin-top: 0.3rem;
  font-size: 0.75rem;
  color: #6b7280;
  font-family: monospace;
}

.only-hint {
  margin-top: 0.3rem;
  font-size: 0.75rem;
  color: #9ca3af;
  font-style: italic;
}
</style>
`;

const ISLAND_VISIBILITY = `<script setup lang="ts">
import { ref, onMounted } from 'vue';

const visible = ref(false);
const visibleCount = ref(0);
const firstVisibleAt = ref<string>('');

onMounted(() => {
  // The IntersectionObserver is set up by the bootstrap script;
  // once the island is hydrated, we mark it as visible.
  visible.value = true;
  visibleCount.value = 1;
  firstVisibleAt.value = new Date().toISOString();
});
</script>

<template>
  <div class="island-visibility">
    <p class="island-label">client:visible Island</p>
    <p class="vis-status" :class="{ active: visible }">
      {{ visible ? '✓ Visible & Hydrated' : '○ Waiting for visibility...' }}
    </p>
    <p v-if="firstVisibleAt" class="vis-time">First visible: {{ firstVisibleAt }}</p>
    <p class="vis-count">Visibility events: {{ visibleCount }}</p>
  </div>
</template>

<style scoped>
.island-visibility {
  padding: 1rem;
  border: 2px solid #f59e0b;
  border-radius: 8px;
  background: #fffbeb;
}

.island-label {
  font-size: 0.8rem;
  color: #b45309;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.vis-status {
  font-size: 1.1rem;
  font-weight: 600;
  color: #92400e;
}

.vis-status.active {
  color: #166534;
}

.vis-time,
.vis-count {
  margin-top: 0.3rem;
  font-size: 0.75rem;
  color: #6b7280;
  font-family: monospace;
}
</style>
`;

// ============ i18n 语言文件 ============

const EN_LOCALE = `{
  "app": {
    "title": "{{name}}",
    "description": "A full-stack project powered by ubean"
  }
}
`;

const ZH_LOCALE = `{
  "app": {
    "title": "{{name}}",
    "description": "基于 ubean 框架的全栈项目"
  }
}
`;

// ============ 共享基础模板(minimal/starter/blog 使用) ============

/** ubean logo SVG — 所有模板共用 */
const FAVICON_SVG = `<svg width="100%" height="100%" version="1.1" viewBox="0 0 1000 1000" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <g>
    <path d="M 200,866 C 100,866 50,779.4 100,692.8 L 200,519.6 C 220,485 240,490 265,499.6 S 360,542.68 360,542.68 C 480.5,601 498,642.5 500,720 C 498,811 462,856 420,866" fill="url(#LinearGradient)" fill-rule="nonzero" opacity="1" stroke="none"/>
    <path d="M 420,866 C 455,861 478,846 500,827 C 614,696 615,597 500,517 C 394,444 333,374 380,207.82 L 260,415.67 C 240.22,450 254.37,465.1 275.28,481.79 S 360,542.68 360,542.68 C 480.5,601 498,642.5 500,720 C 498,811 462,856 420,866" fill="url(#LinearGradient_2)" fill-rule="nonzero" opacity="1" stroke="none"/>
    <path d="M 500,517 C 394,444 333,374 380,207.82 L 400,173.2 C 367,295 421,350 603,428 C 572,440 524,474 500,517" fill="url(#LinearGradient_3)" fill-rule="nonzero" opacity="1" stroke="none"/>
    <path d="M 500,827 L 660,660 C 738,589 710,482 603,428 C 572,440 524,474 500,517 C 615,597 614,696 500,827" fill="url(#LinearGradient_4)" fill-rule="nonzero" opacity="1" stroke="none"/>
    <path d="M 400,173.2 C 367,295 421,350 603,428 C 690,389, 750,445 788,500 L 600,173.2 C 550,86.6 450,86.6 400,173.2" fill="url(#LinearGradient_5)" fill-rule="nonzero" opacity="1" stroke="none"/>
    <path d="M 500,827 L 660,660 C 738,589 710,482 603,428 C 690,389, 750,445 788,500 C 816,554 797,606 750,640 L 500,827" fill="url(#LinearGradient_6)" fill-rule="nonzero" opacity="1" stroke="none"/>
    <path d="M 788,500 C 816,554 797,606 750,640 L 500,827 C 497,851 513,862 540,866 L 800,866 C 900,866 950,779.4 900,692.8 L 788,500" fill="url(#LinearGradient_7)" fill-rule="nonzero" opacity="1" stroke="none"/>
  </g>
<!--左下角图案-->
  <g transform="translate(130, 675) scale(7)">
    <g viewBox="0 0 24 24">
      <path fill="#ffffff" d="M4.528 5.118a1 1 0 0 1 1.027.05l5.554 3.703A2 2 0 0 1 12 10.535V21a1 1 0 0 1-1.555.832l-5.554-3.703A2 2 0 0 1 4 16.465V6a1 1 0 0 1 .528-.882m4-2a1 1 0 0 1 1.027.05l5.554 3.703A2 2 0 0 1 16 8.535V19a1 1 0 0 1-1.555.832l-.945-.63v-8.667a3.5 3.5 0 0 0-1.559-2.912L8 4.995V4a1 1 0 0 1 .528-.882m4-2a1 1 0 0 1 1.027.05l5.554 3.703A2 2 0 0 1 20 6.535V17a1 1 0 0 1-1.555.832l-.945-.63V8.534a3.5 3.5 0 0 0-1.559-2.912L12 2.995V2a1 1 0 0 1 .528-.882"/>
    </g>
  </g>
  <defs>
    <linearGradient gradientTransform="matrix(104.391 -73.3432 73.3432 104.391 277.441 710.122)" gradientUnits="userSpaceOnUse" id="LinearGradient" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#373ebf"/>
      <stop offset="1" stop-color="#5058e6"/>
    </linearGradient>
    <linearGradient gradientTransform="matrix(-173.747 557.324 -557.324 -173.747 508.829 258.172)" gradientUnits="userSpaceOnUse" id="LinearGradient_2" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#c2d6ff"/>
      <stop offset="1" stop-color="#646cff"/>
    </linearGradient>
    <linearGradient gradientTransform="matrix(157.951 295.666 -295.666 157.951 382.944 193.642)" gradientUnits="userSpaceOnUse" id="LinearGradient_3" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#5058e6"/>
      <stop offset="1" stop-color="#373ebf"/>
    </linearGradient>
    <linearGradient gradientTransform="matrix(-44.3023 219.578 -219.578 -44.3023 619.69 469.652)" gradientUnits="userSpaceOnUse" id="LinearGradient_4" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#91a7ff"/>
      <stop offset="1" stop-color="#5058e6"/>
    </linearGradient>
    <linearGradient gradientTransform="matrix(125.52 334.256 -334.256 125.52 539.723 235.139)" gradientUnits="userSpaceOnUse" id="LinearGradient_5" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#646cff"/>
      <stop offset="1" stop-color="#c2d6ff"/>
    </linearGradient>
    <linearGradient gradientTransform="matrix(-241.23 357.206 -357.206 -241.23 754.054 449.312)" gradientUnits="userSpaceOnUse" id="LinearGradient_6" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#c2d6ff"/>
      <stop offset="1" stop-color="#646cff"/>
    </linearGradient>
    <linearGradient gradientTransform="matrix(125.978 210.065 -210.065 125.978 596.433 613.665)" gradientUnits="userSpaceOnUse" id="LinearGradient_7" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#373ebf"/>
      <stop offset="1" stop-color="#5058e6"/>
    </linearGradient>
  </defs>
</svg>
`;

/** 简化版 app.ts — 无 Islands / 无路由守卫 */
const APP_TS_BASE = `import { defineApp } from 'ubean/runtime/vue';

export default defineApp({
  head: {
    title: '{{name}}',
    meta: [
      { name: 'description', content: 'A project powered by ubean' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' }
    ]
  },
  rootId: 'app'
});
`;

/** 简化版 ubean.config.ts — 无 i18n */
const UBEAN_CONFIG_BASE = `import { defineConfig } from 'ubean';

export default defineConfig({
  srcDir: 'src',
  preset: '{{preset}}'
});
`;

/** 基础 README — minimal/starter/blog 共用 */
const README_BASE = `# {{name}}

A project powered by ubean.

## Getting Started

\`\`\`bash
{{pm}} install
{{pm}} dev
{{pm}} build
{{pm}} preview
\`\`\`

## Project Structure

\`\`\`
├── src/
│   ├── pages/          # File-based routing
│   ├── layouts/        # Layout components
│   ├── routes/         # API routes
│   ├── components/     # Vue components
│   ├── request/        # Typed HTTP client & internal fetch
│   ├── app.ts          # Client app definition (defineApp)
│   └── server.ts       # Server definition (defineServer)
├── public/             # Static assets
└── ubean.config.ts     # ubean configuration
\`\`\`
`;

// ============ 页面模板(minimal/starter/blog) ============

const MINIMAL_INDEX_PAGE = `<script setup lang="ts"></script>

<template>
  <div>
    <h1>Welcome to ubean</h1>
    <p>Your Vue meta framework is ready!</p>
  </div>
</template>
`;

const STARTER_INDEX_PAGE = `<script setup lang="ts"></script>

<template>
  <div>
    <h1>Welcome to ubean</h1>
    <p>Your Vue meta framework is ready!</p>
    <Link to="/about">About</Link>
  </div>
</template>
`;

const STARTER_ABOUT_PAGE = `<script setup lang="ts"></script>

<template>
  <div>
    <h1>About</h1>
    <p>This page is built with ubean.</p>
    <Link to="/">Back to Home</Link>
  </div>
</template>
`;

const BLOG_INDEX_PAGE = `<script setup lang="ts">
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

<template>
  <div>
    <h1>Blog</h1>
    <div>
      <article v-for="post in posts" :key="post.slug">
        <h2><Link :to="'/blog/' + post.slug">{{ post.title }}</Link></h2>
        <p class="date">{{ post.date }}</p>
        <p class="excerpt">{{ post.excerpt }}</p>
      </article>
    </div>
  </div>
</template>
`;

const BLOG_POST_MD = `---
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

// ============ 共享 scaffold 函数 ============

/**
 * 写入所有模板共用的基础文件(配置 + 入口 + 布局 + 请求客户端)。
 * 不写入 ubean.config.ts / app.ts / README.md / pages — 由各模板自行补充。
 */
async function scaffoldBase(fs: FsOps, options: UnifyTemplateOptions): Promise<void> {
  const { name } = options;

  await fs.ensureDir('src');
  await fs.ensureDir('src/pages');
  await fs.ensureDir('src/layouts');
  await fs.ensureDir('src/routes');
  await fs.ensureDir('src/components');
  await fs.ensureDir('src/request');
  await fs.ensureDir('public');
  await fs.ensureDir('.vscode');

  await fs.writeFile('package.json', renderTemplate(PACKAGE_JSON, { variables: { name } }));
  await fs.writeFile('pnpm-workspace.yaml', PNPM_WORKSPACE);
  await fs.writeFile('tsconfig.json', TSCONFIG);
  await fs.writeFile('vite.config.ts', VITE_CONFIG);
  await fs.writeFile('eslint.config.mjs', ESLINT_CONFIG);
  await fs.writeFile('.gitignore', GITIGNORE);
  await fs.writeFile('.editorconfig', EDITORCONFIG);
  await fs.writeFile('.gitattributes', GITATTRIBUTES);
  await fs.writeFile('.vscode/settings.json', VSCODE_SETTINGS);
  await fs.writeFile('public/favicon.svg', FAVICON_SVG);
  await fs.writeFile('src/server.ts', SERVER_TS);
  await fs.writeFile('src/layouts/default.vue', DEFAULT_LAYOUT);
  await fs.writeFile('src/request/client.ts', REQUEST_CLIENT);
  await fs.writeFile('src/request/internal.ts', REQUEST_INTERNAL);
}

/**
 * 生成完整的 unify 模板项目。
 *
 * @param fs 文件系统操作实例(已绑定到目标目录)
 * @param options 模板变量(name / preset / packageManager)
 */
export async function scaffoldUnifyTemplate(fs: FsOps, options: UnifyTemplateOptions): Promise<void> {
  const { name, preset, packageManager: pm } = options;

  // 公共基础(配置 + 入口 + 布局 + 请求客户端)
  await scaffoldBase(fs, options);

  // Unify 专有目录
  await fs.ensureDir('src/locales');
  await fs.ensureDir('src/middleware');
  await fs.ensureDir('src/pages/(admin)');
  await fs.ensureDir('src/routes/api');

  // Unify 专有配置(覆盖基础)
  await fs.writeFile('ubean.config.ts', renderTemplate(UBEAN_CONFIG, { variables: { preset } }));
  await fs.writeFile('README.md', renderTemplate(README, { variables: { name, pm } }));
  await fs.writeFile('src/app.ts', renderTemplate(APP_TS, { variables: { name } }));

  // Unify 专有布局
  await fs.writeFile('src/layouts/admin.vue', ADMIN_LAYOUT);

  // Unify 专有页面
  await fs.writeFile('src/pages/index.vue', INDEX_PAGE);
  await fs.writeFile('src/pages/about.vue', ABOUT_PAGE);
  await fs.writeFile('src/pages/about2.reuse.ts', ABOUT_REUSE);
  await fs.writeFile('src/pages/(admin)/dashboard.vue', DASHBOARD_PAGE);

  // 中间件
  await fs.writeFile('src/middleware/01.global.ts', GLOBAL_MIDDLEWARE);
  await fs.writeFile('src/middleware/02.i18n.ts', I18N_MIDDLEWARE);

  // API 路由
  await fs.writeFile('src/routes/api/hello-world.ts', HELLO_API);

  // Islands 组件
  await fs.writeFile('src/components/IslandCounter.vue', ISLAND_COUNTER);
  await fs.writeFile('src/components/IslandClock.vue', ISLAND_CLOCK);
  await fs.writeFile('src/components/IslandMedia.vue', ISLAND_MEDIA);
  await fs.writeFile('src/components/IslandOnly.vue', ISLAND_ONLY);
  await fs.writeFile('src/components/IslandVisibility.vue', ISLAND_VISIBILITY);

  // i18n 语言文件
  await fs.writeFile('src/locales/en.json', renderTemplate(EN_LOCALE, { variables: { name } }));
  await fs.writeFile('src/locales/zh.json', renderTemplate(ZH_LOCALE, { variables: { name } }));
}

// ============ minimal / starter / blog 模板 ============

/** Minimal 模板 — 仅首页,无 API/i18n/Islands */
export async function scaffoldMinimalTemplate(fs: FsOps, options: UnifyTemplateOptions): Promise<void> {
  const { name, preset, packageManager: pm } = options;

  await scaffoldBase(fs, options);
  await fs.writeFile('ubean.config.ts', renderTemplate(UBEAN_CONFIG_BASE, { variables: { preset } }));
  await fs.writeFile('README.md', renderTemplate(README_BASE, { variables: { name, pm } }));
  await fs.writeFile('src/app.ts', renderTemplate(APP_TS_BASE, { variables: { name } }));
  await fs.writeFile('src/pages/index.vue', MINIMAL_INDEX_PAGE);
}

/** Starter 模板 — 首页 + About + API 路由 */
export async function scaffoldStarterTemplate(fs: FsOps, options: UnifyTemplateOptions): Promise<void> {
  const { name, preset, packageManager: pm } = options;

  await scaffoldBase(fs, options);
  await fs.ensureDir('src/routes/api');
  await fs.writeFile('ubean.config.ts', renderTemplate(UBEAN_CONFIG_BASE, { variables: { preset } }));
  await fs.writeFile('README.md', renderTemplate(README_BASE, { variables: { name, pm } }));
  await fs.writeFile('src/app.ts', renderTemplate(APP_TS_BASE, { variables: { name } }));
  await fs.writeFile('src/pages/index.vue', STARTER_INDEX_PAGE);
  await fs.writeFile('src/pages/about.vue', STARTER_ABOUT_PAGE);
  await fs.writeFile('src/routes/api/hello-world.ts', HELLO_API);
}

/** Blog 模板 — 首页 + About + Markdown 博客 + API 路由 */
export async function scaffoldBlogTemplate(fs: FsOps, options: UnifyTemplateOptions): Promise<void> {
  const { name, preset, packageManager: pm } = options;

  await scaffoldBase(fs, options);
  await fs.ensureDir('src/routes/api');
  await fs.ensureDir('src/pages/blog');
  await fs.writeFile('ubean.config.ts', renderTemplate(UBEAN_CONFIG_BASE, { variables: { preset } }));
  await fs.writeFile('README.md', renderTemplate(README_BASE, { variables: { name, pm } }));
  await fs.writeFile('src/app.ts', renderTemplate(APP_TS_BASE, { variables: { name } }));
  await fs.writeFile('src/pages/index.vue', STARTER_INDEX_PAGE);
  await fs.writeFile('src/pages/about.vue', STARTER_ABOUT_PAGE);
  await fs.writeFile('src/pages/blog/index.vue', BLOG_INDEX_PAGE);
  await fs.writeFile('src/pages/blog/hello-world.md', BLOG_POST_MD);
  await fs.writeFile('src/routes/api/hello-world.ts', HELLO_API);
}
