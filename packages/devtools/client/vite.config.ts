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
 * under `dist/client/`. The server middleware serves these at
 * `/__ubean_devtools__/client/` — no inlining, no `</script>` escaping issues.
 * This mirrors the Nuxt DevTools architecture (sirv-based static serving).
 */
export default defineConfig({
  root,
  base: '/__ubean_devtools__/client/',
  plugins: [
    Unocss({
      configFile: resolve(root, 'uno.config.ts')
    }),
    Vue()
  ],
  build: {
    // Output to <package>/dist/client so the server bundle (dist/index.mjs) and
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
