<script setup lang="ts">
// Home page: hero + features + comparison + ecosystem per DESIGN.md D14.
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import CodeBlock from '~/components/code-block.vue';

definePage({
  layout: 'home'
});

const route = useRoute();
const isZh = computed(() => route.path === '/zh' || route.path.startsWith('/zh/'));

const heroCode = `// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  modules: ['@ubean/auth', '@ubean/ui', '@ubean/pinia'],
  ssr: true,
  i18n: { defaultLocale: 'en', locales: ['en', 'zh'] }
});`;

const features = [
  {
    icon: 'lucide:server',
    title: { en: 'Full-stack SSR', zh: '全栈 SSR' },
    desc: {
      en: 'Vue SSR with Inertia-style page routing, islands architecture, and view transitions. Per-route SSR control and streaming support for fast TTFB.',
      zh: 'Vue SSR 配合 Inertia 式页面路由、群岛架构和视图过渡。支持按路由控制 SSR 和流式渲染，提升 TTFB。'
    },
    span: 'sm:col-span-2 lg:col-span-2',
    featured: true
  },
  {
    icon: 'lucide:route',
    title: { en: 'File-based Routing', zh: '文件式路由' },
    desc: { en: 'Typed API + page routes, defineHandler chains, definePage macro, route guards.', zh: '类型安全的 API + 页面路由，defineHandler 链式调用，definePage 宏，路由守卫。' }
  },
  {
    icon: 'lucide:boxes',
    title: { en: 'Islands', zh: '群岛架构' },
    desc: { en: 'Partial hydration via client:load|idle|visible|media|only, auto-registered and hydrated.', zh: '通过 client:load|idle|visible|media|only 指令实现部分水合，自动注册并自动水合。' }
  },
  {
    icon: 'lucide:cloud',
    title: { en: 'Multi-platform', zh: '多平台部署' },
    desc: { en: 'Node, Cloudflare, Vercel, Netlify, Bun, Deno presets with capability matrix.', zh: '支持 Node、Cloudflare、Vercel、Netlify、Bun、Deno 预设及能力矩阵。' }
  },
  {
    icon: 'lucide:wrench',
    title: { en: 'DevTools', zh: '开发者工具' },
    desc: {
      en: 'iframe panel with Pages, API, Middleware, Cron, Env, Playground, and AI assistant. Full route inspection and server action debugging.',
      zh: '基于 iframe 的检查面板，包含页面、API、中间件、定时任务、环境变量、Playground 和 AI 助手。完整的路由检查和服务器操作调试。'
    },
    span: 'sm:col-span-2 lg:col-span-2',
    featured: true
  },
  {
    icon: 'lucide:languages',
    title: { en: 'i18n', zh: '国际化' },
    desc: { en: 'Built-in zero-dependency i18n with 3 routing strategies and SSR hydration.', zh: '内置零依赖 i18n 系统，支持 3 种路由策略和 SSR 水合。' }
  }
];

const ecosystem = [
  { name: '@ubean/auth', desc: { en: 'Email/password and OAuth authentication with session management.', zh: '邮箱/密码和 OAuth 认证，支持会话管理。' } },
  { name: '@ubean/icon', desc: { en: 'Local SVG icon collections with Iconify API fallback.', zh: '本地 SVG 图标集，支持 Iconify API 回退。' } },
  { name: '@ubean/pwa', desc: { en: 'Service worker generation with 5 cache strategies.', zh: 'Service Worker 生成，支持 5 种缓存策略。' } },
  { name: '@ubean/image', desc: { en: 'Optimized image processing and responsive srcset.', zh: '图片优化处理和响应式 srcset。' } },
  { name: '@ubean/content', desc: { en: 'Markdown and MDX content with frontmatter and TOC.', zh: 'Markdown 和 MDX 内容处理，支持 frontmatter 和目录。' } },
  { name: '@ubean/fonts', desc: { en: 'Font auto-import with variable font support.', zh: '字体自动导入，支持可变字体。' } },
  { name: '@ubean/electron', desc: { en: 'Desktop app integration via vite-plugin-electron.', zh: '通过 vite-plugin-electron 集成桌面应用。' } },
  { name: '@ubean/ui', desc: { en: 'SoybeanUI component auto-import and theming.', zh: 'SoybeanUI 组件自动导入和主题。' } },
  { name: '@ubean/pinia', desc: { en: 'Pinia store integration with SSR state hydration.', zh: 'Pinia 状态管理集成，支持 SSR 状态水合。' } }
];

