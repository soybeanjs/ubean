import { defineConfig, transformerDirectives, transformerVariantGroup } from 'unocss';
import type { Theme } from 'unocss/preset-mini';
import { presetSoybean } from '@soybeanjs/unocss-preset';
import { presetShadcn } from '@soybeanjs/unocss-shadcn';

export default defineConfig<Theme>({
  content: {
    pipeline: {
      include: [/\.vue($|\?)/]
    }
  },
  transformers: [transformerDirectives(), transformerVariantGroup()],
  presets: [
    presetSoybean(),
    presetShadcn({
      generated: {
        ui: true
      }
    })
  ],
  shortcuts: [
    {
      'devtools-root': 'h-full flex flex-col bg-background text-foreground',
      'devtools-header': 'flex items-center justify-between px-3.5 py-2.5 bg-card border-b border-border flex-shrink-0',
      'devtools-header-left': 'flex items-center gap-2.5',
      'devtools-logo':
        'size-7 rounded-lg bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center flex-shrink-0',
      'devtools-title': 'text-sm font-semibold',
      'version-badge':
        'inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold bg-primary/10 text-primary',
      'connected-badge':
        'inline-flex items-center pl-3.5 pr-2 py-0.5 rounded-full text-2xs font-semibold bg-success/12 text-success relative',
      'pulse-dot': 'absolute left-1.5 top-1/2 -translate-y-1/2 size-1.5 rounded-full bg-success animate-pulse',
      'close-btn': 'text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors',
      'devtools-body': 'flex flex-col flex-1 overflow-hidden',
      'tabs-list': 'flex gap-0.5 px-2.5 py-1.5 bg-card border-b border-border flex-shrink-0 overflow-x-auto',
      'tab-trigger':
        'inline-flex items-center gap-1.5 px-3 py-1.5 bg-transparent border-none rounded-md text-muted-foreground text-xs font-medium cursor-pointer whitespace-nowrap transition-all duration-150 hover:text-foreground data-[active=true]:bg-primary/10 data-[active=true]:text-primary',
      'tab-content-area':
        'flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-muted [&::-webkit-scrollbar-thumb]:rounded-sm',
      'tab-content': 'p-3.5',
      'stat-grid': 'grid grid-cols-2 gap-2 mb-3',
      'stat-card': 'flex items-center gap-2.5 p-3.5 bg-card border border-border rounded-lg',
      'stat-icon-wrap': 'size-9 rounded-md flex items-center justify-center flex-shrink-0',
      'stat-value': 'text-2xl font-bold leading-tight',
      'stat-label': 'text-2xs text-muted-foreground uppercase tracking-wider mt-0.5 font-medium',
      'section-card': 'bg-card border border-border rounded-lg overflow-hidden mb-2.5',
      'section-header': 'px-3.5 py-3 border-b border-border flex items-center gap-2',
      'section-title': 'text-2xs font-semibold uppercase tracking-widest text-muted-foreground',
      'section-body': 'py-1',
      'info-row': 'flex justify-between items-center px-3.5 py-2 border-b border-border/50 text-xs last:border-b-0',
      'info-key': 'text-muted-foreground',
      'info-mono': 'font-mono',
      'info-val': 'text-foreground font-medium font-mono text-2xs',
      'running-badge':
        'inline-flex items-center pl-3.5 pr-2 py-px rounded-full text-2xs font-semibold bg-success/12 text-success relative',
      'status-dot': 'absolute left-1 top-1/2 -translate-y-1/2 size-1.5 rounded-full bg-success',
      'list-wrap': 'flex flex-col gap-0.75',
      'list-item': 'flex items-center gap-2.5 px-3 py-2 bg-card border border-border/60 rounded-lg text-xs',
      'method-badge':
        'min-w-[46px] px-2 py-0.5 rounded-md text-2xs font-bold uppercase tracking-wider text-center font-mono',
      'method-get': 'bg-success/12 text-success',
      'method-post': 'bg-info/12 text-info',
      'method-put': 'bg-warning/12 text-warning',
      'method-delete': 'bg-destructive/12 text-destructive',
      'method-patch': 'bg-purple-500/12 text-purple-400',
      'method-all': 'bg-secondary text-muted-foreground',
      'route-path': 'font-mono text-foreground flex-1 text-xs truncate',
      'page-path': 'font-mono text-primary flex-1',
      'file-name': 'text-muted-foreground text-2xs font-mono',
      'global-badge': 'text-2xs px-1.5 py-0.5 bg-warning/12 text-warning rounded-md font-semibold',
      'loading-wrap': 'flex flex-col items-center justify-center py-20 px-5 gap-3.5 text-muted-foreground',
      spinner: 'size-7 border-2 border-muted border-t-primary rounded-full animate-spin',
      'loading-text': 'text-sm',
      'empty-state': 'text-center py-12 px-5 text-muted-foreground flex flex-col items-center',
      'empty-title': 'text-sm font-medium text-foreground mb-1',
      'empty-desc': 'text-xs leading-relaxed',
      'alert-error':
        'flex items-start gap-2.5 p-3 rounded-lg text-xs leading-relaxed bg-destructive/10 text-destructive border border-destructive/15'
    }
  ]
});
