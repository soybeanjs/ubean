import { defineApp, configureColorMode, setLocale, getLocale } from 'ubean/runtime/vue';
import '@fontsource-variable/manrope';
import 'uno.css';
import './styles/global.css';

// No-flash color-mode script is auto-injected by ubean's vite plugin
// (packages/vite/src/plugin.ts:178-181) via getColorModeScript(), reading the
// `colorMode` config block in ubean.config.ts (storageKey='ubean_color_mode',
// classSuffix='' → bare `.dark` class). No custom script needed here.
//
// HOWEVER, the client-side `useColorMode()` composable keeps its own copy of
// the config (module-level `_config`, defaulting to classSuffix='-mode'). If
// we don't sync it here, `applyModeToDom()` adds/removes `dark-mode` while the
// no-FOUC script added the bare `dark` class — so toggling never strips
// `dark` and the background stays dark. Mirror the ubean.config.ts block here.
configureColorMode({
  preference: 'system',
  classSuffix: '',
  storageKey: 'ubean_color_mode',
  cookieName: 'ubean_color_mode',
  fallback: 'light'
});

export default defineApp({
  head: {
    title: 'ubean - Full-stack Vue Meta-framework',
    meta: [
      { name: 'description', content: 'ubean is a full-stack Vue meta-framework built on Vite, Hono and Vue.' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' }
    ],
    htmlAttrs: { lang: 'en' }
  },
  rootId: 'app',
  // Sync the i18n locale from the URL path on every client-side navigation.
  // The server-side i18n middleware sets the locale for SSR/SSG, but SPA
  // navigations (e.g. clicking the locale toggle) bypass the server. Without
  // this guard, useI18n().locale stays stale after navigating to /zh, causing
  // the toolbar toggle to display the wrong label.
  router: {
    setup(router) {
      router.beforeEach((to) => {
        const target = to.path === '/zh' || to.path.startsWith('/zh/') ? 'zh' : 'en';
        if (target !== getLocale()) {
          setLocale(target);
        }
      });
    }
  }
});
