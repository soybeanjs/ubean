<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import ApiTable from '~/components/api-table.vue';
import DocMd from '~/components/doc-md.vue';
import { API_PACKAGES, API_ROUTE_PREFIX } from '~/shared/api-packages';

definePage({ layout: 'default' });

const route = useRoute();
const { locale } = useI18n();

/** `/<slug>` (en, unprefixed) or `/zh/<slug>` -> content slug relative to the locale dir. */
const barePath = computed(() => route.path.replace(/^\/zh(?=\/|$)/u, ''));
const contentPath = computed(() => barePath.value.replace(/^\/+/u, '').replace(/\/+$/u, ''));

/**
 * `/reference/api/<slug>` renders the generated TypeDoc data instead of a
 * markdown file. The slug is validated against the shared curated list, so an
 * unknown package falls through to the 404 path rather than an empty table.
 */
const apiPkg = computed(() => {
  const match = barePath.value.match(new RegExp(`^${API_ROUTE_PREFIX}([a-z-]+)/?$`, 'u'));

  if (!match) {
    return null;
  }

  return API_PACKAGES.find(pkg => pkg.slug === match[1])?.slug ?? null;
});

const missing = shallowRef(false);

// Reset on navigation so a previous page's state cannot leak into the next one.
watch([contentPath, apiPkg], () => {
  missing.value = false;
});

function handleLoaded(result: { found: boolean; fallback: boolean; missing: boolean }) {
  missing.value = result.missing;
}
</script>

<template>
  <main class="min-w-0">
    <!-- Generated API reference page -->
    <template v-if="apiPkg">
      <article class="relative min-w-0 border border-border/50 dark:border-border rounded-xl overflow-hidden">
        <div
          aria-hidden="true"
          class="pointer-events-none absolute inset-x-0 top-0 h-36 bg-linear-to-r from-primary/8 via-warning/6 to-info/8 opacity-80"
        />
        <div class="relative min-w-0 px-5 py-6 sm:px-8 sm:py-8 xl:px-10 xl:py-10">
          <h1 class="mb-2 text-3xl font-bold">{{ `@ubean/${apiPkg}` }}</h1>
          <p class="mb-6 text-muted-foreground">
            {{
              locale === 'zh'
                ? '基于包类型定义生成的 API 参考。'
                : 'API reference generated from package type definitions.'
            }}
          </p>
          <ApiTable :pkg="apiPkg" />
        </div>
      </article>
    </template>

    <!--
      Markdown content page. The "untranslated" notice is rendered by <DocMd>
      itself — a parent-owned v-if would not survive prerendering, because the
      page renders before the child's onServerPrefetch resolves.
    -->
    <template v-else>
      <DocMd v-if="!missing" :path="contentPath" @loaded="handleLoaded" />

      <!-- Not found -->
      <div v-else class="mx-auto max-w-2xl py-24 text-center">
        <p
          class="mb-2 text-7xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-primary-600 to-primary dark:from-primary dark:to-primary-300"
        >
          404
        </p>
        <h1 class="mb-3 text-2xl font-bold">{{ locale === 'zh' ? '页面未找到' : 'Page not found' }}</h1>
        <p class="mb-8 text-muted-foreground">
          {{
            locale === 'zh'
              ? '您访问的页面不存在或已被移动。'
              : "The page you're looking for doesn't exist or has been moved."
          }}
        </p>
        <SButtonLink size="lg" shape="rounded" to="/">
          <SIcon icon="lucide:home" />
          {{ locale === 'zh' ? '返回首页' : 'Back to home' }}
        </SButtonLink>
      </div>
    </template>
  </main>
</template>
