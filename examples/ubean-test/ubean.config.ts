import { defineConfig } from 'ubean';

export default defineConfig({
  i18n: {
    defaultLocale: 'en',
    locales: [
      { code: 'en', language: 'en', name: 'English' },
      { code: 'zh', language: 'zh-CN', name: '中文', dir: 'ltr' }
    ],
    strategy: 'prefix_except_default'
  },
  devtools: true,
  prerender: {
    include: ['/about']
  }
});
