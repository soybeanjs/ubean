import { defineApp, hydrateIslands, defineLocale, setLocale, getDefaultLocale } from 'ubean/runtime/vue';
import enMessages from './locales/en.json';
import zhMessages from './locales/zh.json';
import IslandClock from './components/IslandClock.vue';
import IslandCounter from './components/IslandCounter.vue';
import IslandMedia from './components/IslandMedia.vue';
import IslandOnly from './components/IslandOnly.vue';
import IslandVisibility from './components/IslandVisibility.vue';

// Register locales on client side for hydration.
// Server side registration is handled by middleware/02.i18n.ts.
defineLocale({ code: 'en', messages: enMessages as any, dir: 'ltr', isDefault: true });
defineLocale({ code: 'zh', messages: zhMessages as any, dir: 'ltr' });
setLocale(getDefaultLocale());

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
