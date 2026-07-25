import { defineConfig } from 'vite-plus';
import { ubeanPlugin } from 'ubean/vite';

export default defineConfig({
  resolve: {
    tsconfigPaths: true
  },
  plugins: [ubeanPlugin()]
});
