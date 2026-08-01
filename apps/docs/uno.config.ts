import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'pathe';
import { defineConfig, transformerDirectives, transformerVariantGroup } from 'unocss';
import type { Theme } from 'unocss/preset-mini';
import { presetSoybean } from '@soybeanjs/unocss-preset';
import { presetShadcn } from '@soybeanjs/unocss-shadcn';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(__dirname, 'src');

export default defineConfig<Theme>({
  content: {
    pipeline: {
      include: [/\.vue($|\?)/, /\.md($|\?)/, /\.ts($|\?)/]
    },
    filesystem: [resolve(SRC_DIR, '**/*.{vue,md,ts}')]
  },
  transformers: [transformerDirectives(), transformerVariantGroup()],
  // Dark mode strategy: 'class' (toggled via <html class="dark">).
  // presetShadcn internally calls presetWind3({ dark: 'class' }) + presetAnimations().
  // All `dark:` variants in this codebase (e.g. dark:border-border, dark:from-primary)
  // depend on this strategy. If presetShadcn's default ever changes, dark mode
  // toggling will break silently. Keep presetSoybean for its flex/grid shortcuts.
  presets: [
    presetSoybean(),
    presetShadcn({
      generated: {
        ui: true
      }
    })
  ],
  theme: {
    fontFamily: {
      sans: "'Manrope', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
    }
  },
  shortcuts: {
    // Unified docs border: light-mode uses 50% opacity for the soft frosted
    // look; dark-mode uses full opacity so borders remain visible against
    // the dark panel backgrounds. Reuse this for any panel/outline surface
    // instead of repeating the `border border-border/50 dark:border-border`
    // utility chain (P1-S1).
    'docs-border': 'border border-border/50 dark:border-border',
    'docs-card':
      'bg-card/25! border-border/50! dark:border-border! divide-border/50! dark:divide-border! rounded-xl! shadow!',
    'docs-subtle-card':
      'bg-gray-1/30! dark:bg-transparent! border border-border/50! dark:border-border! rounded-xl!',
    'docs-header-shell':
      'group fixed top-0 start-0 end-0 z-49 px-4 transition-all-800 data-[scrolled=true]:top-3 sm:px-6',
    'docs-header-frame':
      'mx-auto flex max-w-360 min-h-[--app-header-main] items-center justify-between gap-3 px-6 py-3 group-data-[scrolled=true]:min-h-0 transition-all-300 xl:gap-4'
  }
});
