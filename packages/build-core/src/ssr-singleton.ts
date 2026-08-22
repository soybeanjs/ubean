/**
 * Single-copy runtime policy for Vite client / SSR graphs.
 *
 * `@ubean/i18n` (ALS + catalogs) and `@ubean/client` (locale runtime) must
 * resolve to one module instance per process. Dev and production use the
 * same package lists; only the SSR externalization differs:
 *
 * - Dev: Vite `ssrLoadModule` and the CLI-created app share Node's
 *   `@ubean/i18n` (external). `ubean` stays noExternal so virtual ids resolve.
 * - Prod: `ubean` is bundled (`noExternal`). Do **not** also externalize
 *   `@ubean/i18n` — that would create a second copy beside the bundle.
 */

export const SSR_SINGLETON_PACKAGES = [
  'ubean',
  '@ubean/client',
  '@ubean/i18n',
  'vue-i18n',
  '@intlify/core',
  '@intlify/core-base'
] as const;

export const SSR_SINGLETON_DEDUPE = ['vue', 'vue-i18n', '@ubean/client', '@ubean/i18n'] as const;

export const SSR_SINGLETON_OPTIMIZE_EXCLUDE = ['ubean', '@ubean/client', '@ubean/i18n'] as const;

export function ssrSingletonDevPolicy(): {
  resolve: { dedupe: string[] };
  optimizeDeps: { exclude: string[]; include: string[] };
  ssr: { noExternal: string[]; external: string[] };
} {
  return {
    resolve: { dedupe: [...SSR_SINGLETON_DEDUPE] },
    optimizeDeps: {
      exclude: [...SSR_SINGLETON_OPTIMIZE_EXCLUDE],
      include: ['vue-i18n']
    },
    ssr: {
      noExternal: ['ubean', 'vue-i18n', '@intlify/core', '@intlify/core-base'],
      external: ['@ubean/i18n']
    }
  };
}

export function ssrSingletonProdSsr(): { noExternal: string[] } {
  return {
    noExternal: ['ubean', 'vue-i18n', '@intlify/core', '@intlify/core-base']
  };
}

export function ssrSingletonProdOptimizeExclude(extra: string[] = []): string[] {
  return [...SSR_SINGLETON_OPTIMIZE_EXCLUDE, ...extra];
}
