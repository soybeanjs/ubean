import { fileURLToPath } from 'node:url';
import { defineConfig, transformerDirectives, transformerVariantGroup } from 'unocss';
import { presetSoybean } from '@soybeanjs/unocss-preset';
import { presetShadcn } from '@soybeanjs/unocss-shadcn';
import { dirname, resolve } from 'pathe';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, 'app');

export default defineConfig({
  content: {
    pipeline: {
      include: [/\.vue($|\?)/]
    },
    filesystem: [resolve(APP_DIR, '**/*.vue')]
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
});
