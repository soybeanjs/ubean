import { defineConfig } from 'vite-plus';
import { ubeanPlugin } from 'ubean/vite';
import UnoCSS from 'unocss/vite'

// vite.config.ts presence makes ubean use this Vite config instead of defaults.
// tsconfigPaths:true enables the ~/ and @/ path aliases from tsconfig.json
// during SSR module resolution (required by component imports like ~/constants/menus).
// ubeanPlugin() reads the rest of its config from ./ubean.config.ts automatically.
export default defineConfig({
  resolve: {
    tsconfigPaths: true
  },
  plugins: [ubeanPlugin(), UnoCSS()]
});
