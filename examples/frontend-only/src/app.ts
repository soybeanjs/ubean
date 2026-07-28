import { defineApp, hydrateIslands } from 'ubean/runtime/vue';

// Island components are auto-registered by `ubeanIslandsPlugin` — it scans
// `client:xxx` directives in .vue files, resolves the corresponding imports,
// and generates `virtual:ubean-islands-registry`. `hydrateIslands` (imported
// above from `ubean/runtime/vue`) automatically consumes that registry,
// so no manual `components` map is needed here.

export default defineApp({
  head: {
    title: 'ubean frontend-only',
    meta: [
      { name: 'description', content: 'ubean SPA-style example without backend routes' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' }
    ]
  },
  rootId: 'app',
  onClientReady: app => {
    hydrateIslands({
      appContext: app
    });
  }
});
