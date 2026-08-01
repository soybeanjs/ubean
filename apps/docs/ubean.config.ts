import { defineConfig } from 'ubean';
import { readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ubean docs — dogfoods the framework itself.
// See ./DESIGN.md for the full decision log.

const __dirname = fileURLToPath(import.meta.url).replace(/\/[^/]+$/, '');

/**
 * Walk src/content/en and src/content/zh markdown files and build concrete
 * prerender routes.
 *
 * The catch-all route is "dynamic", so `prerender.all: true` skips it. We must
 * list every content slug explicitly in `prerender.include`. Routes are derived
 * from the file tree so they stay in sync with content.
 */
function collectContentRoutes() {
  const contentDir = resolve(__dirname, 'src/content');
  const routes: string[] = [];

  function walk(dir: string, locale: 'en' | 'zh') {
    if (!statSync(dir).isDirectory()) return;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full, locale);
      } else if (entry.endsWith('.md')) {
        const rel = relative(join(contentDir, locale), full).replace(/\\/g, '/');
        let slug = rel.replace(/\.md$/, '');
        // index.md → root path
        if (slug === 'index') slug = '';
        const route = locale === 'zh' ? `/zh/${slug}` : `/${slug}`;
        routes.push(route);
      }
    }
  }

  try {
    walk(join(contentDir, 'en'), 'en');
    walk(join(contentDir, 'zh'), 'zh');
  } catch {
    // Content dir may not exist during initial scaffold.
  }

  // Add API reference routes (7 curated packages).
  for (const pkg of ['ubean', 'runtime', 'routing', 'config', 'auth', 'ui', 'pinia']) {
    routes.push(`/reference/api/${pkg}`);
  }

  return routes;
}

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
  // wrapperClass (D21): rename the inner wrapper to `.markdown-wrapper` so the
  // ported `markdown.css` styles (scoped to `.markdown-wrapper`) apply.
  markdown: {
    enabled: true,
    theme: { light: 'one-light', dark: 'one-dark-pro' },
    wrapperClass: 'markdown-wrapper'
  },

  // Color mode (D20): keep ubean's built-in no-flash script + useColorMode()
  // composable, but align the storageKey + classSuffix with @soybeanjs/ui
  // shadcn (which expects a bare `.dark` class, not `dark-mode`). The custom
  // inline script in app.ts reads the same key + sets the same class as a
  // belt-and-suspenders for SSG prerendered output.
  colorMode: {
    preference: 'system',
    classSuffix: '',
    storageKey: 'ubean_color_mode',
    cookieName: 'ubean_color_mode',
    fallback: 'light'
  },

  // SSG: the [...slug] catch-all is "dynamic" so `all: true` skips it.
  // Use `all: false` + `include` with every content slug (derived from the
  // file tree above) + the home page. crawlLinks catches anything we missed.
  prerender: {
    all: false,
    include: ['/', '/zh', ...collectContentRoutes()],
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
