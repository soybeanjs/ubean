<script setup lang="ts">
// Home page: hero + features + comparison + ecosystem per DESIGN.md D14.
definePage({
  layout: 'home'
});

const features = [
  { icon: 'lucide:server', title: 'Full-stack SSR', desc: 'Vue SSR with Inertia-style page routing, islands architecture, and view transitions.' },
  { icon: 'lucide:route', title: 'File-based Routing', desc: 'Typed API + page routes, defineHandler chains, definePage macro, route guards.' },
  { icon: 'lucide:boxes', title: 'Islands', desc: 'Partial hydration via client:load|idle|visible|media|only — auto-registered & hydrated.' },
  { icon: 'lucide:cloud', title: 'Multi-platform', desc: 'Node, Cloudflare, Vercel, Netlify, Bun, Deno presets with capability matrix.' },
  { icon: 'lucide:wrench', title: 'DevTools', desc: 'iframe panel with Pages, API, Middleware, Cron, Env, Playground, AI assistant.' },
  { icon: 'lucide:languages', title: 'i18n', desc: 'Built-in zero-dependency i18n with 3 routing strategies and SSR hydration.' }
];

const ecosystem = [
  '@ubean/auth', '@ubean/icon', '@ubean/pwa', '@ubean/image',
  '@ubean/content', '@ubean/fonts', '@ubean/electron', '@ubean/ui', '@ubean/pinia'
];
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
        <SButton size="lg" shape="rounded" to="/guide/quickstart">
          Get Started
          <template #suffix><SIcon icon="lucide:arrow-right" /></template>
        </SButton>
        <SButton
          size="lg"
          variant="outline"
          shape="rounded"
          to="https://github.com/soybeanjs/ubean"
          target="_blank"
          rel="noopener noreferrer"
        >
          <template #icon><SIcon icon="lucide:github" /></template>
          GitHub
        </SButton>
      </div>
    </section>

    <!-- Features -->
    <section class="mx-auto max-w-6xl px-6 py-16">
      <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="f in features"
          :key="f.title"
          class="border border-border/50 dark:border-border rounded-xl p-6 hover:border-primary/40 transition-colors"
        >
          <SIcon :icon="f.icon" class="size-6 text-primary mb-4" />
          <h3 class="font-semibold mb-2">{{ f.title }}</h3>
          <p class="text-sm text-muted-foreground leading-relaxed">{{ f.desc }}</p>
        </div>
      </div>
    </section>

    <!-- Comparison (rendered from architecture/framework-comparison.md at that route) -->
    <section class="mx-auto max-w-6xl px-6 py-16">
      <h2 class="text-2xl font-bold mb-4">How does ubean compare?</h2>
      <p class="text-muted-foreground mb-8">A full comparison lives in the Architecture section.</p>
      <SButton variant="outline" shape="rounded" to="/architecture/framework-comparison">
        View framework comparison
        <template #suffix><SIcon icon="lucide:arrow-right" /></template>
      </SButton>
    </section>

    <!-- Ecosystem -->
    <section class="mx-auto max-w-6xl px-6 py-16 pb-32">
      <h2 class="text-2xl font-bold mb-8">Ecosystem</h2>
      <div class="flex flex-wrap gap-3">
        <STag
          v-for="pkg in ecosystem"
          :key="pkg"
          variant="soft"
          color="primary"
          shape="rounded"
        >{{ pkg }}</STag>
      </div>
    </section>
  </div>
</template>
