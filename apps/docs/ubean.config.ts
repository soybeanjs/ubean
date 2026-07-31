import { defineConfig } from 'ubean';

// ubean docs — dogfoods the framework itself.
// See ./DESIGN.md for the full decision log.
export default defineConfig({
  mode: 'ssg',
  srcDir: 'src',

  // @ubean/ui in UnoCSS mode (no styles.css injection). uno.config.ts carries
  // presetSoybean + presetShadcn, mirroring the ubean DevTools styling convention.
  ui: { css: false },

  // Built-in zero-dependency i18n (NOT vue-i18n). EN is default (unprefixed),
  // zh-CN prefixed under /zh/*. Content is per-locale (see src/content/{en,zh}).
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'zh'],
    strategy: 'prefix_except_default',
    detectBrowserLocale: false
  },

  // Markdown pages: enable shiki themes for fence highlighting.
  markdown: {
    enabled: true,
    theme: { light: 'one-light', dark: 'one-dark-pro' }
  },

  // Color mode: produce `.dark` class on <html> (matches @soybeanjs/ui shadcn).
  colorMode: {
    preference: 'system',
    classSuffix: '',
    fallback: 'light'
  },

  // SSG: prerender all non-dynamic pages. The /zh/* mirror is crawled from links.
  prerender: {
    all: true,
    crawlLinks: true,
    failOnError: false
  },

  // Type-safe auto-imports for composables + components.
  imports: {
    autoImport: true,
    dirs: ['src/composables']
  },
  components: {
    autoImport: true,
    dirs: ['src/components']
  }
});
