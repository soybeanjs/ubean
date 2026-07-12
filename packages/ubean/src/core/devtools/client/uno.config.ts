import { defineConfig, transformerDirectives, transformerVariantGroup } from 'unocss';
import type { Theme } from 'unocss/preset-mini';
import { presetSoybean } from '@soybeanjs/unocss-preset';
import { presetShadcn } from '@soybeanjs/unocss-shadcn';
import { dirname, resolve } from 'pathe';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, 'app');

export default defineConfig<Theme>({
  content: {
    pipeline: {
      include: [/\.vue($|\?)/]
    },
    filesystem: [
      resolve(APP_DIR, '**/*.vue')
    ]
  },
  transformers: [transformerDirectives(), transformerVariantGroup()],
  presets: [
    presetSoybean(),
    ...presetShadcn({
      base: 'zinc',
      primary: 'indigo',
      radius: 'md',
      dark: true,
      darkSelector: 'class',
      generated: {
        reset: true,
        global: true,
        ui: true
      }
    })
  ],
  theme: {
    colors: {
      info: 'hsl(var(--info))',
      'info-foreground': 'hsl(var(--info-foreground))',
      warning: 'hsl(var(--warning))',
      'warning-foreground': 'hsl(var(--warning-foreground))',
      success: 'hsl(var(--success))',
      'success-foreground': 'hsl(var(--success-foreground))'
    }
  },
  shortcuts: [
    {
      'devtools-root': 'h-full flex flex-col bg-background text-foreground',
      'devtools-header': 'flex items-center justify-between px-3.5 py-2.5 bg-card border-b border-border flex-shrink-0',
      'devtools-header-left': 'flex items-center gap-2.5',
      'devtools-logo': 'size-7 rounded-lg bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center flex-shrink-0',
      'devtools-title': 'text-sm font-semibold',
      'version-badge': 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary',
      'connected-badge': 'inline-flex items-center pl-3.5 pr-2 py-0.5 rounded-full text-[10px] font-semibold bg-success/12 text-success relative',
      'pulse-dot': 'absolute left-1.5 top-1/2 -translate-y-1/2 size-1.5 rounded-full bg-success animate-pulse',
      'close-btn': 'text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors',
      'devtools-body': 'flex flex-col flex-1 overflow-hidden',
      'tabs-list': 'flex gap-0.5 px-2.5 py-1.5 bg-card border-b border-border flex-shrink-0 overflow-x-auto',
      'tab-trigger': 'inline-flex items-center gap-1.5 px-3 py-1.5 bg-transparent border-none rounded-md text-muted-foreground text-xs font-medium cursor-pointer whitespace-nowrap transition-all duration-150 hover:text-foreground data-[active=true]:bg-primary/10 data-[active=true]:text-primary',
      'tab-content-area': 'flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-muted [&::-webkit-scrollbar-thumb]:rounded-sm',
      'stat-grid': 'grid grid-cols-4 gap-2 mb-3',
      'stat-card': 'flex items-center gap-2.5 p-3 bg-card border border-border rounded-lg',
      'stat-icon-wrap': 'size-9 rounded-md flex items-center justify-center flex-shrink-0',
      'stat-value': 'text-xl font-bold leading-tight',
      'stat-label': 'text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5 font-medium',
      'section-card': 'bg-card border border-border rounded-lg overflow-hidden mb-2.5',
      'section-header': 'px-3.5 py-2.5 border-b border-border flex items-center gap-2',
      'section-title': 'text-[10px] font-semibold uppercase tracking-widest text-muted-foreground',
      'section-body': 'py-0.5',
      'info-row': 'flex justify-between items-center px-3.5 py-2 border-b border-border/50 text-xs last:border-b-0',
      'info-key': 'text-muted-foreground',
      'info-val': 'text-foreground font-medium font-mono text-[11px]',
      'running-badge': 'inline-flex items-center pl-3.5 pr-2 py-px rounded-full text-[10px] font-semibold bg-success/12 text-success relative',
      'status-dot': 'absolute left-1 top-1/2 -translate-y-1/2 size-1.5 rounded-full bg-success animate-pulse',
      'list-item': 'flex items-center gap-2.5 px-3 py-2 bg-card border border-border/60 rounded-lg text-xs hover:bg-secondary/30 transition-colors',
      'method-badge': 'min-w-[46px] px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider text-center font-mono',
      'method-get': 'bg-success/12 text-success',
      'method-post': 'bg-info/12 text-info',
      'method-put': 'bg-warning/12 text-warning',
      'method-delete': 'bg-destructive/12 text-destructive',
      'method-patch': 'bg-purple-500/12 text-purple-400',
      'method-all': 'bg-secondary text-muted-foreground',
      'route-path': 'font-mono text-foreground flex-1 text-xs truncate',
      'page-path': 'font-mono text-primary flex-1 text-xs',
      'file-name': 'text-muted-foreground text-[10px] font-mono truncate',
      'global-badge': 'text-[10px] px-1.5 py-0.5 bg-warning/12 text-warning rounded-md font-semibold',
      'loading-wrap': 'flex flex-col items-center justify-center py-20 px-5 gap-3.5 text-muted-foreground',
      'spinner': 'size-7 border-2 border-muted border-t-primary rounded-full animate-spin',
      'loading-text': 'text-sm',
      'empty-state': 'text-center py-12 px-5 text-muted-foreground flex flex-col items-center',
      'empty-title': 'text-sm font-medium text-foreground mb-1',
      'empty-desc': 'text-xs leading-relaxed',
      'alert-error': 'flex items-start gap-2.5 p-3 rounded-lg text-xs leading-relaxed bg-destructive/10 text-destructive border border-destructive/15'
    }
  ],
  safelist: [
    'bg-primary/10', 'bg-success/12', 'bg-warning/12', 'bg-info/12', 'bg-destructive/12', 'bg-accent/10',
    'text-primary', 'text-success', 'text-warning', 'text-info', 'text-destructive', 'text-accent',
    'text-purple-400', 'bg-purple-500/12'
  ]
});
