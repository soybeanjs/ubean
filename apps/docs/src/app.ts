import { defineApp } from 'ubean/client';
import { progress } from '@vean/ui';
import 'uno.css';
import { docsFontLinks } from './shared/fonts';
import './styles/global.css';

export default defineApp({
  rootId: 'app',
  head: {
    title: 'ubean Documentation',
    htmlAttrs: { lang: 'en' },
    meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1.0' }],
    // The theme engine can swap `--font-*` at runtime, so every family it can
    // select has to be loaded up front — see `shared/fonts.ts`.
    link: docsFontLinks
    // 首帧主题脚本由 `ui` 模块自动注入（`@vean/theme` 的 `createThemeInitScript`），
    // 这里再手动加一份会在 `<head>` 里出现两次 —— 同一段脚本执行两遍，
    // 且后一份可能落在阻塞样式表之后（迟于首帧）。
  },
  router: {
    setup(router) {
      router.beforeEach((to, from) => {
        // Skip the initial navigation: the first page is already SSR-rendered,
        // so running progress before hydration mutates the provider's inline
        // style and triggers a hydration style mismatch.
        if (from.matched.length > 0 && to.path !== from.path) {
          progress.start();
        }
      });

      router.afterEach(() => {
        progress.done();
      });
    }
  }
});
