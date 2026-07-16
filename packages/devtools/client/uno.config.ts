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
  presets: [presetSoybean(), presetShadcn()],
  theme: {
    fontFamily: {
      sans: "'DM Sans', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      mono: "'DM Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    }
  },
  shortcuts: [
    {
      // --- Vite DevTools semantic tokens (mirror @vitejs/devtools-ui) ---
      // Concrete light/dark values so panels render identically to the Vite
      // built-in panels regardless of shadcn token resolution.
      'bg-secondary': 'bg-#eee dark:bg-#222',
      'bg-active': 'bg-#8881',
      'bg-glass': 'bg-white:50 dark:bg-#111:50 backdrop-blur-7',
      'bg-tooltip': 'bg-white:75 dark:bg-#111:75 backdrop-blur-8',
      'bg-code': 'bg-gray-500:5',
      'border-base': 'border-#8882',
      'border-flow': 'border-#8885',
      'border-active': 'border-primary-600/25 dark:border-primary-400/25',
      'ring-base': 'ring-#8882',
      'color-base': 'color-neutral-800 dark:color-neutral-200',
      'color-active': 'color-primary-600 dark:color-primary-300',

      // Action buttons (Vite `btn-action` shape)
      'btn-action':
        'border border-base rounded flex gap-2 items-center px2 py1 op75 hover:op100 hover:bg-active disabled:pointer-events-none disabled:op30! cursor-pointer',
      'btn-action-sm': 'btn-action text-sm',
      'btn-action-active': 'color-active border-active! bg-active op100!',

      // Opacity helpers
      'op-fade': 'op65 dark:op55',
      'op-mute': 'op30 dark:op25',

      // z-index layers (Vite panel scale)
      'z-panel-nav': 'z-60',
      'z-panel-content': 'z-65',
      'z-panel-goto': 'z-70',
      'z-panel-terminal': 'z-80',

      // Severity / status color scales
      'color-scale-neutral': 'text-gray-700:75 dark:text-gray-300:75!',
      'color-scale-low': 'text-lime-700:75 dark:text-lime-300:75! dark:saturate-50',
      'color-scale-medium': 'text-amber-700:85 dark:text-amber-300:85! dark:saturate-80',
      'color-scale-high': 'text-orange-700:95 dark:text-orange-300:95!',
      'color-scale-critical': 'text-red-700:95 dark:text-red-300:95!',

      // --- ubean structural shortcuts (re-aligned to Vite tokens) ---
      'close-btn': 'text-muted-foreground hover:text-foreground hover:bg-active transition-colors',
      'section-card': 'bg-background border border-base rounded-lg overflow-hidden mb-2.5',
      'section-header': 'px-3.5 py-2 border-b border-base flex items-center gap-2',
      'section-title': 'text-[10px] font-semibold uppercase tracking-widest text-muted-foreground',
      'section-body': 'py-0.5',
      'info-row': 'flex justify-between items-center px-3.5 py-2 border-b border-base text-xs last:border-b-0',
      'info-key': 'text-muted-foreground',
      'info-val': 'text-foreground font-medium font-mono text-[11px]',
      'list-item':
        'flex items-center gap-2.5 px-2.5 py-1.5 bg-background border border-base rounded-lg text-xs hover:bg-active transition-colors',
      'file-name': 'text-muted-foreground text-[10px] font-mono truncate',
      'empty-state': 'text-center py-12 px-5 text-muted-foreground flex flex-col items-center',
      'empty-title': 'text-sm font-medium text-foreground mb-1',
      'empty-desc': 'text-xs leading-relaxed',

      // Filter chip / sub-tab toggle (Vite style: gray active surface)
      'filter-chip': 'px-2.5 py-1 rounded-md text-2xs font-medium transition-all cursor-pointer border-none',
      'filter-chip-active': 'bg-active color-active op100!',
      'filter-chip-idle': 'text-muted-foreground hover:text-foreground hover:bg-active op-fade hover:op100',

      // Count pill (Vite bottom-center counter)
      'count-pill':
        'fixed bottom-4 py-1 px-2 bg-glass border border-base rounded-full text-center text-2xs text-muted-foreground z-panel-nav'
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
    'bg-active',
    'bg-glass',
    'bg-background',
    'text-primary',
    'text-success',
    'text-warning',
    'text-info',
    'text-destructive',
    'text-accent',
    'text-purple-400',
    'text-muted-foreground',
    'color-active',
    'border-base',
    'border-active',
    'op-fade'
  ]
});
