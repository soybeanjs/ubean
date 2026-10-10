import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import Vue from '@vitejs/plugin-vue';
import Unocss from 'unocss/vite';
import { dirname, resolve } from 'pathe';

const root = resolve(dirname(fileURLToPath(import.meta.url)));

/**
 * Standalone build config for the DevTools iframe SPA.
 *
 * Produces separate static files (index.html + assets/*.js + assets/*.css)
 * under `dist/client/`. The devframe hub hosts these at the devframe's mount
 * base (default `/_devtools/`) — no inlining, no `</script>` escaping issues.
 * This mirrors the Nuxt DevTools architecture (sirv-based static serving).
 */
export default defineConfig({
  root,
  // devframe 要求 SPA 产物用**相对** base：mount base 由 hub 决定（默认 `/_devtools/`，
  // 可被 `devtools.route` 改），绝对 base 会让换前缀后白屏。
  base: './',
  plugins: [
    Unocss({
      configFile: resolve(root, 'uno.config.ts')
    }),
    Vue()
  ],
  build: {
    // Output to <package>/dist/client so the server bundle (dist/index.js) and
    // the client assets share the same dist tree — runtime path resolution uses
    // `resolve(dirname(fileURLToPath(import.meta.url)), 'client')`.
    outDir: resolve(root, '../dist/client'),
    emptyOutDir: true,
    assetsDir: 'assets',
    rollupOptions: {
      input: resolve(root, 'index.html'),
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production')
  }
});
