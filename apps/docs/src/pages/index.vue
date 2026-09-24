<script setup lang="ts">
import { computed } from 'vue';
import BackgroundDecoration from '~/motion/background-decoration.vue';

definePage({ layout: 'home' });

const { t } = useI18n();

const features = computed(() => [
  {
    icon: 'lucide:server',
    title: t('home.features.ssr.title'),
    desc: t('home.features.ssr.desc'),
    span: 'sm:col-span-2 lg:col-span-2',
    featured: true
  },
  {
    icon: 'lucide:route',
    title: t('home.features.routing.title'),
    desc: t('home.features.routing.desc')
  },
  {
    icon: 'lucide:boxes',
    title: t('home.features.islands.title'),
    desc: t('home.features.islands.desc')
  },
  {
    icon: 'lucide:cloud',
    title: t('home.features.platforms.title'),
    desc: t('home.features.platforms.desc')
  },
  {
    icon: 'lucide:wrench',
    title: t('home.features.devtools.title'),
    desc: t('home.features.devtools.desc'),
    span: 'sm:col-span-2 lg:col-span-2',
    featured: true
  },
  {
    icon: 'lucide:languages',
    title: t('home.features.i18n.title'),
    desc: t('home.features.i18n.desc')
  }
]);

const ecosystem = computed(() => [
  { name: '@ubean/auth', desc: t('home.ecosystem.auth') },
  { name: '@ubean/icon', desc: t('home.ecosystem.icon') },
  { name: '@ubean/content', desc: t('home.ecosystem.content') },
  { name: '@ubean/image', desc: t('home.ecosystem.image') },
  { name: '@ubean/ai', desc: t('home.ecosystem.ai') },
  { name: '@ubean/integrations', desc: t('home.ecosystem.integrations') }
]);
</script>

<template>
  <div>
    <BackgroundDecoration />

    <div class="relative">
      <!-- Hero -->
      <section class="mx-auto max-w-4xl px-6 pt-20 pb-16 text-center">
        <h1
          class="text-5xl md:text-6xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary-600 to-primary dark:from-primary dark:to-primary-300"
        >
          ubean
        </h1>
        <p class="mt-6 text-xl text-muted-foreground">{{ t('home.tagline') }}</p>
        <div class="mt-10 flex items-center justify-center gap-4">
          <SButtonLink size="lg" shape="rounded" to="/guide/quickstart">
            {{ t('home.get_started') }}
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
      </section>

      <!-- Features (bento layout: featured cards span 2 columns) -->
      <section class="mx-auto max-w-6xl px-6 py-16">
        <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div
            v-for="f in features"
            :key="f.title"
            class="docs-card relative overflow-hidden p-6 transition-colors hover:border-primary/40"
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

      <!-- Ecosystem -->
      <section class="mx-auto max-w-6xl px-6 py-16">
        <h2 class="text-2xl font-bold mb-8">{{ t('home.ecosystem_title') }}</h2>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="pkg in ecosystem"
            :key="pkg.name"
            class="docs-subtle-card p-4 transition-colors hover:border-primary/40"
          >
            <code class="font-mono text-sm font-semibold text-primary">{{ pkg.name }}</code>
            <p class="mt-2 text-xs text-muted-foreground leading-relaxed">{{ pkg.desc }}</p>
          </div>
        </div>
      </section>

      <!-- Footer -->
      <footer class="mt-16 border-t border-border/50 dark:border-border">
        <div class="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <div class="flex items-center gap-2 text-sm text-muted-foreground">
            <AppLogo class="size-5" />
            <span>ubean</span>
          </div>
          <div class="flex items-center gap-6 text-sm text-muted-foreground">
            <SLink
              to="https://github.com/soybeanjs/ubean"
              target="_blank"
              rel="noopener noreferrer"
              class="transition-colors hover:text-foreground"
            >
              GitHub
            </SLink>
            <SLink to="/guide/quickstart" class="transition-colors hover:text-foreground">
              {{ t('home.docs') }}
            </SLink>
            <SLink to="/architecture/overview" class="transition-colors hover:text-foreground">
              {{ t('home.architecture') }}
            </SLink>
          </div>
        </div>
      </footer>
    </div>
  </div>
</template>
