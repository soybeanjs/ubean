/**
 * SvelteKit-style form action URL parsing (P9-02).
 *
 * Form actions are invoked via `POST /page?/<actionName>`:
 *
 *  - `POST /login` → `actions.default`
 *  - `POST /login?/login` → `actions.login`
 *  - `POST /login?/register` → `actions.register`
 *
 * The `?/<name>` syntax is URL-safe and works without JavaScript (the
 * browser submits the form to the full URL). On the server, the page
 * route handler parses the action name from the URL's search query.
 *
 * For progressive enhancement, the client can intercept the form submit
 * and call the action via `useFormAction()` for SPA-style navigation.
 */

/**
 * Extract the form action name from a URL's search query.
 *
 * SvelteKit's convention: the query string contains a single key `/<name>`
 * with no value. URLSearchParams treats this as a key with empty value.
 *
 * - `?/login` → `login`
 * - `?/register` → `register`
 * - `?` (no action) → `default`
 * - (no query) → `default`
 *
 * @returns The action name, or `'default'` when no specific action is
 *          specified.
 */
export function parseFormActionName(url: string | URL): string {
  const search = typeof url === 'string' ? url : url.search;
  // Match `?/name` or `&/name` — the leading `?` or `&` is part of the
  // query string syntax, followed by `/<name>` as the key.
  const match = search.match(/[?&]\/([^&]+)/);
  return match ? match[1] : 'default';
}

/**
 * Build a form action URL for the current page.
 *
 * Used by `useFormAction()` to generate the `action` attribute for
 * `<form>` elements. The URL is relative so it works on any page.
 *
 * - `useFormAction()` → `?/default`
 * - `useFormAction('login')` → `?/login`
 * - `useFormAction('register')` → `?/register`
 *
 * The returned string is intended for `<form :action="formAction">` —
 * the browser submits to the current page URL with the action name
 * appended as a query parameter.
 */
export function buildFormActionUrl(actionName: string = 'default'): string {
  if (!actionName || actionName === 'default') {
    return '?/default';
  }
  // Encode the action name to be URL-safe (allows spaces, slashes, etc.)
  return `?/${encodeURIComponent(actionName)}`;
}

/**
 * Check whether a URL's query string contains a form action specifier
 * (`?/<name>` pattern).
 */
export function hasFormAction(url: string | URL): boolean {
  const search = typeof url === 'string' ? url : url.search;
  return /[?&]\/[^&]+/.test(search);
}
