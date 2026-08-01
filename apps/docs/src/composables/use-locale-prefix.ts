// Locale-aware link prefixing for the docs sidebar/header navigation.
//
// The menu constants in constants/menus.ts define locale-agnostic paths
// (e.g. '/guide/introduction'). When the user is on a /zh/* page, clicking
// such a link would navigate to the English version — breaking language
// continuity. This composable detects the current locale from the route
// path and provides a helper to prepend '/zh' when needed.
import { computed } from 'vue';
import { useRoute } from 'vue-router';

export function useLocalePrefix() {
  const route = useRoute();

  const isZh = computed(() =>
    route.path === '/zh' || route.path.startsWith('/zh/')
  );

  const localePrefix = computed(() => (isZh.value ? '/zh' : ''));

  /** Prepend the current locale prefix to a locale-agnostic path. */
  function localizedTo(to: string): string {
    if (to.startsWith('/zh')) return to;
    return `${localePrefix.value}${to}`;
  }

  return { isZh, localePrefix, localizedTo };
}
