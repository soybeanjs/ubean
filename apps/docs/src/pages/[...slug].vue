<script setup lang="ts">
// Catch-all Doc Page route. Resolves content/{locale}/{slug}.md and renders it,
// OR renders <ApiTable> for /reference/api/<pkg> routes (7 curated packages).
//
// Per DESIGN.md D2/D7: content lives in src/content/{en,zh}/, i18n is routing-only
// (ubean i18n does not switch content per locale, so this catch-all detects locale
// from the path prefix and loads the corresponding content tree).
import { shallowRef, computed, watch, watchEffect, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useHead } from '@unhead/vue';
import { parseFrontmatter, extractHeadings } from '@ubean/markdown';
import ApiTable from '~/components/api-table.vue';
import DocMd from '~/components/doc-md.vue';
import { setDocOutline, resetDocOutline } from '~/composables/use-doc-outline';
import type { DocOutlineItem } from '~/composables/use-doc-outline';

definePage({
  layout: 'default'
});

const route = useRoute();
const router = useRouter();
// useDocOutline() returns the reactive outline ref (read by the layout).
// setDocOutline / resetDocOutline are auto-imported separately from the composable module.

// Eager globs so SSG prerender can resolve content at build time.
// 1. .md as Vue components (unplugin-vue-markdown transforms them).
const mdModules = import.meta.glob('../content/**/*.md', { eager: true });
// 2. .md as raw strings (for frontmatter + headings extraction).
const mdRaw = import.meta.glob('../content/**/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const TYPEDOC_PACKAGES = ['ubean', 'runtime', 'routing', 'config', 'auth', 'ui', 'pinia'];

interface Resolved {
  kind: 'md' | 'api';
  component?: any;
  frontmatter?: Record<string, any>;
  headings?: { level: number; text: string; id: string }[];
  pkg?: string;
  notFound?: boolean;
  /** When the zh content is a translated-stub, this holds the English
   * fallback component so the page shows useful content instead of the
   * "not translated" placeholder. */
  fallbackComponent?: any;
  /** English fallback headings (used for the sidebar outline when the
   * zh content is a stub). */
  fallbackHeadings?: { level: number; text: string; id: string }[];
}

function resolveContent(path: string): Resolved {
  // Detect locale + slug.
  let locale = 'en';
  let slug = path;
  if (path.startsWith('/zh/')) {
    locale = 'zh';
    slug = path.slice(3);
  } else if (path === '/zh') {
    locale = 'zh';
    slug = '/';
  }

  // /reference/api/<pkg> → ApiTable.
  const apiMatch = slug.match(/^\/reference\/api\/([a-z]+)\/?$/);
  if (apiMatch) {
    const pkg = apiMatch[1];
    if (TYPEDOC_PACKAGES.includes(pkg)) {
      return { kind: 'api', pkg };
    }
  }

  // Markdown content: resolve /<slug> → ../content/{locale}/<slug>.md
  const normalized = slug === '/' ? '/index' : slug.replace(/\/$/, '');
  const contentKey = `../content/${locale}${normalized}.md`;

  const mod = mdModules[contentKey];
  const raw = mdRaw[contentKey];

  if (!mod || !raw) {
    return { kind: 'md', notFound: true };
  }

  const { data: frontmatter } = parseFrontmatter(raw);
  // Per D16: build a nested h2→h3 tree so the outline can render h3 indented
  // under their parent h2. extractHeadings returns headings in document order.
  const allHeadings = extractHeadings(raw).filter(h => h.level === 2 || h.level === 3);

  const result: Resolved = {
    kind: 'md',
    component: (mod as any).default,
    frontmatter,
    headings: allHeadings
  };

  // Dynamic fallback: when the zh content is a translated-stub, load the
  // English version so the page shows useful content instead of a placeholder.
  if (locale === 'zh' && frontmatter.status === 'translated-stub') {
    const enKey = `../content/en${normalized}.md`;
    const enMod = mdModules[enKey];
    const enRaw = mdRaw[enKey];
    if (enMod && enRaw) {
      result.fallbackComponent = (enMod as any).default;
      result.fallbackHeadings = extractHeadings(enRaw).filter(h => h.level === 2 || h.level === 3);
    }
  }

  return result;
}

/** Build a nested h2→h3 outline tree from flat headings (D16). */
function buildNestedOutline(headings: { level: number; text: string; id: string }[]): DocOutlineItem[] {
  const tree: DocOutlineItem[] = [];
  let currentH2: DocOutlineItem | null = null;
  for (const h of headings) {
    if (h.level === 2) {
      currentH2 = { label: h.text, value: h.id, level: 2, children: [] };
      tree.push(currentH2);
    } else if (h.level === 3) {
      const item: DocOutlineItem = { label: h.text, value: h.id, level: 3 };
      if (currentH2) {
        currentH2.children!.push(item);
      } else {
        // h3 before any h2 — promote to top-level.
        tree.push(item);
      }
    }
  }
  // Drop empty children arrays so the mapper can omit `children`.
  for (const item of tree) {
    if (item.children && item.children.length === 0) {
      delete item.children;
    }
  }
  return tree;
}

const resolved = shallowRef<Resolved>(resolveContent(route.path));

// Re-resolve on navigation.
watch(() => route.path, (p) => {
  resolved.value = resolveContent(p);
});

// Sync outline whenever the page changes.
// When the zh content is a stub with an English fallback, use the fallback's
// headings so the outline matches the actually-displayed (English) content.
watchEffect(() => {
  const r = resolved.value;
  if (r.kind === 'md' && !r.notFound) {
    const headings = r.fallbackComponent ? r.fallbackHeadings : r.headings;
    if (headings) {
      setDocOutline(buildNestedOutline(headings));
    } else {
      resetDocOutline();
    }
  } else {
    resetDocOutline();
  }
});

// Head must be registered once during setup. Calling useHead() inside
// watchEffect works on the first synchronous run, but re-runs outside the
// setup context on subsequent navigations, raising "useHead() was called
// without provide context". Pass a computed so it stays reactive when
// resolved.value changes (useHead accepts ComputedRef<ReactiveHead>).
useHead(computed(() => {
  const r = resolved.value;
  if (r.kind === 'api' && r.pkg) {
    return { title: `@ubean/${r.pkg} · ubean` };
  }
  if (r.kind === 'md' && r.frontmatter) {
    const title = r.frontmatter.title ? String(r.frontmatter.title) : 'ubean docs';
    const description = r.frontmatter.description ? String(r.frontmatter.description) : undefined;
    return {
      title: title === 'ubean - Full-stack Vue Meta-framework' ? title : `${title} · ubean`,
      ...(description ? { meta: [{ name: 'description', content: description }] } : {})
    };
  }
  return {};
}));

onUnmounted(() => resetDocOutline());

const pageTitle = computed(() => resolved.value.frontmatter?.title || '');
/** When true, the zh content is a translated-stub and we show the English
 * fallback with a notice banner instead of the stub placeholder. */
const isStubFallback = computed(() => !!resolved.value.fallbackComponent);
const displayComponent = computed(() =>
  resolved.value.fallbackComponent || resolved.value.component
);
const isZh = computed(() => route.path === '/zh' || route.path.startsWith('/zh/'));
</script>

<template>
  <main class="mx-auto min-w-0 max-w-3xl">
    <!-- API reference page -->
    <template v-if="resolved.kind === 'api'">
      <article class="docs-card relative overflow-hidden">
        <div
          aria-hidden="true"
          class="pointer-events-none absolute inset-x-0 top-0 h-36 bg-linear-to-r from-primary/8 via-warning/6 to-info/8 opacity-80"
        />
        <div class="relative px-5 py-6 sm:px-8 sm:py-8 xl:px-10 xl:py-10">
          <h1 class="mb-2 text-3xl font-bold">{{ `@ubean/${resolved.pkg}` }}</h1>
          <p class="mb-6 text-muted-foreground">{{ isZh ? '基于包类型定义生成的 API 参考。' : 'API reference generated from package type definitions.' }}</p>
          <ApiTable :pkg="resolved.pkg!" />
        </div>
      </article>
    </template>

    <!-- Markdown content page -->
    <template v-else-if="!resolved.notFound">
      <div v-if="pageTitle" class="mb-6 flex items-center gap-3">
        <h1 v-if="pageTitle" class="text-3xl font-bold">{{ pageTitle }}</h1>
      </div>
      <!--
 Translation fallback notice: shown when the zh content is a stub
           and the English version is displayed instead.
-->
      <div
        v-if="isStubFallback"
        class="docs-border mb-4 flex items-center gap-2 rounded-lg bg-warning/5 px-4 py-3 text-sm text-muted-foreground"
        role="status"
      >
        <SIcon icon="lucide:languages" class="size-4 shrink-0 text-warning" />
        <span>此页面尚未翻译完成，当前显示英文内容。Translation in progress — showing English content.</span>
      </div>
      <DocMd :component="displayComponent" :path="route.path" />
    </template>

    <!-- Not found -->
    <template v-else>
      <div class="py-16 text-center">
        <div class="mb-2 text-5xl font-bold text-muted-foreground">404</div>
        <p class="mb-4 text-muted-foreground">{{ isZh ? '此页面不存在。' : "This page doesn't exist in the docs." }}</p>
        <SButton variant="outline" shape="rounded" @click="router.push(isZh ? '/zh' : '/')">{{ isZh ? '返回首页' : 'Back to home' }}</SButton>
      </div>
    </template>
  </main>
</template>
