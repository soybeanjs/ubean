import { resolve } from 'node:path';
import { defineConfig } from 'vite-plus';
import { ubeanPlugin } from 'ubean/vite';
import UnoCSS from 'unocss/vite';
import { docsLlmsPlugin } from './build/llms';

export default defineConfig({
  resolve: {
    // Enables the `~/` and `@/` aliases from tsconfig.json during SSR resolution.
    tsconfigPaths: true,
    alias: {
      '~': resolve(__dirname, './src')
    }
  },
  plugins: [ubeanPlugin(), UnoCSS(), docsLlmsPlugin()],
  optimizeDeps: {
    exclude: ['@vean/ui', '@vean/aria']
  }
});
