import { defineApp } from 'ubean/runtime/vue';

// Islands are auto-registered and auto-hydrated by the framework:
// - `ubeanIslandsPlugin` scans `client:xxx` directives, resolves imports,
//   and generates `virtual:ubean-islands-registry`.
// - The client entry automatically calls `hydrateIslands()` after mount
//   (double rAF) and after SPA navigation (`router.afterEach`).
// - No manual `hydrateIslands()` call or `components` map is needed.

export default defineApp({
  head: {
    title: 'ubean frontend-only',
    meta: [
      { name: 'description', content: 'ubean SPA-style example without backend routes' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' }
    ]
  },
  rootId: 'app'
});
