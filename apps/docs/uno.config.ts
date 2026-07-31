import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'pathe';
import { defineConfig, transformerDirectives, transformerVariantGroup } from 'unocss';
import { presetSoybean } from '@soybeanjs/unocss-preset';
import { presetShadcn } from '@soybeanjs/unocss-shadcn';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(__dirname, 'src');

export default defineConfig({
  content: {
    pipeline: {
      include: [/\.vue($|\?)/, /\.md($|\?)/, /\.ts($|\?)/]
    },
    filesystem: [resolve(SRC_DIR, '**/*.{vue,md,ts}')]
  },
  transformers: [transformerDirectives(), transformerVariantGroup()],
  presets: [presetSoybean(), presetShadcn()],
  theme: {
    fontFamily: {
      sans: "'Manrope', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
    }
  },
  shortcuts: {
    'docs-header-shell':
      'group fixed top-0 start-0 end-0 z-49 px-4 transition-all-800 data-[scrolled=true]:top-3 sm:px-6',
    'docs-header-frame':
      'mx-auto flex max-w-360 min-h-[--app-header-main] items-center justify-between gap-3 px-6 py-3 group-data-[scrolled=true]:min-h-0 transition-all-300 xl:gap-4'
  }
});
