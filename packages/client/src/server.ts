/**
 * Server-side entry of `@ubean/client` — re-exports the app factories plus
 * the server head creator. Kept OUT of the browser-safe main barrel
 * (`src/index.ts`) so client bundles never pull `@unhead/vue/server`.
 */
export * from './app';
export { createHead as createServerHead } from '@unhead/vue/server';
