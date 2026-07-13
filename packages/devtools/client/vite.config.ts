import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { transformerDirectives, transformerVariantGroup } from 'unocss';
import Unocss from 'unocss/vite';
import { presetSoybean } from '@soybeanjs/unocss-preset';
import { presetShadcn } from '@soybeanjs/unocss-shadcn';
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
      content: {
        pipeline: {
          include: [/\.vue($|\?)/]
        },
        filesystem: [resolve(root, '**/*.vue')]
      },
      transformers: [transformerDirectives(), transformerVariantGroup()],
      presets: [
        presetSoybean(),
        presetShadcn({
          generated: {
            reset: true,
            global: true,
            ui: true
          }
        })
      ],
      shortcuts: [
        {
          'close-btn': 'text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors',
          'section-card': 'bg-card border border-border rounded-lg overflow-hidden mb-2.5',
          'section-header': 'px-3.5 py-2.5 border-b border-border flex items-center gap-2',
          'section-title': 'text-[10px] font-semibold uppercase tracking-widest text-muted-foreground',
          'section-body': 'py-0.5',
          'info-row': 'flex justify-between items-center px-3.5 py-2 border-b border-border/50 text-xs last:border-b-0',
          'info-key': 'text-muted-foreground',
          'info-val': 'text-foreground font-medium font-mono text-[11px]',
          'list-item':
            'flex items-center gap-2.5 px-3 py-2 bg-card border border-border/60 rounded-lg text-xs hover:bg-secondary/30 transition-colors',
          'file-name': 'text-muted-foreground text-[10px] font-mono truncate',
          'empty-state': 'text-center py-12 px-5 text-muted-foreground flex flex-col items-center',
          'empty-title': 'text-sm font-medium text-foreground mb-1',
          'empty-desc': 'text-xs leading-relaxed'
        }
      ],
      safelist: [
        'bg-primary/10',
        'bg-success/12',
        'bg-warning/12',
        'bg-info/12',
        'bg-destructive/12',
        'bg-accent/10',
        'bg-purple-500/12',
        'bg-secondary',
        'text-primary',
        'text-success',
        'text-warning',
        'text-info',
        'text-destructive',
        'text-accent',
        'text-purple-400',
        'text-muted-foreground'
      ]
    }),
    vue()
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
