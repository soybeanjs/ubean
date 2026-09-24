<script setup lang="ts">
import { nextTick, onBeforeUnmount, onServerPrefetch, shallowRef, watchEffect } from 'vue';
import type { Component } from 'vue';
import type { AnchorOptionData } from '@vean/aria/anchor';
import { useDocOutline } from '~/composables/use-doc-outline';
import { toHeadingId } from '~/shared/heading';

interface Props {
  /**
   * The path to the markdown file, relative to `src/content/{locale}/`
   *
   * @example 'guide/quickstart', 'reference/cache', 'guide/pages-routing/loaders'
   */
  path: string;
}

const props = defineProps<Props>();

interface Emits {
  /**
   * Emitted after each load attempt.
   *
   * - `found`: a document exists for the active locale.
   * - `fallback`: the active locale had no document and the English one was used
   *   instead (callers surface an "untranslated" notice).
   * - `missing`: neither locale has the document (callers render 404).
   */
  loaded: [result: { found: boolean; fallback: boolean; missing: boolean }];
}

const emit = defineEmits<Emits>();

const { locale } = useI18n();

const docOutline = useDocOutline();

const mdModules = import.meta.glob<{ default: Component }>('./**/*.md', { base: '/src/content' });

/**
 * Raw markdown, used only to read frontmatter. A translated page can be a
 * placeholder that exists on disk but carries no body, so mere file existence is
 * not enough to decide whether the locale genuinely has content.
 */
const mdRaw = import.meta.glob<string>('./**/*.md', {
  base: '/src/content',
  query: '?raw',
  import: 'default'
});

const cp = shallowRef<Component | null>(null);
const contentRef = shallowRef<HTMLElement | null>(null);
/**
 * True when the active locale has no usable body and the English one is shown.
 *
 * Rendered by THIS component rather than by the page: the page's render happens
 * before a child's `onServerPrefetch` resolves, so a parent-owned `v-if` would
 * never make it into the prerendered HTML.
 */
const isUntranslated = shallowRef(false);
let loadVersion = 0;

/** True when the markdown frontmatter marks the page as an untranslated placeholder. */
function isTranslationStub(source: string | undefined): boolean {
  if (!source) {
    return false;
  }

  const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---/u);

  return frontmatter ? /^\s*status:\s*translated-stub\s*$/mu.test(frontmatter[1]) : false;
}

async function loadDoc() {
  loadVersion += 1;
  const currentLoadVersion = loadVersion;

  let path = props.path;
  if (path.startsWith('/')) {
    path = path.slice(1);
  }
  if (path.endsWith('.md')) {
    path = path.slice(0, -3);
  }

  const key = `./${locale.value}/${path}.md`;
  const load = mdModules[key];

  docOutline.value = [];

  // A locale page that exists but is only a placeholder is treated as absent
  // content, so the English body is shown instead of the "not translated" stub.
  const localizedSource = mdRaw[key] ? await mdRaw[key]() : undefined;
  const isStub = isTranslationStub(localizedSource);

  if (load && !isStub) {
    const mod = await load();

    if (currentLoadVersion !== loadVersion) {
      return;
    }

    isUntranslated.value = false;
    cp.value = mod.default;

    await nextTick();
    updateDocOutline();

    emit('loaded', { found: true, fallback: false, missing: false });
    return;
  }

  // Locale content may be missing or an untranslated placeholder; fall back so the
  // page still renders, and mark it so the notice is shown.
  const fallbackLoad = locale.value === 'en' ? undefined : mdModules[`./en/${path}.md`];

  if (fallbackLoad) {
    const mod = await fallbackLoad();

    if (currentLoadVersion !== loadVersion) {
      return;
    }

    isUntranslated.value = true;
    cp.value = mod.default;

    await nextTick();
    updateDocOutline();

    emit('loaded', { found: false, fallback: true, missing: false });
    return;
  }

  isUntranslated.value = false;
  cp.value = null;

  emit('loaded', { found: false, fallback: false, missing: true });
}

function updateDocOutline() {
  const container = contentRef.value;

  if (!container) {
    docOutline.value = [];
    return;
  }

  const headings = Array.from(
    container.querySelectorAll<HTMLElement>('.markdown-wrapper h2, .markdown-wrapper h3, .markdown-wrapper h4')
  );

  if (!headings.length) {
    docOutline.value = [];
    return;
  }

  const usedIds = new Set(
    Array.from(container.querySelectorAll<HTMLElement>('[id]'))
      .map(element => element.id)
      .filter(Boolean)
  );
  const idCounter = new Map<string, number>();

  const nodes = headings.map(heading => {
    const level = Number.parseInt(heading.tagName.slice(1), 10);
    const title = heading.textContent?.trim() ?? '';

    if (!heading.id) {
      const baseId = toHeadingId(title);
      const currentCount = idCounter.get(baseId) ?? 0;
      let nextCount = currentCount;
      let candidateId = '';

      do {
        nextCount += 1;
        candidateId = nextCount > 1 ? `${baseId}-${nextCount}` : baseId;
      } while (usedIds.has(candidateId));

      idCounter.set(baseId, nextCount);
      heading.id = candidateId;
      usedIds.add(candidateId);
    }

    return {
      level,
      item: {
        href: `#${heading.id}`,
        title
      } satisfies AnchorOptionData
    };
  });

  docOutline.value = buildAnchorItems(nodes);
}

function buildAnchorItems(nodes: Array<{ level: number; item: AnchorOptionData }>) {
  const root: AnchorOptionData[] = [];
  const stack: Array<{ level: number; item: AnchorOptionData }> = [];

  for (const node of nodes) {
    while (stack.length && stack[stack.length - 1].level >= node.level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1]?.item;

    if (parent) {
      parent.children ??= [];
      parent.children.push(node.item);
    } else {
      root.push(node.item);
    }

    stack.push(node);
  }

  return root;
}

onBeforeUnmount(() => {
  docOutline.value = [];
});

// SSR (ubean SSG): the renderer only awaits `onServerPrefetch`, so the async glob
// load must be hoisted here or the article renders empty in the prerendered HTML.
onServerPrefetch(() => loadDoc());

watchEffect(() => {
  loadDoc();
});
</script>

<template>
  <div ref="contentRef" class="min-w-0">
    <div
      v-if="isUntranslated"
      class="mb-4 flex items-center gap-2 border border-border/50 dark:border-border rounded-lg px-4 py-3 text-sm text-muted-foreground"
      role="status"
    >
      <SIcon icon="lucide:languages" class="size-4 shrink-0 text-warning" />
      <span>此页面尚未翻译完成，当前显示英文内容。Translation in progress — showing English content.</span>
    </div>

    <article
      v-if="cp"
      :data-doc-path="path"
      class="relative min-w-0 border border-border/50 dark:border-border rounded-xl overflow-hidden"
    >
      <div
        aria-hidden="true"
        class="pointer-events-none absolute inset-x-0 top-0 h-36 bg-linear-to-r from-primary/8 via-warning/6 to-info/8 opacity-80"
      />
      <div class="relative min-w-0 px-5 py-6 sm:px-8 sm:py-8 xl:px-10 xl:py-10">
        <div class="min-w-0">
          <component :is="cp" />
        </div>
      </div>
    </article>
  </div>
</template>
