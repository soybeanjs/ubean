import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { defineConfig, transformerDirectives, transformerVariantGroup } from 'unocss';
import type { Theme } from 'unocss/preset-mini';
import { presetSoybean } from '@soybeanjs/unocss-preset';
import { presetUi } from '@vean/unocss';

const require = createRequire(import.meta.url);

/**
 * `@vean/ui` ships its component styles as class strings inside compiled JS, and
 * UnoCSS only generates utilities for class names it actually *scans*. This app
 * consumes the published package rather than its source, so the package's own
 * dist must be part of the scan set — otherwise every component-internal utility
 * (`bg-popover`, `-translate-y-1/2`, `z-base`, …) is absent and components render
 * unstyled or mispositioned (the search dialog landed at document-half height
 * because its `-translate-y-1/2` was never generated).
 *
 * The reference docs site sidesteps this by aliasing `@` at the UI package's
 * *source*; the equivalent for a published dependency is scanning its dist.
 *
 * Resolved through the package's own entry (its exports map is a `./*` wildcard,
 * so resolving `package.json` lands on the wrong path).
 */
const veanUiDist = resolve(dirname(require.resolve('@vean/ui')), '..');

export default defineConfig<Theme>({
  content: {
    pipeline: {
      /**
       * The scan filter. UnoCSS *always* filters filesystem candidates through
       * this list (its own default is `[/\.vue$/]`), so a `.vue`-only include
       * silently discards every scanned `.js` — the scan runs and extracts
       * nothing. `.js` is required here for the `@vean/ui` dist above.
       */
      include: [/\.vue($|\?)/, /\.js($|\?)/]
    },
    filesystem: [`${veanUiDist}/**/*.js`]
  },
  transformers: [transformerDirectives(), transformerVariantGroup()],
  presets: [
    presetSoybean(),
    presetUi({
      resetCSS: true,
      globalCSS: true,
      uiCSS: true
    })
  ],
  shortcuts: {
    'docs-card': `bg-card/25! border-border/50! dark:border-border! divide-border/50! dark:divide-border! rounded-xl! shadow!`,
    'docs-subtle-card': `bg-gray-1/30! dark:bg-transparent! border border-border/50! dark:border-border! rounded-xl!`
  }
});
