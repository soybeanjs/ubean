import { defineApp, hydrateIslands } from 'ubean/runtime/vue';
import IslandCounter from './components/IslandCounter.vue';

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
      components: { IslandCounter },
      appContext: app
    });
  }
});
