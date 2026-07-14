import { defineApp, hydrateIslands } from 'ubean/runtime/vue';
import IslandClock from './components/IslandClock.vue';
import IslandCounter from './components/IslandCounter.vue';
import IslandMedia from './components/IslandMedia.vue';
import IslandOnly from './components/IslandOnly.vue';
import IslandVisibility from './components/IslandVisibility.vue';

// Locales are auto-loaded by ubean:locales virtual module on the server,
// and auto-hydrated on the client via SSR-injected __UBEAN_LOCALE__ data.
// No manual defineLocale() needed here.

const islandComponents = {
  IslandCounter,
  IslandClock,
  IslandVisibility,
  IslandMedia,
  IslandOnly
};

export default defineApp({
  head: {
    title: 'ubean测试',
    meta: [
      { name: 'description', content: 'ubean framework functional test project' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' }
    ]
  },
  rootId: 'app',
  onClientReady: app => {
    hydrateIslands({
      components: islandComponents,
      appContext: app
    });
  }
});