// Derive locale from the route path for SSR-safe localized links.
const prefix = computed(() => isZh.value ? '/zh' : '');
const getStartedTo = computed(() => `${prefix.value}/guide/quickstart`);
const comparisonTo = computed(() => `${prefix.value}/architecture/framework-comparison`);
const L = computed(() => isZh.value ? 'zh' : 'en');
</script>

<template>
  <div>
    <!-- Hero -->
    <section class="mx-auto max-w-4xl px-6 pt-20 pb-16 text-center">
      <h1 class="text-5xl md:text-6xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary-600 to-primary dark:from-primary dark:to-primary-300">
        ubean
      </h1>
      <p class="mt-6 text-xl text-muted-foreground">
        {{ isZh ? '基于 Vite、Hono 和 Vue 构建的全栈 Vue 元框架。' : 'A full-stack Vue meta-framework built on Vite, Hono and Vue.' }}
      </p>
      <div class="mt-10 flex items-center justify-center gap-4">
        <SButtonLink size="lg" shape="rounded" :to="getStartedTo">
          {{ isZh ? '快速开始' : 'Get Started' }}
          <SIcon icon="lucide:arrow-right" />
        </SButtonLink>
        <SButtonLink
          size="lg"
          variant="outline"
          shape="rounded"
          to="https://github.com/soybeanjs/ubean"
          target="_blank"
          rel="noopener noreferrer"
        >
          <SIcon icon="lucide:github" />
          GitHub
        </SButtonLink>
      </div>
      <div class="mx-auto mt-14 max-w-2xl text-left">
        <CodeBlock :code="heroCode" lang="ts" />
      </div>
    </section>

    <!-- Features (bento layout: featured cards span 2 columns) -->
    <section class="mx-auto max-w-6xl px-6 py-16">
      <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div
          v-for="f in features"
          :key="f.title"
          class="docs-border relative overflow-hidden rounded-xl p-6 transition-colors hover:border-primary/40"
          :class="f.span"
        >
          <div
            v-if="f.featured"
            aria-hidden="true"
            class="pointer-events-none absolute inset-x-0 top-0 h-24 bg-linear-to-r from-primary/8 to-transparent opacity-80"
          />
          <div class="relative">
            <SIcon :icon="f.icon" class="size-6 text-primary mb-4" />
            <h3 class="font-semibold mb-2" :class="f.featured ? 'text-lg' : ''">{{ f.title[L] }}</h3>
            <p class="text-sm text-muted-foreground leading-relaxed">{{ f.desc[L] }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Comparison (rendered from architecture/framework-comparison.md at that route) -->
    <section class="mx-auto max-w-6xl px-6 py-16">
      <h2 class="text-2xl font-bold mb-4">{{ isZh ? 'ubean 与其他框架对比' : 'How does ubean compare?' }}</h2>
      <p class="text-muted-foreground mb-8">{{ isZh ? '完整的对比分析请见架构部分。' : 'A full comparison lives in the Architecture section.' }}</p>
      <SButtonLink variant="outline" shape="rounded" :to="comparisonTo">
        {{ isZh ? '查看框架对比' : 'View framework comparison' }}
        <SIcon icon="lucide:arrow-right" />
      </SButtonLink>
    </section>

    <!-- Ecosystem -->
    <section class="mx-auto max-w-6xl px-6 py-16">
      <h2 class="text-2xl font-bold mb-8">{{ isZh ? '生态系统' : 'Ecosystem' }}</h2>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="pkg in ecosystem"
          :key="pkg.name"
          class="docs-border rounded-lg p-4 transition-colors hover:border-primary/40"
        >
          <code class="font-mono text-sm font-semibold text-primary">{{ pkg.name }}</code>
          <p class="mt-2 text-xs text-muted-foreground leading-relaxed">{{ pkg.desc[L] }}</p>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="docs-border mt-16 border-t">
      <div class="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
        <div class="flex items-center gap-2 text-sm text-muted-foreground">
          <AppLogo class="size-5" />
          <span>ubean</span>
        </div>
        <div class="flex items-center gap-6 text-sm text-muted-foreground">
          <SLink to="https://github.com/soybeanjs/ubean" target="_blank" rel="noopener noreferrer" class="transition-colors hover:text-foreground">
            GitHub
          </SLink>
          <SLink :to="`${prefix}/guide/quickstart`" class="transition-colors hover:text-foreground">
            {{ isZh ? '文档' : 'Docs' }}
          </SLink>
          <SLink :to="`${prefix}/architecture/framework-comparison`" class="transition-colors hover:text-foreground">
            {{ isZh ? '架构' : 'Architecture' }}
          </SLink>
        </div>
      </div>
    </footer>
  </div>
</template>
