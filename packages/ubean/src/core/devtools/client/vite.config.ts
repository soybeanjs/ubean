import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import Unocss from 'unocss/vite';
import { transformerDirectives, transformerVariantGroup } from 'unocss';
import { presetSoybean } from '@soybeanjs/unocss-preset';
import { presetShadcn } from '@soybeanjs/unocss-shadcn';

export function createDevtoolsViteConfig(rootDir: string) {
  return defineConfig({
    root: rootDir,
    plugins: [
      Unocss({
        content: {
          pipeline: {
            include: [/\.vue($|\?)/]
          },
          filesystem: [`${rootDir}/**/*.vue`]
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
      vue(),
      inlineAssetsPlugin()
    ],
    build: {
      outDir: 'dist/devtools-client',
      emptyOutDir: true,
      assetsInlineLimit: 100000000,
      cssCodeSplit: false,
      modulePreload: false,
      rollupOptions: {
        input: `${rootDir}/index.html`,
        output: {
          inlineDynamicImports: true
        }
      }
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify('production')
    }
  });
}

function inlineAssetsPlugin() {
  return {
    name: 'inline-devtools-assets',
    enforce: 'post' as const,
    generateBundle(
      _options: unknown,
      bundle: Record<string, { type: string; source?: string; code?: string; fileName: string }>
    ) {
      let jsCode = '';
      let cssCode = '';

      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'asset' && fileName.endsWith('.css')) {
          cssCode += chunk.source || '';
          delete bundle[fileName];
        }
        if (chunk.type === 'chunk' && (fileName.endsWith('.js') || fileName.endsWith('.mjs'))) {
          jsCode += chunk.code || '';
          delete bundle[fileName];
        }
      }

      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'asset' && fileName.endsWith('.html')) {
          let html = chunk.source as string;
          html = html.replace(/<script[^>]*src=["'][^"']*["'][^>]*><\/script>/g, '');
          html = html.replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/g, '');
          if (cssCode) {
            html = html.replace('</head>', `<style>${cssCode}</style></head>`);
          }
          if (jsCode) {
            html = html.replace('</body>', `<script>${jsCode}</script></body>`);
          }
          chunk.source = html;
          chunk.fileName = 'index.html';
        }
      }
    }
  };
}
