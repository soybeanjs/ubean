/**
 * Content slug (relative to `{locale}` content dir, no `.md`) -> public route path.
 *
 * ubean's content tree is section-first (`guide/`, `integrations/`, `reference/`,
 * `architecture/`, `ecosystem/`, `contributing/`), so unlike the reference docs
 * site there is no `ui/` → `/overview` remapping. Only two rules apply:
 *
 * - a trailing `index` collapses to its directory root (`guide/index` -> `/guide`)
 * - everything else mirrors the file tree (`guide/pages-routing/loaders` ->
 *   `/guide/pages-routing/loaders`)
 *
 * Shared by the SSG preroute collector (`build/docs-routes.ts`), the sitemap
 * writer (`build/seo.ts`) and the client-side search, so indexed hits always
 * lead to real routes.
 */
export function resolveContentRoutePath(inputSlug: string): string {
  const slug = inputSlug.replace(/\/index$/u, '').replace(/^index$/u, '');

  return slug ? `/${slug}` : '/';
}
