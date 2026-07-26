import { defineConfig } from 'ubean';

export default defineConfig({
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'zh'],
    strategy: 'prefix_except_default'
  },
  devtools: true,
  prerender: {
    include: ['/about']
  }
});
