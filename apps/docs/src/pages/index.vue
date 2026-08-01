<script setup lang="ts">
// Home page: hero + features + comparison + ecosystem per DESIGN.md D14.
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import CodeBlock from '~/components/code-block.vue';

definePage({
  layout: 'home'
});

const route = useRoute();

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
    title: 'Full-stack SSR',
    desc: 'Vue SSR with Inertia-style page routing, islands architecture, and view transitions. Per-route SSR control and streaming support for fast TTFB.',
    span: 'sm:col-span-2 lg:col-span-2',
    featured: true
  },
  { icon: 'lucide:route', title: 'File-based Routing', desc: 'Typed API + page routes, defineHandler chains, definePage macro, route guards.' },
  { icon: 'lucide:boxes', title: 'Islands', desc: 'Partial hydration via client:load|idle|visible|media|only, auto-registered and hydrated.' },
  { icon: 'lucide:cloud', title: 'Multi-platform', desc: 'Node, Cloudflare, Vercel, Netlify, Bun, Deno presets with capability matrix.' },
  {
    icon: 'lucide:wrench',
    title: 'DevTools',
    desc: 'iframe panel with Pages, API, Middleware, Cron, Env, Playground, and AI assistant. Full route inspection and server action debugging.',
    span: 'sm:col-span-2 lg:col-span-2',
    featured: true
  },
  { icon: 'lucide:languages', title: 'i18n', desc: 'Built-in zero-dependency i18n with 3 routing strategies and SSR hydration.' }
];

const ecosystem = [
  { name: '@ubean/auth', desc: 'Email/password and OAuth authentication with session management.' },
  { name: '@ubean/icon', desc: 'Local SVG icon collections with Iconify API fallback.' },
  { name: '@ubean/pwa', desc: 'Service worker generation with 5 cache strategies.' },
  { name: '@ubean/image', desc: 'Optimized image processing and responsive srcset.' },
  { name: '@ubean/content', desc: 'Markdown and MDX content with frontmatter and TOC.' },
  { name: '@ubean/fonts', desc: 'Font auto-import with variable font support.' },
  { name: '@ubean/electron', desc: 'Desktop app integration via vite-plugin-electron.' },
  { name: '@ubean/ui', desc: 'SoybeanUI component auto-import and theming.' },
  { name: '@ubean/pinia', desc: 'Pinia store integration with SSR state hydration.' }
];

// Derive locale from the route path for SSR-safe localized links.
// Using route.path (not useI18n().locale) ensures server and client render
// the same paths, preventing hydration mismatches.
const prefix = computed(() => route.path === '/zh' || route.path.startsWith('/zh/') ? '/zh' : '');
const getStartedTo = computed(() => `${prefix.value}/guide/quickstart`);
const comparisonTo = computed(() => `${prefix.value}/architecture/framework-comparison`);
</script>

<template>
  <div>
    <!-- Hero -->
    <section class="mx-auto max-w-4xl px-6 pt-20 pb-16 text-center">
      <h1 class="text-5xl md:text-6xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary-600 to-primary dark:from-primary dark:to-primary-300">
        ubean
      </h1>
      <p class="mt-6 text-xl text-muted-foreground">
        A full-stack Vue meta-framework built on Vite, Hono and Vue.
      </p>
      <div class="mt-10 flex items-center justify-center gap-4">
        <SButtonLink size="lg" shape="rounded" :to="getStartedTo">
          Get Started
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
            <h3 class="font-semibold mb-2" :class="f.featured ? 'text-lg' : ''">{{ f.title }}</h3>
            <p class="text-sm text-muted-foreground leading-relaxed">{{ f.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Comparison (rendered from architecture/framework-comparison.md at that route) -->
    <section class="mx-auto max-w-6xl px-6 py-16">
      <h2 class="text-2xl font-bold mb-4">How does ubean compare?</h2>
      <p class="text-muted-foreground mb-8">A full comparison lives in the Architecture section.</p>
      <SButtonLink variant="outline" shape="rounded" :to="comparisonTo">
        View framework comparison
        <SIcon icon="lucide:arrow-right" />
      </SButtonLink>
    </section>

    <!-- Ecosystem -->
    <section class="mx-auto max-w-6xl px-6 py-16">
      <h2 class="text-2xl font-bold mb-8">Ecosystem</h2>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="pkg in ecosystem"
          :key="pkg.name"
          class="docs-border rounded-lg p-4 transition-colors hover:border-primary/40"
        >
          <code class="font-mono text-sm font-semibold text-primary">{{ pkg.name }}</code>
          <p class="mt-2 text-xs text-muted-foreground leading-relaxed">{{ pkg.desc }}</p>
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
            Docs
          </SLink>
          <SLink :to="`${prefix}/architecture/framework-comparison`" class="transition-colors hover:text-foreground">
            Architecture
          </SLink>
        </div>
      </div>
    </footer>
  </div>
</template>
